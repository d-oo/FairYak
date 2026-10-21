// 여러 파라미터 조합을 정답표로 한꺼번에 채점해 성적표로 비교한다 (채점 방식은 ground-truth-score.mts).
//
//   npm run gt:sweep                               scripts/ground-truth-sweep.json의 조합을 학습용 사례로 비교
//   npm run gt:sweep -- --holdout                  검증용 사례 성적도 함께 (조합을 고른 뒤 마지막 확인용)
//   npm run gt:sweep -- --config=<파일>             다른 조합 목록 파일
//
// 조합 파일 형식: { "configs": [{ "name": "...", "set": { "RECOMMEND_PARAMS 키": 값 }, "refine": [p, ...] }] }
//  - set이 없으면 지금 값 그대로, refine(2단계 자리별 거듭제곱 평균의 p)이 없으면 체험 모드 배분(TRY_REFINE_CRITERIA)
// 조합마다 RECOMMEND_PARAMS를 원래 값으로 되돌린 뒤 set을 적용한다.
// 이동시간 쿼터는 쓰지 않는다 (정답표 밖의 역은 갈 수 없음으로 처리하고 건수만 보여준다. 보충은 gt:eval --fill).
// 상권 수는 실행 전체에서 역마다 한 번만 조회한다.
//
// 검증용 사례 성적을 보고 조합을 고르면 검증용이 학습용이 되어 버리므로, 조합은 학습용 성적으로 고르고
// --holdout은 마지막에 한 번 확인하는 데만 쓴다.

import { existsSync, readFileSync } from "node:fs";
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
const withHoldout = args.includes("--holdout");
const configPath =
  args.find((a) => a.startsWith("--config="))?.slice("--config=".length) ??
  "scripts/ground-truth-sweep.json";

interface Config {
  name: string;
  set?: Record<string, number>;
  refine?: number[];
}
const { configs } = JSON.parse(readFileSync(configPath, "utf8")) as { configs: Config[] };

const truths = loadCases()
  .filter((c) => existsSync(caseFile(c.id)) && (withHoldout || !c.holdout))
  .map((c) => ({
    holdout: c.holdout,
    truth: JSON.parse(readFileSync(caseFile(c.id), "utf8")) as GroundTruth,
  }));
const trainCount = truths.filter((t) => !t.holdout).length;
console.log(
  `조합 ${configs.length}개 · 학습용 사례 ${trainCount}개${withHoldout ? ` · 검증용 사례 ${truths.length - trainCount}개` : ""}`,
);

const defaults = { ...RECOMMEND_PARAMS };
const venues = createVenueCache();
const modes = Object.entries(SCORE_MODES);

const rows: string[][] = [];
for (const config of configs) {
  for (const key of Object.keys(config.set ?? {}))
    if (!(key in defaults)) throw new Error(`[${config.name}] RECOMMEND_PARAMS에 ${key}가 없어요`);
  Object.assign(RECOMMEND_PARAMS, defaults, config.set ?? {});

  const groups = { train: new Map<string, ModeScore[]>(), holdout: new Map<string, ModeScore[]>() };
  let transitCalls = 0;
  let misses = 0;
  for (const { holdout, truth } of truths) {
    const result = await replay(truth, {
      refineCriteria: config.refine?.map(powerMeanCriterion) ?? TRY_REFINE_CRITERIA,
      venues,
    });
    if (!holdout) transitCalls += result.trace.calls.transit;
    misses += result.misses;
    const bucket = holdout ? groups.holdout : groups.train;
    for (const [mode, criterion] of modes)
      bucket.set(mode, [
        ...(bucket.get(mode) ?? []),
        scoreMode(truth, result.trace.candidates, criterion),
      ]);
  }

  const cells = (group: Map<string, ModeScore[]>) =>
    modes.map(([mode]) => {
      const s = summarize(group.get(mode) ?? []);
      return `${s.regretAvg.toFixed(2)} ${s.found}/${s.cases} ${s.hitsAvg.toFixed(1)}`;
    });
  rows.push([
    config.name,
    ...cells(groups.train),
    (transitCalls / Math.max(1, trainCount)).toFixed(1),
    String(misses),
    ...(withHoldout ? cells(groups.holdout) : []),
  ]);
}
Object.assign(RECOMMEND_PARAMS, defaults);

const header = [
  "조합",
  ...modes.map(([m]) => `학습 ${m}`),
  "조회/사례",
  "정답표 밖",
  ...(withHoldout ? modes.map(([m]) => `검증 ${m}`) : []),
];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)) + 2);
const line = (r: string[]) => r.map((cell, i) => cell.padEnd(widths[i])).join("");
console.log("\n기준 칸: 1위 손해 평균(분) · 정답 1위를 찾은 사례 · 적중 평균(/5)");
console.log(line(header));
for (const r of rows) console.log(line(r));
console.log(`\n장소 검색 ${venues.localCalls}건`);
