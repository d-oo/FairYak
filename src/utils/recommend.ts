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
// [2단계: 이동시간 추정으로 추가 후보]
//  4. 1단계 결과로 멤버마다 "직선 1km당 몇 분"인지 추정한다. 같은 거리라도 역에서 먼 동네에 사는 멤버는
//     더 오래 걸리므로, 직선거리 중앙만 보면 후보가 빠른 멤버 쪽으로 치우친다.
//  5. 멤버별 추정 이동시간 = 속도 × 직선거리(멤버 근처 노선이 그 역을 지나면 DIRECT_LINE_FACTOR배)
//     + 근처에서 조회한 역들의 실제 오차(실제 − 속도 모델)의 거리 가중 평균.
//     같은 노선 방향이면 빠르고 노선을 가로지르면 느린 것처럼, 속도 하나로 못 잡는 방향성을 직결 여부와 근처 역의 실제값으로 메운다.
//  6. 아직 조회하지 않은 전국 역을 추정 이동시간으로 매긴 "추정 점수" 순으로 세워, 상권 기준을 통과한 역을
//     2단계 자리(기본 REFINE_CANDIDATES개)만큼 추가로 조회한다. 체험 모드는 자리를 기준(SCORE_MODES)별로 나눠 쓴다
//     (후보 목록 하나로 세 기준을 모두 매기므로, 기준마다 유리한 역이 모두 조회 대상에 들어가게)
// [순위]
//  7. 기준(Criterion)의 점수가 낮은 순. 실제 모임은 meetingCriterion(), 체험 모드는 SCORE_MODES의 세 기준
//     (예전의 "허용 범위 안이면 합, 밖이면 최대" 방식은 경계에서 1분 차이로 순위가 뒤집혀서 바꿨다)
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
  // 상권 확인을 동시에 몇 역씩 할지 (역 하나에 음식점·카페 2건). 한꺼번에 보내면 카카오 순간 요청 제한(-10)에 걸린다
  VENUE_CONCURRENCY: 4,
  // 2단계에서 추가로 조회할 역 수 (체험 모드는 TRY_REFINE_CRITERIA로 따로 정한다)
  REFINE_CANDIDATES: 4,
  // 상권 부족으로 빠질 역을 감안해, 기준마다 자리 수의 몇 배까지 추정 점수 상위 역의 상권을 확인할지
  REFINE_POOL_FACTOR: 2,
  // 근처 조회 역의 오차를 얼마나 멀리까지 반영할지. 이 거리에서 가중치가 e^-1(약 0.37)로 줄어든다
  RESIDUAL_RANGE_METERS: 1500,
  // 오차 보정의 기본 가중치. 근처에 조회한 역이 없을수록 보정이 0(속도 모델 그대로)에 가까워진다
  RESIDUAL_PRIOR_WEIGHT: 0.3,
  // 2단계 추정에서 멤버 출발지 근처 노선이 그 역을 지나면(갈아타지 않고 바로 감) 속도 모델 이동시간에 곱하는 계수.
  // 1이면 반영하지 않는다. 근처에 조회한 역이 없어 오차 보정이 안 닿는 곳에서 직결 여부를 구분하려는 것
  // (예: 일산 주엽역 → 3호선 직결 신사역 54분 vs 환승 신논현역 69분). 추정에만 쓰고 순위는 실제 이동시간으로 매긴다.
  // 0.8~1 중 정답표 학습용·검증용 사례에서 세 기준 모두 가장 고르게 좋았던 값
  DIRECT_LINE_FACTOR: 0.9,
  // 실제 모임 추천 점수 (1 − α) × 최대 + α × 평균 의 α. 1/3은 예전 공식 "최대 + 0.5 × 평균"과 순위가 같다.
  // 체험 모드는 거듭제곱 평균(SCORE_MODES)으로 바꿨고, 실제 모임은 나중에 체험 모드에 맞춘다 (docs/todos.md)
  SCORE_AVG_RATIO: 1 / 3,
};

const P = RECOMMEND_PARAMS;

// 순위 기준: 멤버별 이동시간(분) → 점수(분 단위, 낮을수록 좋다). label은 추천 과정·디버그 화면 표시용
export interface Criterion {
  label: string;
  score: (minutes: number[]) => number;
}

// 거듭제곱 평균 (각자 이동시간의 p제곱의 평균)^(1/p). p = 1이면 평균, p가 커질수록 가장 오래 걸리는 사람 쪽으로
// 간다(p → ∞이면 최대). 오래 걸리는 사람일수록 1분을 무겁게 치고, 누가 빨라지면 점수는 반드시 내려간다
export function powerMeanCriterion(p: number): Criterion {
  return {
    label: `p ${p}`,
    score: (minutes) => (minutes.reduce((a, t) => a + t ** p, 0) / minutes.length) ** (1 / p),
  };
}

// 실제 모임 추천 기준: (1 − α) × 최대 + α × 평균 (α = SCORE_AVG_RATIO, 호출 시점의 값을 읽는다)
export function meetingCriterion(): Criterion {
  const alpha = P.SCORE_AVG_RATIO;
  return {
    label: `모임 (α ${Number(alpha.toFixed(2))})`,
    score: (minutes) =>
      (1 - alpha) * Math.max(...minutes) +
      (alpha * minutes.reduce((a, b) => a + b, 0)) / minutes.length,
  };
}

// 체험 모드 순위 기준의 p (사람마다 골라 보는 용도. 실제 모임은 meetingCriterion()을 쓴다).
// 5명이 "한 명 60분·넷 20분" vs "모두 45~50분"일 때 fair는 모두 비슷한 쪽, balanced는 넷이 크게 빨라지는 쪽을
// 고르고, 3명 "상왕십리 26/18/35 vs 신당 28/23/34"는 balanced가 합이 작은 상왕십리를 고르도록 정했다.
// fast는 p 2라 평균 쪽이면서도 "한 명 1분·한 명 47분" 같은 극단적인 역은 피한다
export const SCORE_MODE_POWERS = { fair: 12, balanced: 5, fast: 2 };
export type ScoreMode = keyof typeof SCORE_MODE_POWERS;
export const SCORE_MODES = Object.fromEntries(
  Object.entries(SCORE_MODE_POWERS).map(([mode, p]) => [mode, powerMeanCriterion(p)]),
) as Record<ScoreMode, Criterion>;

// 체험 모드의 2단계 자리 배분 (자리마다 어느 기준의 추정 점수로 고를지). 앞에서부터 고른다
export const TRY_REFINE_CRITERIA = [
  SCORE_MODES.balanced,
  SCORE_MODES.fair,
  SCORE_MODES.fast,
  SCORE_MODES.balanced,
];

export interface Station {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
}

export const stations = stationsData.stations as Station[];

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
  // 멤버별 속도와 근처 조회 역의 오차로 추정한 최대 이동시간(분). 속도를 추정하지 못했으면 null
  estMaxMinutes: number | null;
  // 2단계에서 어느 기준(Criterion.label)의 추정 점수로 골랐는지. 2단계에서 조회하지 않았으면 null
  refinedBy: string | null;
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
  // 실제 모임 기준(meetingCriterion) 점수. 낮을수록 좋다. 한 명이라도 갈 수 없으면 null
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

// 반경 VENUE_RADIUS_METERS 안 음식점+카페 수. 조회 실패면 null
export async function countVenues(station: Station): Promise<number | null> {
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
    refinedBy: null,
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

// 모두가 갈 수 있는 후보를 주어진 기준의 점수로 다시 정렬한다 (같으면 상권이 큰 순).
// 이동시간을 다시 조회하지 않으므로 기준을 여러 개 매겨도 카카오 호출은 늘지 않는다
export function rankCandidates(
  candidates: CandidateTrace[],
  criterion: Criterion,
): CandidateTrace[] {
  return candidates
    .filter((c) => c.score !== null)
    .map((c) => ({ c, score: criterion.score(c.transitMinutes as number[]) }))
    .sort((a, b) => a.score - b.score || (b.c.venues ?? 0) - (a.c.venues ?? 0))
    .map(({ c }) => c);
}

// 이동시간 조회 함수. 평소에는 카카오를 부르고, 정답표 평가 스크립트(scripts/ground-truth)는
// 저장해 둔 이동시간으로 바꿔 끼워 같은 알고리즘을 쿼터 없이 다시 돌린다
export type TransitMinutesFetcher = (
  start: LatLng,
  end: LatLng,
) => Promise<number | null>;

export interface RecommendOptions {
  // 이동시간 조회 함수 (기본: 카카오)
  fetchMinutes?: TransitMinutesFetcher;
  // 2단계 자리마다 고를 기준. 기본은 REFINE_CANDIDATES자리 모두 실제 모임 기준(meetingCriterion)
  refineCriteria?: Criterion[];
  // 상권 수 조회 함수 (기본: 카카오 장소 검색). 정답표 평가가 한 실행 안에서 메모리로 재사용하려고 바꿔 끼운다
  countVenues?: (station: Station) => Promise<number | null>;
}

// 쿼터 초과 시 KakaoQuotaExceededError를 던진다
export async function recommendStations(
  members: LatLng[],
  {
    fetchMinutes = fetchTransitMinutes,
    refineCriteria = Array(P.REFINE_CANDIDATES).fill(meetingCriterion()),
    countVenues: venuesOf = countVenues,
  }: RecommendOptions = {},
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

  const meeting = meetingCriterion();

  // 후보 × 멤버 이동시간을 조회해 trace에 채운다
  async function queryTransit(targets: CandidateTrace[], round: 1 | 2) {
    const pairs = targets.flatMap((c) => members.map((m) => ({ c, m })));
    transitCalls += pairs.length;
    const pairMinutes = await mapWithConcurrency(
      pairs,
      P.TRANSIT_CONCURRENCY,
      ({ c, m }) => fetchMinutes(m, c.station),
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
      c.score = meeting.score(valid);
    });
  }

  // ---- 1단계: 직선거리 기준 ----
  const nearest = stations
    .map((station) => ({ station, maxMeters: maxMetersOf(station) }))
    .sort((a, b) => a.maxMeters - b.maxMeters)
    .slice(0, P.PREFILTER_COUNT);
  localCalls += nearest.length * 2;
  const venueCounts = await mapWithConcurrency(nearest, P.VENUE_CONCURRENCY, (n) =>
    venuesOf(n.station),
  );
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

  // ---- 2단계: 이동시간 추정으로 추가 후보 ----
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
    const modelMinutes = (s: Station, mi: number) =>
      ((speeds[mi] * distanceMeters(s, members[mi])) / 1000) *
      (memberLines[mi].some((l) => s.lines.includes(l)) ? P.DIRECT_LINE_FACTOR : 1);
    // 1단계에서 조회한 역마다 멤버별 "실제 − 속도 모델" 오차 (경로 없음은 null)
    const residuals = round1.map((c) => ({
      station: c.station,
      errors: members.map((_, mi) => {
        const t = c.transitMinutes?.[mi];
        return t === null || t === undefined ? null : t - modelMinutes(c.station, mi);
      }),
    }));
    // 멤버별 추정 이동시간 = 속도 모델 + 근처 조회 역 오차의 거리 가중 평균
    const estimateMinutes = (s: Station) =>
      members.map((_, mi) => {
        let weighted = 0;
        let weightSum = P.RESIDUAL_PRIOR_WEIGHT;
        for (const r of residuals) {
          const error = r.errors[mi];
          if (error === null) continue;
          const w = Math.exp(-((distanceMeters(s, r.station) / P.RESIDUAL_RANGE_METERS) ** 2));
          weighted += w * error;
          weightSum += w;
        }
        return Math.max(1, modelMinutes(s, mi) + weighted / weightSum);
      });
    candidates.forEach((c) => (c.estMaxMinutes = Math.max(...estimateMinutes(c.station))));

    const queriedIds = new Set(round1.map((c) => c.station.id));
    const unqueried = stations
      .filter((s) => !queriedIds.has(s.id))
      .map((station) => ({ station, est: estimateMinutes(station) }));
    // 기준마다 추정 점수 순으로 세운 목록
    const criteria = [...new Set(refineCriteria)];
    const rankedByCriterion = new Map(
      criteria.map((criterion) => [
        criterion,
        unqueried
          .map((u) => ({ ...u, score: criterion.score(u.est) }))
          .sort((a, b) => a.score - b.score),
      ]),
    );
    // 기준마다 (자리 수 × REFINE_POOL_FACTOR)개씩 모아 상권을 확인한다
    const pool = new Map<string, (typeof unqueried)[number]>();
    for (const criterion of criteria) {
      const slots = refineCriteria.filter((c) => c === criterion).length;
      for (const u of rankedByCriterion.get(criterion)!.slice(0, slots * P.REFINE_POOL_FACTOR))
        pool.set(u.station.id, u);
    }

    // 1단계 후보에 이미 있던 역은 상권 조회 결과를 재사용하고, 새 역만 조회해서 목록 뒤에 붙인다
    const byId = new Map(candidates.map((c) => [c.station.id, c]));
    const fresh = [...pool.values()].filter((p) => !byId.has(p.station.id));
    localCalls += fresh.length * 2;
    const freshVenues = await mapWithConcurrency(fresh, P.VENUE_CONCURRENCY, (p) =>
      venuesOf(p.station),
    );
    fresh.forEach((p, i) => {
      const c = newTrace(
        p.station,
        2,
        maxMetersOf(p.station),
        freshVenues[i],
        linkedMembersOf(p.station),
      );
      c.estMaxMinutes = Math.max(...p.est);
      candidates.push(c);
      byId.set(p.station.id, c);
    });

    // 자리마다 그 기준의 추정 점수가 가장 좋은, 상권 기준을 통과한 역을 고른다
    const round2: CandidateTrace[] = [];
    for (const criterion of refineCriteria) {
      const pick = rankedByCriterion
        .get(criterion)!
        .map((u) => byId.get(u.station.id))
        .find((c) => c && pool.has(c.station.id) && !c.venueLow && !round2.includes(c));
      if (!pick) continue;
      pick.refinedBy = criterion.label;
      round2.push(pick);
    }
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
