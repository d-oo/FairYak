// 지금 추천 알고리즘(src/utils/recommend.ts)을 정답표로 채점한다 (설명은 ground-truth-shared.mts, 채점 방식은 ground-truth-score.mts).
//
//   npm run gt:eval                  정답표가 있는 사례 전부 (요약은 학습용·검증용을 나눠 보여준다)
//   npm run gt:eval -- seoul-five    특정 사례만
//   npm run gt:eval -- --train       학습용 사례만 / --holdout 검증용 사례만
//   npm run gt:eval -- --fill        정답표 밖의 역을 조회하면 그 역만 실제로 조회해 정답표에 보충하고 다시 채점
//   npm run gt:eval -- --meeting     2단계 자리를 체험 모드(TRY_REFINE_CRITERIA)가 아니라 실제 모임 방식으로 배분해 채점
//   npm run gt:eval -- --refine=5,12,2,5                 2단계 자리별 기준(거듭제곱 평균의 p)을 직접 정해 채점
//   npm run gt:eval -- --set=RESIDUAL_PRIOR_WEIGHT=1e9   RECOMMEND_PARAMS 값을 바꿔 채점 (여러 번 쓸 수 있음)
//   여러 조합을 한 번에 비교하려면 npm run gt:sweep
//
// --fill 보충분 말고는 이동시간 쿼터를 쓰지 않는다. 상권 수는 저장하지 않았으므로 실행마다 장소 검색을 호출하되,
// 한 실행 안에서는 역마다 한 번만 조회한다.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mapWithConcurrency } from "@/utils/concurrency";
import { fetchTransitMinutes } from "@/utils/kakao/transit";
import {
  RECOMMEND_PARAMS,
  SCORE_MODES,
  TRY_REFINE_CRITERIA,
  powerMeanCriterion,
} from "@/utils/recommend";
import {
  caseFile,
  createVenueCache,
  loadCases,
  type GroundTruth,
} from "./ground-truth-shared.mts";
import { replay, scoreMode, summarize, type ModeScore } from "./ground-truth-score.mts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const fill = args.includes("--fill");
const meeting = args.includes("--meeting");
const trainOnly = args.includes("--train");
const holdoutOnly = args.includes("--holdout");
const refineArg = args.find((a) => a.startsWith("--refine="));
const refineCriteria = refineArg
  ? refineArg.slice("--refine=".length).split(",").map((p) => powerMeanCriterion(Number(p)))
  : meeting
    ? undefined
    : TRY_REFINE_CRITERIA;
for (const a of args.filter((x) => x.startsWith("--set="))) {
  const [key, value] = a.slice("--set=".length).split("=");
  if (!(key in RECOMMEND_PARAMS)) throw new Error(`RECOMMEND_PARAMS에 ${key}가 없어요`);
  Object.assign(RECOMMEND_PARAMS, { [key]: Number(value) });
  console.log(`파라미터 변경: ${key} = ${value}`);
}
const TOP = RECOMMEND_PARAMS.RESULT_COUNT;
const venues = createVenueCache();

// 학습용·검증용 → 기준 → 사례별 점수
const totals = { train: new Map<string, ModeScore[]>(), holdout: new Map<string, ModeScore[]>() };

for (const c of loadCases()) {
  if (only.length > 0 && !only.includes(c.id)) continue;
  if ((trainOnly && c.holdout) || (holdoutOnly && !c.holdout)) continue;
  if (!existsSync(caseFile(c.id))) {
    console.log(`[${c.id}] 정답표 없음 (npm run gt:build로 만드세요)`);
    continue;
  }
  const truth = JSON.parse(readFileSync(caseFile(c.id), "utf8")) as GroundTruth;

  let { trace, misses, missed } = await replay(truth, { refineCriteria, venues });
  // 보충한 역의 이동시간에 따라 알고리즘이 또 다른 역을 고를 수 있어 몇 번까지 반복한다
  for (let round = 0; fill && missed.length > 0 && round < 3; round++) {
    const n = truth.members.length;
    const minutes = await mapWithConcurrency(
      missed.flatMap((x) => truth.members.map((m) => ({ x, m }))),
      5,
      ({ x, m }) => fetchTransitMinutes(m, x.station),
    );
    const filledAt = new Date().toISOString();
    missed.forEach((x, i) =>
      truth.stations.push({
        id: x.station.id,
        name: x.station.name,
        minutes: minutes.slice(i * n, (i + 1) * n),
        source: "fill",
        filledAt,
      }),
    );
    writeFileSync(caseFile(c.id), JSON.stringify(truth, null, 2));
    console.log(
      `\n[${c.id}] 정답표 보충 ${missed.map((x) => x.station.name).join(", ")} (이동시간 ${minutes.length}건)`,
    );
    ({ trace, misses, missed } = await replay(truth, { refineCriteria, venues }));
  }

  console.log(
    `\n[${c.id}]${c.holdout ? " (검증용)" : ""} ${truth.label} · 멤버 ${truth.members.map((m) => m.label).join(", ")} · 정답표 ${truth.stations.length}역 (${truth.queriedAt.slice(0, 16)} 조회) · 알고리즘 이동시간 조회 ${trace.calls.transit}건`,
  );
  if (misses > 0)
    console.log(
      `  ⚠ 정답표 밖의 역 조회 ${misses}건 (${missed.map((x) => `${x.station.name} ${(x.maxMeters / 1000).toFixed(1)}km`).join(", ")}) → 갈 수 없음으로 처리됨`,
    );

  const fmt = (s: ModeScore) =>
    `${s.names.join(" ")} · 적중 ${s.hits}/${TOP} · ${s.found ? "정답 1위 찾음" : "정답 1위 놓침"} · 1위 손해 ${s.regret.toFixed(1)}`;
  for (const [mode, criterion] of Object.entries(SCORE_MODES)) {
    const full = scoreMode(truth, trace.candidates, criterion);
    const round1 = scoreMode(
      truth,
      trace.candidates.filter((x) => x.queriedIn === 1),
      criterion,
    );
    console.log(`  ${mode} (${criterion.label})`);
    console.log(
      `    정답      ${full.truthTop.map((t) => `${t.name}(${t.score.toFixed(1)})`).join(" ")}`,
    );
    console.log(`    알고리즘  ${fmt(full)}`);
    console.log(`    1단계만   ${fmt(round1)}`);
    const bucket = c.holdout ? totals.holdout : totals.train;
    bucket.set(mode, [...(bucket.get(mode) ?? []), full]);
  }
}

for (const [group, label] of [
  ["train", "학습용"],
  ["holdout", "검증용"],
] as const) {
  if (totals[group].size === 0) continue;
  console.log(`\n[요약] ${label} 사례 평균`);
  for (const [mode, scores] of totals[group]) {
    const s = summarize(scores);
    console.log(
      `  ${mode}: 적중 ${s.hitsAvg.toFixed(2)}/${TOP} · 정답 1위를 찾은 사례 ${s.found}/${s.cases}건 · 1위 손해 평균 ${s.regretAvg.toFixed(2)}`,
    );
  }
}
console.log(`\n장소 검색 ${venues.localCalls}건`);
