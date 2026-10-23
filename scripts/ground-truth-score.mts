// 정답표로 알고리즘을 다시 돌리고 채점하는 부분 (ground-truth-eval, ground-truth-sweep이 함께 쓴다).
//
// 알고리즘의 이동시간 조회를 정답표 조회로 바꿔 끼우므로 이동시간 쿼터를 쓰지 않는다.
// 정답표 밖의 역을 조회하면 "갈 수 없음"(null)으로 처리하고 따로 모은다.
//
// 기준마다 정답표 전체를 그 기준으로 매긴 점수와 비교한다. 동점 역이 많아서 순위 대신 점수로 판정한다.
//  - 1위 손해: 알고리즘 1위 역의 점수 − 정답 1위 점수 (분). 0이면 진짜 최선을 찾은 것 (동점 역을 골라도 0)
//  - 적중: 알고리즘 상위 RESULT_COUNT개 중 점수가 정답 RESULT_COUNT위 점수 이하인 역 수

import type { LatLng } from "@/utils/geo";
import {
  RECOMMEND_PARAMS,
  rankCandidates,
  recommendStations,
  type CandidateTrace,
  type Criterion,
} from "@/utils/recommend";
import {
  stationById,
  type createRouteCache,
  type createVenueCache,
  type GroundTruth,
} from "./ground-truth-shared.mts";

const EPS = 1e-9;
const pointKey = (p: LatLng) => `${p.lat},${p.lng}`;

export async function replay(
  truth: GroundTruth,
  options: {
    refineCriteria?: Criterion[];
    venues: ReturnType<typeof createVenueCache>;
    // 넘기면 경로 기반 추정을 쓴다 (경로는 정답표에 없어 실제로 조회한다). 없으면 경로 없이 채점한다
    routes?: ReturnType<typeof createRouteCache>;
  },
) {
  // (출발지, 역 좌표) → 이동시간
  const table = new Map<string, number | null>();
  for (const s of truth.stations) {
    const station = stationById(s.id);
    truth.members.forEach((m, mi) =>
      table.set(`${pointKey(m)}|${pointKey(station)}`, s.minutes[mi]),
    );
  }
  let misses = 0;
  const { trace } = await recommendStations(truth.members, {
    fetchMinutes: async (start, end) => {
      const key = `${pointKey(start)}|${pointKey(end)}`;
      if (!table.has(key)) {
        misses++;
        return null;
      }
      return table.get(key)!;
    },
    refineCriteria: options.refineCriteria,
    countVenues: (s) => options.venues.countVenues(s),
    fetchRoutes: options.routes
      ? (start, end) => options.routes!.fetchRoutes(start, end)
      : null,
  });
  const missed = trace.candidates.filter(
    (c) => c.queriedIn !== null && !truth.stations.some((s) => s.id === c.station.id),
  );
  return { trace, misses, missed };
}

export interface ModeScore {
  found: boolean;
  regret: number;
  hits: number;
  names: string[];
  truthTop: { name: string; score: number }[];
}

export function scoreMode(
  truth: GroundTruth,
  candidates: CandidateTrace[],
  criterion: Criterion,
): ModeScore {
  const TOP = RECOMMEND_PARAMS.RESULT_COUNT;
  const reachable = truth.stations
    .filter((s) => s.minutes.every((t) => t !== null))
    .map((s) => ({ id: s.id, name: s.name, score: criterion.score(s.minutes as number[]) }))
    .sort((a, b) => a.score - b.score);
  const truthTop = reachable.slice(0, TOP);
  const best = truthTop[0]?.score ?? Infinity;
  const cutoff = truthTop.at(-1)?.score ?? Infinity;
  const trueScore = (id: string) => reachable.find((r) => r.id === id)?.score ?? Infinity;

  const top = rankCandidates(candidates, criterion).slice(0, TOP);
  const regret = top[0] ? trueScore(top[0].station.id) - best : Infinity;
  return {
    found: regret <= EPS,
    regret,
    hits: top.filter((c) => trueScore(c.station.id) <= cutoff + EPS).length,
    names: top.map((c) => c.station.name),
    truthTop: truthTop.map(({ name, score }) => ({ name, score })),
  };
}

export interface Summary {
  cases: number;
  found: number;
  regretAvg: number;
  hitsAvg: number;
}

export function summarize(scores: ModeScore[]): Summary {
  const n = scores.length || 1;
  return {
    cases: scores.length,
    found: scores.filter((s) => s.found).length,
    regretAvg: scores.reduce((sum, s) => sum + s.regret, 0) / n,
    hitsAvg: scores.reduce((sum, s) => sum + s.hits, 0) / n,
  };
}
