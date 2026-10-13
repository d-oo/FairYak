// 서버 전용. 멤버 출발지를 기준으로 추천 역을 계산한다.
// /api/location/recommend(실제 추천)와 /api/location/recommend/debug(개발용 테스트 페이지)가 함께 쓴다.
//
// [1단계: 직선거리 기준]
//  1. 전국 역(공공데이터) 각각에 대해 "가장 먼 멤버까지의 직선거리"를 구해 짧은 순으로 PREFILTER_COUNT개
//  2. 직선거리가 최선값과 비슷한(STRAIGHT_TOLERANCE_METERS 이내) 역들은 멤버 출발지 근처 노선과 직결되는 멤버 수,
//     환승 노선 수, 상권이 큰 순으로 앞세우고,
//     반경 VENUE_RADIUS_METERS 안 음식점+카페 수가 MIN_VENUES 미만인 역은 후보에서 뺀다
//     (밥 먹고 차 마실 곳이 없으면 모임 장소로 쓸 수 없으므로 순위에 올리지 않고 이동시간도 조회하지 않는다)
//  3. 남은 역 중 앞에서부터 TRANSIT_CANDIDATES개 역 × 멤버 전원의 대중교통 이동시간 조회
// [2단계: 멤버별 속도 보정]
//  4. 1단계 결과로 멤버마다 "직선 1km당 몇 분"인지 추정한다. 같은 거리라도 역에서 먼 동네에 사는 멤버는
//     더 오래 걸리므로, 직선거리 중앙만 보면 후보가 빠른 멤버 쪽으로 치우친다.
//  5. 전국 역을 "추정 최대 이동시간"(직선거리 × 멤버별 속도의 최대값) 순으로 다시 세워, 아직 조회하지 않은
//     상위 REFINE_POOL개 중 상권 기준을 통과한 REFINE_CANDIDATES개를 추가로 조회한다
// [순위]
//  6. 점수 = 최대 이동시간 + SCORE_AVG_WEIGHT × 평균 이동시간 이 낮은 순
//     (가장 오래 걸리는 멤버를 우선하되 전원의 이동시간도 항상 반영. 예전의 "허용 범위 안이면 합,
//      밖이면 최대" 방식은 경계에서 1분 차이로 순위가 뒤집혀서 바꿨다)
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
  // 허브 우선 그룹 안에서는 노선 수보다 "멤버 출발지 근처 노선과 직결되는지"를 먼저 본다
  // (노선이 많은 환승역이 멤버들의 노선과 안 겹치면, 노선 하나뿐이지만 직결되는 역보다 느리다).
  // 출발지에서 이 반경 안의 역 노선을 그 멤버의 노선으로 본다. 반경 안에 역이 없는 멤버는 세지 않는다
  MEMBER_STATION_RADIUS_METERS: 1000,
  VENUE_RADIUS_METERS: 500,
  MIN_VENUES: 30,
  TRANSIT_CONCURRENCY: 5,
  // 2단계: 추정 이동시간 상위 몇 개를 살펴보고(상권 조회), 그중 몇 개를 추가로 조회할지
  REFINE_POOL: 8,
  REFINE_CANDIDATES: 4,
  // 점수에서 평균 이동시간의 비중. 0이면 최대 이동시간만, 클수록 전원의 합을 더 중시한다
  SCORE_AVG_WEIGHT: 0.5,
};

const P = RECOMMEND_PARAMS;

// 순위 기준별 평균 이동시간 비중 (체험 화면에서 사람마다 골라 보는 용도. 모임 추천은 balanced만 쓴다).
// 멤버 3명 기준으로 "최대 1분 = 합 몇 분"이 fair는 15분, balanced는 6분, fast는 2분이다.
// 어느 기준이든 누가 빨라졌는데 점수가 나빠지는 일은 없다(최대·평균 모두 줄거나 그대로이므로)
export const SCORE_MODES = {
  fair: 0.2,
  balanced: P.SCORE_AVG_WEIGHT,
  fast: 1.5,
};
export type ScoreMode = keyof typeof SCORE_MODES;

// 최대 + avgWeight × 평균. 낮을수록 좋다
function scoreOf(minutes: number[], avgWeight: number): number {
  const sum = minutes.reduce((a, b) => a + b, 0);
  return Math.max(...minutes) + (avgWeight * sum) / minutes.length;
}

export interface Station {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
}

const stations = stationsData.stations as Station[];

// 추천 후보가 되는 전국 역 수 (체험 화면의 과정 설명용)
export const STATION_COUNT = stations.length;

// 후보 역 하나가 각 단계에서 어떻게 처리됐는지
export interface CandidateTrace {
  station: Station;
  // 어느 단계에서 후보에 올랐는지 (1: 직선거리 1차 필터, 2: 속도 보정 후 추가 후보)
  source: 1 | 2;
  // 가장 먼 멤버까지의 직선거리
  maxMeters: number;
  // 1단계에서 직선거리가 최선값과 비슷해서 허브 우선 정렬 대상이었는지
  nearBest: boolean;
  // 출발지 근처 노선이 이 역을 지나는 멤버 수
  linkedMembers: number;
  // 멤버별 속도로 추정한 최대 이동시간(분). 속도를 추정하지 못했으면 null
  estMaxMinutes: number | null;
  // 반경 안 음식점+카페 수. 조회 실패면 null (통과로 처리)
  venues: number | null;
  // 상권 부족이라 후보에서 뺐는지
  venueLow: boolean;
  // 몇 단계에서 이동시간을 조회했는지. 조회 안 했으면 null
  queriedIn: 1 | 2 | null;
  // 멤버 순서대로 이동시간(분). 경로 없음은 null
  transitMinutes: (number | null)[] | null;
  maxMinutes: number | null;
  sumMinutes: number | null;
  // 최대 + SCORE_AVG_WEIGHT × 평균. 낮을수록 좋다
  score: number | null;
  // 최종 순위(1부터). 이동시간 조회를 안 했거나 갈 수 없는 멤버가 있으면 null
  rank: number | null;
  // 2단계 없이 1단계에서 조회한 역만으로 매긴 순위 (효과 비교용)
  round1Rank: number | null;
}

export interface RecommendTrace {
  // 1단계 후보(정렬 순서대로) 다음에 2단계에서 새로 추가된 후보
  candidates: CandidateTrace[];
  bestMeters: number;
  // 멤버별 출발지 근처(MEMBER_STATION_RADIUS_METERS 이내) 역의 노선. 근처에 역이 없으면 빈 배열
  memberLines: string[][];
  // 멤버별 추정 속도(직선 1km당 분). 추정하지 못하면 null
  memberMinutesPerKm: (number | null)[];
  calls: { local: number; transit: number };
}

export interface RecommendResult {
  // 상위 RESULT_COUNT개 (갈 수 있는 역이 없으면 빈 배열)
  top: Station[];
  trace: RecommendTrace;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function countVenues(station: Station): Promise<number | null> {
  const [food, cafe] = await Promise.all([
    countCategoryPlaces(station.lat, station.lng, P.VENUE_RADIUS_METERS, "FD6"),
    countCategoryPlaces(station.lat, station.lng, P.VENUE_RADIUS_METERS, "CE7"),
  ]);
  return food === null || cafe === null ? null : food + cafe;
}

function newTrace(
  station: Station,
  source: 1 | 2,
  maxMeters: number,
  venues: number | null,
  linkedMembers: number,
): CandidateTrace {
  return {
    station,
    source,
    maxMeters,
    nearBest: false,
    linkedMembers,
    estMaxMinutes: null,
    venues,
    venueLow: venues !== null && venues < P.MIN_VENUES,
    queriedIn: null,
    transitMinutes: null,
    maxMinutes: null,
    sumMinutes: null,
    score: null,
    rank: null,
    round1Rank: null,
  };
}

// 점수가 낮은 순(같으면 상권이 큰 순)으로 정렬
function byScore(a: CandidateTrace, b: CandidateTrace): number {
  return a.score! - b.score! || (b.venues ?? 0) - (a.venues ?? 0);
}

// 모두가 갈 수 있는 후보를 주어진 평균 비중의 점수로 다시 정렬한다 (같으면 상권이 큰 순).
// 이동시간을 다시 조회하지 않으므로 기준을 여러 개 매겨도 카카오 호출은 늘지 않는다
export function rankCandidates(
  candidates: CandidateTrace[],
  avgWeight: number,
): CandidateTrace[] {
  return candidates
    .filter((c) => c.score !== null)
    .map((c) => ({ c, score: scoreOf(c.transitMinutes as number[], avgWeight) }))
    .sort((a, b) => a.score - b.score || (b.c.venues ?? 0) - (a.c.venues ?? 0))
    .map(({ c }) => c);
}

// 쿼터 초과 시 KakaoQuotaExceededError를 던진다
export async function recommendStations(
  members: LatLng[],
): Promise<RecommendResult> {
  const maxMetersOf = (s: Station) =>
    Math.max(...members.map((m) => distanceMeters(s, m)));
  const memberLines = members.map((m) => [
    ...new Set(
      stations
        .filter((s) => distanceMeters(s, m) <= P.MEMBER_STATION_RADIUS_METERS)
        .flatMap((s) => s.lines),
    ),
  ]);
  const linkedMembersOf = (s: Station) =>
    memberLines.filter((lines) => lines.some((l) => s.lines.includes(l))).length;
  let localCalls = 0;
  let transitCalls = 0;

  // 후보 × 멤버 이동시간을 조회해 trace에 채운다
  async function queryTransit(targets: CandidateTrace[], round: 1 | 2) {
    const pairs = targets.flatMap((c) => members.map((m) => ({ c, m })));
    transitCalls += pairs.length;
    const pairMinutes = await mapWithConcurrency(
      pairs,
      P.TRANSIT_CONCURRENCY,
      ({ c, m }) => fetchTransitMinutes(m, c.station),
    );
    targets.forEach((c, ci) => {
      const times = pairMinutes.slice(ci * members.length, (ci + 1) * members.length);
      c.queriedIn = round;
      c.transitMinutes = times;
      // 한 명이라도 갈 수 없는 역은 순위에서 제외한다
      if (times.some((t) => t === null)) return;
      const valid = times as number[];
      c.maxMinutes = Math.max(...valid);
      c.sumMinutes = valid.reduce((a, b) => a + b, 0);
      c.score = scoreOf(valid, P.SCORE_AVG_WEIGHT);
    });
  }

  // ---- 1단계: 직선거리 기준 ----
  const nearest = stations
    .map((station) => ({ station, maxMeters: maxMetersOf(station) }))
    .sort((a, b) => a.maxMeters - b.maxMeters)
    .slice(0, P.PREFILTER_COUNT);
  localCalls += nearest.length * 2;
  const venueCounts = await Promise.all(nearest.map((n) => countVenues(n.station)));
  const bestMeters = nearest[0].maxMeters;
  const candidates: CandidateTrace[] = nearest
    .map((n, i) => {
      const c = newTrace(
        n.station,
        1,
        n.maxMeters,
        venueCounts[i],
        linkedMembersOf(n.station),
      );
      c.nearBest = n.maxMeters <= bestMeters + P.STRAIGHT_TOLERANCE_METERS;
      return c;
    })
    .sort((a, b) => {
      // 상권 부족(후보에서 뺄 역)은 맨 뒤, 그다음 비슷한 거리 그룹 → 나머지 순
      if (a.venueLow !== b.venueLow) return a.venueLow ? 1 : -1;
      if (a.nearBest !== b.nearBest) return a.nearBest ? -1 : 1;
      if (!a.nearBest) return a.maxMeters - b.maxMeters;
      return (
        b.linkedMembers - a.linkedMembers ||
        b.station.lines.length - a.station.lines.length ||
        (b.venues ?? 0) - (a.venues ?? 0)
      );
    });
  const round1 = candidates
    .filter((c) => !c.venueLow)
    .slice(0, P.TRANSIT_CANDIDATES);
  await queryTransit(round1, 1);

  // 효과 비교용: 1단계만으로 매긴 순위
  round1
    .filter((c) => c.score !== null)
    .sort(byScore)
    .forEach((c, i) => (c.round1Rank = i + 1));

  // ---- 2단계: 멤버별 속도 보정 ----
  // 출발지가 역 바로 앞이면 거리가 0에 가까워 비율이 튀므로 1km 미만은 1km로 본다
  const memberMinutesPerKm = members.map((m, mi) => {
    const ratios = round1.flatMap((c) => {
      const t = c.transitMinutes?.[mi];
      if (t === null || t === undefined) return [];
      return [t / Math.max(1, distanceMeters(c.station, m) / 1000)];
    });
    return ratios.length > 0 ? median(ratios) : null;
  });
  const known = memberMinutesPerKm.filter((v): v is number => v !== null);
  if (known.length > 0) {
    // 속도를 추정하지 못한 멤버는 다른 멤버들의 중앙값으로 채운다
    const fallback = median(known);
    const speeds = memberMinutesPerKm.map((v) => v ?? fallback);
    const estMaxOf = (s: Station) =>
      Math.max(...members.map((m, mi) => (speeds[mi] * distanceMeters(s, m)) / 1000));
    candidates.forEach((c) => (c.estMaxMinutes = estMaxOf(c.station)));

    const queriedIds = new Set(round1.map((c) => c.station.id));
    const pool = stations
      .filter((s) => !queriedIds.has(s.id))
      .map((station) => ({ station, est: estMaxOf(station) }))
      .sort((a, b) => a.est - b.est)
      .slice(0, P.REFINE_POOL);

    // 1단계 후보에 이미 있던 역은 상권 조회 결과를 재사용하고, 새 역만 조회해서 목록 뒤에 붙인다
    const byId = new Map(candidates.map((c) => [c.station.id, c]));
    const fresh = pool.filter((p) => !byId.has(p.station.id));
    localCalls += fresh.length * 2;
    const freshVenues = await Promise.all(fresh.map((p) => countVenues(p.station)));
    fresh.forEach((p, i) => {
      const c = newTrace(
        p.station,
        2,
        maxMetersOf(p.station),
        freshVenues[i],
        linkedMembersOf(p.station),
      );
      c.estMaxMinutes = p.est;
      candidates.push(c);
      byId.set(p.station.id, c);
    });

    const round2 = pool
      .map((p) => byId.get(p.station.id)!)
      .filter((c) => !c.venueLow)
      .sort((a, b) => a.estMaxMinutes! - b.estMaxMinutes!)
      .slice(0, P.REFINE_CANDIDATES);
    await queryTransit(round2, 2);
  }

  // ---- 순위 ----
  candidates
    .filter((c) => c.score !== null)
    .sort(byScore)
    .forEach((c, i) => (c.rank = i + 1));

  const top = candidates
    .filter((c) => c.rank !== null && c.rank <= P.RESULT_COUNT)
    .sort((a, b) => a.rank! - b.rank!)
    .map((c) => c.station);

  return {
    top,
    trace: {
      candidates,
      bestMeters,
      memberLines,
      memberMinutesPerKm,
      calls: { local: localCalls, transit: transitCalls },
    },
  };
}
