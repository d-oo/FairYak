// 지금 추천 알고리즘(src/utils/recommend.ts)을 정답표로 채점한다 (설명은 ground-truth-shared.mts).
//
//   npm run gt:eval                  정답표가 있는 사례 전부
//   npm run gt:eval -- seoul-five    특정 사례만
//   npm run gt:eval -- --fill        정답표 밖의 역을 조회하면 그 역만 실제로 조회해 정답표에 보충하고 다시 채점
//   npm run gt:eval -- --meeting     2단계 자리를 체험 모드(TRY_REFINE_RATIOS)가 아니라 실제 모임 방식으로 배분해 채점
//   npm run gt:eval -- --refine=0,0,0,0                  2단계 자리별 기준(α)을 직접 정해 채점
//   npm run gt:eval -- --set=RESIDUAL_PRIOR_WEIGHT=1e9   RECOMMEND_PARAMS 값을 바꿔 채점 (여러 번 쓸 수 있음)
//     예) 예전 2단계(오차 보정 없이 추정 최대 이동시간으로 선택): --set=RESIDUAL_PRIOR_WEIGHT=1e9 --refine=0,0,0,0
//
// 알고리즘의 이동시간 조회를 정답표 조회로 바꿔 끼워 돌리므로 이동시간 쿼터를 쓰지 않는다 (--fill 보충분만 쓴다).
// 상권 수는 저장하지 않았으므로 실제 추천처럼 장소 검색을 호출한다 (사례당 약 50건).
// 알고리즘이 정답표 밖의 역을 조회하면 (--fill이 없으면) "갈 수 없음"으로 처리하고 경고를 보여준다.
// 정답 후보는 직선거리 순 상위 몇 개라, 2단계가 그 경계 바로 밖의 역을 고르는 경우가 있다.
//
// 기준(SCORE_MODES)마다, 정답표 전체를 그 기준으로 매긴 상위 RESULT_COUNT개를 정답으로 보고 비교한다.
//  - 적중: 알고리즘 상위 RESULT_COUNT개 중 정답 상위 RESULT_COUNT개에 든 수
//  - 정답 1위: 정답 1위 역이 알고리즘 결과에서 몇 위인지 (조회 안 했으면 "놓침")
//  - 1위 손해: 알고리즘 1위 역의 점수 - 정답 1위 역의 점수 (분. 0이면 최선을 찾은 것)
//  - "1단계만"은 2단계 없이 1단계에서 조회한 역만으로 매긴 결과 (2단계의 효과 비교용)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { LatLng } from "@/utils/geo";
import { mapWithConcurrency } from "@/utils/concurrency";
import { fetchTransitMinutes } from "@/utils/kakao/transit";
import {
  RECOMMEND_PARAMS,
  SCORE_MODES,
  TRY_REFINE_RATIOS,
  rankCandidates,
  recommendStations,
  scoreOf,
  type CandidateTrace,
} from "@/utils/recommend";
import {
  caseFile,
  loadCases,
  stationById,
  type GroundTruth,
} from "./ground-truth-shared.mts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const fill = args.includes("--fill");
const meeting = args.includes("--meeting");
const refineArg = args.find((a) => a.startsWith("--refine="));
const refineRatios = refineArg
  ? refineArg.slice("--refine=".length).split(",").map(Number)
  : meeting
    ? undefined
    : TRY_REFINE_RATIOS;
for (const a of args.filter((x) => x.startsWith("--set="))) {
  const [key, value] = a.slice("--set=".length).split("=");
  if (!(key in RECOMMEND_PARAMS)) throw new Error(`RECOMMEND_PARAMS에 ${key}가 없어요`);
  Object.assign(RECOMMEND_PARAMS, { [key]: Number(value) });
  console.log(`파라미터 변경: ${key} = ${value}`);
}
const TOP = RECOMMEND_PARAMS.RESULT_COUNT;

const pointKey = (p: LatLng) => `${p.lat},${p.lng}`;

interface Summary {
  hits: number;
  topFound: number;
  regret: number;
}
const totals = new Map<string, Summary[]>();

for (const c of loadCases()) {
  if (only.length > 0 && !only.includes(c.id)) continue;
  if (!existsSync(caseFile(c.id))) {
    console.log(`[${c.id}] 정답표 없음 (npm run gt:build로 만드세요)`);
    continue;
  }
  const truth = JSON.parse(readFileSync(caseFile(c.id), "utf8")) as GroundTruth;

  // 정답표로 알고리즘을 돌린다. 정답표 밖의 역은 갈 수 없음(null)으로 처리하고 따로 모은다
  const replay = async () => {
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
      refineRatios,
    });
    const missed = trace.candidates.filter(
      (c) => c.queriedIn !== null && !truth.stations.some((s) => s.id === c.station.id),
    );
    return { trace, misses, missed };
  };

  let { trace, misses, missed } = await replay();
  // 보충한 역의 이동시간에 따라 알고리즘이 또 다른 역을 고를 수 있어 몇 번까지 반복한다
  for (let round = 0; fill && missed.length > 0 && round < 3; round++) {
    const n = truth.members.length;
    const minutes = await mapWithConcurrency(
      missed.flatMap((c) => truth.members.map((m) => ({ c, m }))),
      5,
      ({ c, m }) => fetchTransitMinutes(m, c.station),
    );
    const filledAt = new Date().toISOString();
    missed.forEach((c, i) =>
      truth.stations.push({
        id: c.station.id,
        name: c.station.name,
        minutes: minutes.slice(i * n, (i + 1) * n),
        filledAt,
      }),
    );
    writeFileSync(caseFile(c.id), JSON.stringify(truth, null, 2));
    console.log(
      `
[${c.id}] 정답표 보충 ${missed.map((x) => x.station.name).join(", ")} (이동시간 ${minutes.length}건)`,
    );
    ({ trace, misses, missed } = await replay());
  }

  console.log(
    `\n[${c.id}] ${truth.label} · 멤버 ${truth.members.map((m) => m.label).join(", ")} · 정답표 ${truth.stations.length}역 (${truth.queriedAt.slice(0, 16)} 조회) · 알고리즘 이동시간 조회 ${trace.calls.transit}건`,
  );
  if (misses > 0)
    console.log(
      `  ⚠ 정답표 밖의 역 조회 ${misses}건 (${missed.map((c) => `${c.station.name} ${(c.maxMeters / 1000).toFixed(1)}km`).join(", ")}) → 갈 수 없음으로 처리됨`,
    );

  const reachable = truth.stations.filter((s) => s.minutes.every((t) => t !== null));
  const trueScore = (id: string, w: number) => {
    const s = truth.stations.find((x) => x.id === id);
    return s && s.minutes.every((t) => t !== null) ? scoreOf(s.minutes as number[], w) : null;
  };

  for (const [mode, weight] of Object.entries(SCORE_MODES)) {
    const truthRanked = reachable
      .map((s) => ({ s, score: scoreOf(s.minutes as number[], weight) }))
      .sort((a, b) => a.score - b.score);
    const truthTop = truthRanked.slice(0, TOP);
    const best = truthTop[0];

    const evaluate = (ranked: CandidateTrace[]) => {
      const top = ranked.slice(0, TOP);
      const hits = top.filter((c) => truthTop.some((t) => t.s.id === c.station.id)).length;
      const bestIndex = ranked.findIndex((c) => c.station.id === best.s.id);
      const first = top[0] ? trueScore(top[0].station.id, weight) : null;
      const regret = first === null ? Infinity : first - best.score;
      const names = top.map((c) => c.station.name).join(" ");
      return { hits, bestIndex, regret, names };
    };
    const full = evaluate(rankCandidates(trace.candidates, weight));
    const round1 = evaluate(
      rankCandidates(
        trace.candidates.filter((c) => c.queriedIn === 1),
        weight,
      ),
    );

    const fmt = (r: ReturnType<typeof evaluate>) =>
      `적중 ${r.hits}/${TOP} · 정답 1위 ${r.bestIndex < 0 ? "놓침" : `${r.bestIndex + 1}위`} · 1위 손해 ${r.regret.toFixed(1)}`;
    console.log(`  ${mode} (α ${weight})`);
    console.log(
      `    정답      ${truthTop.map((t) => `${t.s.name}(${t.score.toFixed(1)})`).join(" ")}`,
    );
    console.log(`    알고리즘  ${full.names} · ${fmt(full)}`);
    console.log(`    1단계만   ${round1.names} · ${fmt(round1)}`);

    const list = totals.get(mode) ?? [];
    list.push({ hits: full.hits, topFound: full.bestIndex === 0 ? 1 : 0, regret: full.regret });
    totals.set(mode, list);
  }
}

if (totals.size > 0) {
  console.log("\n[요약] 기준별 사례 평균");
  for (const [mode, list] of totals) {
    const avg = (f: (s: Summary) => number) =>
      (list.reduce((sum, s) => sum + f(s), 0) / list.length).toFixed(2);
    console.log(
      `  ${mode}: 적중 ${avg((s) => s.hits)}/${TOP} · 정답 1위를 1위로 ${list.reduce((n, s) => n + s.topFound, 0)}/${list.length}건 · 1위 손해 평균 ${avg((s) => s.regret)}`,
    );
  }
}
