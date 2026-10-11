// 서버 전용. 멤버 출발지를 기준으로 추천 역을 계산한다.
// /api/location/recommend(실제 추천)와 /api/location/recommend/debug(개발용 테스트 페이지)가 함께 쓴다.
//
//  1. 전국 역(공공데이터) 각각에 대해 "가장 먼 멤버까지의 직선거리"를 구해 짧은 순으로 PREFILTER_COUNT개
//  2. 직선거리가 최선값과 비슷한(STRAIGHT_TOLERANCE_METERS 이내) 역들은 환승 노선 수·상권이 큰 순으로 앞세우고,
//     반경 VENUE_RADIUS_METERS 안 음식점+카페 수가 MIN_VENUES 미만인 역은 뒤로 보낸다
//  3. 앞에서부터 TRANSIT_CANDIDATES개 역 × 멤버 전원의 대중교통 이동시간 조회
//  4. 최대 이동시간이 최선값 + 허용치 안인 역들을 같은 수준으로 보고, 그 안에서 이동시간 합이 작은 순
//
// 음식점·카페 수와 이동시간은 카카오 API 응답이라 저장하지 않고 이 요청 안에서만 쓴다.

import { distanceMeters, type LatLng } from "@/utils/geo";
import { mapWithConcurrency } from "@/utils/concurrency";
import { countCategoryPlaces } from "@/utils/kakao/local";
import { fetchTransitMinutes } from "@/utils/kakao/transit";
import stationsData from "@/data/stations.json";

export const RECOMMEND_PARAMS = {
  PREFILTER_COUNT: 16,
  TRANSIT_CANDIDATES: 8,
  RESULT_COUNT: 5,
  // 직선거리 1km 안팎 차이는 실제 이동시간을 가르지 못하므로, 이 범위 안에서는 허브 역을 우선한다
  // (직선거리 순으로만 자르면 왕십리·신당 같은 환승 허브가 이동시간 조회 전에 탈락했음)
  STRAIGHT_TOLERANCE_METERS: 1500,
  VENUE_RADIUS_METERS: 500,
  MIN_VENUES: 30,
  TRANSIT_CONCURRENCY: 5,
  // 최대 이동시간이 최선값보다 이만큼(분, 또는 비율 중 큰 쪽) 길어도 같은 수준으로 본다
  TOLERANCE_MINUTES: 5,
  TOLERANCE_RATIO: 0.1,
};

const P = RECOMMEND_PARAMS;

export interface Station {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
}

const stations = stationsData.stations as Station[];

// 1차 후보 역 하나가 각 단계에서 어떻게 처리됐는지
export interface CandidateTrace {
  station: Station;
  // 가장 먼 멤버까지의 직선거리
  maxMeters: number;
  // 직선거리가 최선값과 비슷해서 허브 우선 정렬 대상이었는지
  nearBest: boolean;
  // 반경 안 음식점+카페 수. 조회 실패면 null (통과로 처리)
  venues: number | null;
  venueLow: boolean;
  // 이동시간 조회 대상이었는지 (정렬 후 앞에서 TRANSIT_CANDIDATES개)
  queried: boolean;
  // 멤버 순서대로 이동시간(분). 경로 없음은 null
  transitMinutes: (number | null)[] | null;
  maxMinutes: number | null;
  sumMinutes: number | null;
  inTolerance: boolean;
  // 최종 순위(1부터). 이동시간 조회를 안 했거나 갈 수 없는 멤버가 있으면 null
  rank: number | null;
}

export interface RecommendTrace {
  // 1차 후보를 2단계 정렬 순서대로
  candidates: CandidateTrace[];
  bestMeters: number;
  // 허용 범위 상한(분). 갈 수 있는 역이 없으면 null
  limitMinutes: number | null;
  calls: { local: number; transit: number };
}

export interface RecommendResult {
  // 상위 RESULT_COUNT개 (갈 수 있는 역이 없으면 빈 배열)
  top: Station[];
  trace: RecommendTrace;
}

// 쿼터 초과 시 KakaoQuotaExceededError를 던진다
export async function recommendStations(
  members: LatLng[],
): Promise<RecommendResult> {
  // 1. 직선거리 1차 필터
  const nearest = stations
    .map((station) => ({
      station,
      maxMeters: Math.max(...members.map((m) => distanceMeters(station, m))),
    }))
    .sort((a, b) => a.maxMeters - b.maxMeters)
    .slice(0, P.PREFILTER_COUNT);

  // 2. 상권 조회 + 허브 우선 정렬
  const venueCounts = await Promise.all(
    nearest.map(async ({ station }) => {
      const [food, cafe] = await Promise.all([
        countCategoryPlaces(station.lat, station.lng, P.VENUE_RADIUS_METERS, "FD6"),
        countCategoryPlaces(station.lat, station.lng, P.VENUE_RADIUS_METERS, "CE7"),
      ]);
      return food === null || cafe === null ? null : food + cafe;
    }),
  );
  const bestMeters = nearest[0].maxMeters;
  const candidates: CandidateTrace[] = nearest
    .map((n, i) => {
      const venues = venueCounts[i];
      return {
        ...n,
        nearBest: n.maxMeters <= bestMeters + P.STRAIGHT_TOLERANCE_METERS,
        venues,
        venueLow: venues !== null && venues < P.MIN_VENUES,
        queried: false,
        transitMinutes: null,
        maxMinutes: null,
        sumMinutes: null,
        inTolerance: false,
        rank: null,
      };
    })
    .sort((a, b) => {
      // 상권 부족은 맨 뒤, 그다음 비슷한 거리 그룹 → 나머지 순
      if (a.venueLow !== b.venueLow) return a.venueLow ? 1 : -1;
      if (a.nearBest !== b.nearBest) return a.nearBest ? -1 : 1;
      if (!a.nearBest) return a.maxMeters - b.maxMeters;
      return (
        b.station.lines.length - a.station.lines.length ||
        (b.venues ?? 0) - (a.venues ?? 0)
      );
    });

  // 3. 이동시간 조회 ((후보 × 멤버) 쌍 전체)
  const queried = candidates.slice(0, P.TRANSIT_CANDIDATES);
  const pairs = queried.flatMap((c) => members.map((m) => ({ c, m })));
  const pairMinutes = await mapWithConcurrency(
    pairs,
    P.TRANSIT_CONCURRENCY,
    ({ c, m }) => fetchTransitMinutes(m, c.station),
  );
  queried.forEach((c, ci) => {
    const times = pairMinutes.slice(ci * members.length, (ci + 1) * members.length);
    c.queried = true;
    c.transitMinutes = times;
    // 한 명이라도 갈 수 없는 역은 순위에서 제외한다
    if (times.some((t) => t === null)) return;
    const valid = times as number[];
    c.maxMinutes = Math.max(...valid);
    c.sumMinutes = valid.reduce((a, b) => a + b, 0);
  });

  // 4. 순위: 허용 범위 안이면 합이 작은 순(동점이면 상권이 큰 순), 그 밖은 최대 이동시간 순
  const scored = queried.filter((c) => c.maxMinutes !== null) as (CandidateTrace & {
    maxMinutes: number;
    sumMinutes: number;
  })[];
  let limitMinutes: number | null = null;
  if (scored.length > 0) {
    const best = Math.min(...scored.map((s) => s.maxMinutes));
    const limit = best + Math.max(P.TOLERANCE_MINUTES, Math.round(best * P.TOLERANCE_RATIO));
    limitMinutes = limit;
    scored.forEach((s) => (s.inTolerance = s.maxMinutes <= limit));
    const inRange = scored
      .filter((s) => s.inTolerance)
      .sort((a, b) => a.sumMinutes - b.sumMinutes || (b.venues ?? 0) - (a.venues ?? 0));
    const outOfRange = scored
      .filter((s) => !s.inTolerance)
      .sort((a, b) => a.maxMinutes - b.maxMinutes || a.sumMinutes - b.sumMinutes);
    [...inRange, ...outOfRange].forEach((s, i) => (s.rank = i + 1));
  }

  const top = candidates
    .filter((c) => c.rank !== null && c.rank <= P.RESULT_COUNT)
    .sort((a, b) => a.rank! - b.rank!)
    .map((c) => c.station);

  return {
    top,
    trace: {
      candidates,
      bestMeters,
      limitMinutes,
      calls: { local: nearest.length * 2, transit: pairs.length },
    },
  };
}
