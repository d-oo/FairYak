// 추천 알고리즘 정답표를 만든다 (설명은 ground-truth-shared.mts).
//
//   npm run gt:build -- --dry-run        카카오를 부르지 않고 사례별 예상 호출 수만 본다 (상권 확인 전이라 최대치)
//   npm run gt:build                     아직 정답표가 없는 사례만 만든다
//   npm run gt:build -- seoul-five       특정 사례만 (이미 있으면 다시 만든다)
//   npm run gt:build -- --extend         이미 있는 정답표에 빠진 정답 후보(평균 직선거리 쪽 등)만 조회해 붙인다
//
// 사례 하나에 이동시간 (UNIVERSE_LISTS 목록들을 합친 역 수) × 멤버 수 건을 쓴다. 멤버가 고르게 퍼져 있으면
// 목록이 많이 겹쳐 30개 남짓이고, 한쪽에 몰려 있으면 60개 가까이 된다.
// 쿼터가 바닥나면 그 사례는 저장하지 않고 멈춘다. 다음 날 다시 실행하면 남은 사례부터 이어서 만든다.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mapWithConcurrency } from "@/utils/concurrency";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { fetchTransitMinutes } from "@/utils/kakao/transit";
import type { Station } from "@/utils/recommend";
import {
  OUTPUT_DIR,
  UNIVERSE_LISTS,
  caseFile,
  createVenueCache,
  loadCases,
  orderedStations,
  pickVenuePassing,
  type Case,
  type GroundTruth,
} from "./ground-truth-shared.mts";

const CONCURRENCY = 5;

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const extend = args.includes("--extend");
const only = args.filter((a) => !a.startsWith("--"));
const venues = createVenueCache();

// 정답 후보: UNIVERSE_LISTS의 목록마다 상권 기준을 통과한 역을 모아 합친다 (겹치는 역은 처음 목록 것으로 한 번만)
async function pickUniverse(c: Case) {
  const picked = new Map<string, { station: Station; source: string }>();
  for (const { criterion, size } of UNIVERSE_LISTS)
    for (const station of await pickVenuePassing(orderedStations(c.members, criterion), size, venues))
      if (!picked.has(station.id)) picked.set(station.id, { station, source: criterion.label });
  return [...picked.values()];
}

// 상권 확인 전 최대치 (dry run용)
function plannedStations(c: Case): Station[] {
  const picked = new Map<string, Station>();
  for (const { criterion, size } of UNIVERSE_LISTS)
    for (const s of orderedStations(c.members, criterion).slice(0, size)) picked.set(s.id, s);
  return [...picked.values()];
}

async function queryMinutes(c: Case, targets: Station[]) {
  const n = c.members.length;
  const minutes = await mapWithConcurrency(
    targets.flatMap((s) => c.members.map((m) => ({ s, m }))),
    CONCURRENCY,
    ({ s, m }) => fetchTransitMinutes(m, s),
  );
  return targets.map((_, i) => minutes.slice(i * n, (i + 1) * n));
}

async function build(c: Case) {
  const universe = await pickUniverse(c);
  const minutes = await queryMinutes(
    c,
    universe.map((u) => u.station),
  );
  const truth: GroundTruth = {
    caseId: c.id,
    label: c.label,
    queriedAt: new Date().toISOString(),
    members: c.members,
    stations: universe.map((u, i) => ({
      id: u.station.id,
      name: u.station.name,
      minutes: minutes[i],
      source: u.source,
    })),
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(caseFile(c.id), JSON.stringify(truth, null, 2));
  console.log(
    `  저장 ${caseFile(c.id)} · 후보 ${universe.length}개 · 이동시간 ${universe.length * c.members.length}건`,
  );
}

// 이미 있는 정답표에 지금 기준의 정답 후보 중 빠진 역만 조회해 붙인다
async function extendTruth(c: Case) {
  const truth = JSON.parse(readFileSync(caseFile(c.id), "utf8")) as GroundTruth;
  const have = new Set(truth.stations.map((s) => s.id));
  const missing = (await pickUniverse(c)).filter((u) => !have.has(u.station.id));
  if (missing.length === 0) {
    console.log("  빠진 후보 없음");
    return;
  }
  const minutes = await queryMinutes(
    c,
    missing.map((u) => u.station),
  );
  const filledAt = new Date().toISOString();
  missing.forEach((u, i) =>
    truth.stations.push({
      id: u.station.id,
      name: u.station.name,
      minutes: minutes[i],
      source: u.source,
      filledAt,
    }),
  );
  writeFileSync(caseFile(c.id), JSON.stringify(truth, null, 2));
  console.log(
    `  추가 ${missing.map((u) => u.station.name).join(" ")} · 이동시간 ${missing.length * c.members.length}건`,
  );
}

const cases = loadCases().filter((c) => only.length === 0 || only.includes(c.id));
const todo = cases.filter((c) =>
  extend ? existsSync(caseFile(c.id)) : only.length > 0 || !existsSync(caseFile(c.id)),
);

function plannedCount(c: Case): number {
  const planned = plannedStations(c);
  if (!extend) return planned.length;
  const have = new Set(
    (JSON.parse(readFileSync(caseFile(c.id), "utf8")) as GroundTruth).stations.map((s) => s.id),
  );
  return planned.filter((s) => !have.has(s.id)).length;
}

const plannedCalls = todo.reduce((sum, c) => sum + plannedCount(c) * c.members.length, 0);
console.log(
  `사례 ${cases.length}개 중 ${todo.length}개를 ${extend ? "보충합니다" : "만듭니다"} · 이동시간 최대 ${plannedCalls}건${dryRun ? " (dry run: 조회 안 함)" : ""}`,
);

for (const c of todo) {
  console.log(
    `\n[${c.id}]${c.holdout ? " (검증용)" : ""} ${c.label} · 멤버 ${c.members.map((m) => m.label).join(", ")}`,
  );
  if (dryRun) {
    console.log(`  이동시간 최대 ${plannedCount(c) * c.members.length}건 예정`);
    continue;
  }
  try {
    if (extend) await extendTruth(c);
    else await build(c);
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      console.error("  카카오 쿼터 초과로 멈춥니다. 이 사례는 저장하지 않았어요.");
      process.exit(1);
    }
    throw e;
  }
}
