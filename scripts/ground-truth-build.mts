// 추천 알고리즘 정답표를 만든다 (설명은 ground-truth-shared.mts).
//
//   npm run gt:build -- --dry-run        카카오를 부르지 않고 사례별 후보와 예상 호출 수만 본다
//   npm run gt:build                     아직 정답표가 없는 사례만 만든다
//   npm run gt:build -- seoul-five       특정 사례만 (이미 있으면 다시 만든다)
//
// 사례 하나에 이동시간 UNIVERSE_SIZE × 멤버 수 건, 상권 확인용 장소 검색 약 UNIVERSE_SIZE × 2건을 쓴다.
// 쿼터가 바닥나면 그 사례는 저장하지 않고 멈춘다. 다음 날 다시 실행하면 남은 사례부터 이어서 만든다.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { distanceMeters } from "@/utils/geo";
import { mapWithConcurrency } from "@/utils/concurrency";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { fetchTransitMinutes } from "@/utils/kakao/transit";
import { RECOMMEND_PARAMS, countVenues, stations } from "@/utils/recommend";
import {
  OUTPUT_DIR,
  UNIVERSE_SIZE,
  caseFile,
  loadCases,
  type Case,
  type GroundTruth,
} from "./ground-truth-shared.mts";

const CONCURRENCY = 5;

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));

function byMaxDistance(c: Case) {
  return stations
    .map((station) => ({
      station,
      maxMeters: Math.max(...c.members.map((m) => distanceMeters(station, m))),
    }))
    .sort((a, b) => a.maxMeters - b.maxMeters);
}

// 직선거리 순으로 상권을 확인해 가며, 기준을 통과한 역을 UNIVERSE_SIZE개 모은다
// (알고리즘과 같게 상권 수를 조회하지 못한 역은 통과로 본다)
async function pickUniverse(c: Case) {
  const ordered = byMaxDistance(c);
  const picked: typeof ordered = [];
  let checked = 0;
  while (picked.length < UNIVERSE_SIZE && checked < ordered.length) {
    const batch = ordered.slice(checked, checked + (UNIVERSE_SIZE - picked.length));
    checked += batch.length;
    const venues = await mapWithConcurrency(batch, RECOMMEND_PARAMS.VENUE_CONCURRENCY, (b) =>
      countVenues(b.station),
    );
    batch.forEach((b, i) => {
      const v = venues[i];
      if (v === null || v >= RECOMMEND_PARAMS.MIN_VENUES) picked.push(b);
    });
  }
  return { picked, checked };
}

async function build(c: Case) {
  const { picked, checked } = await pickUniverse(c);
  const pairs = picked.flatMap((p) => c.members.map((m) => ({ p, m })));
  const minutes = await mapWithConcurrency(pairs, CONCURRENCY, ({ p, m }) =>
    fetchTransitMinutes(m, p.station),
  );
  const n = c.members.length;
  const truth: GroundTruth = {
    caseId: c.id,
    label: c.label,
    queriedAt: new Date().toISOString(),
    members: c.members,
    stations: picked.map((p, i) => ({
      id: p.station.id,
      name: p.station.name,
      minutes: minutes.slice(i * n, (i + 1) * n),
    })),
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(caseFile(c.id), JSON.stringify(truth, null, 2));
  const farthest = (picked.at(-1)!.maxMeters / 1000).toFixed(1);
  console.log(
    `  저장 ${caseFile(c.id)} · 후보 ${picked.length}개 (상권 확인 ${checked}개, 가장 먼 멤버까지 최대 ${farthest}km) · 이동시간 ${pairs.length}건`,
  );
}

const cases = loadCases().filter((c) => only.length === 0 || only.includes(c.id));
const todo = cases.filter((c) => only.length > 0 || !existsSync(caseFile(c.id)));
const plannedCalls = todo.reduce((sum, c) => sum + UNIVERSE_SIZE * c.members.length, 0);
console.log(
  `사례 ${cases.length}개 중 ${todo.length}개를 만듭니다 · 이동시간 최대 ${plannedCalls}건${dryRun ? " (dry run: 조회 안 함)" : ""}`,
);

for (const c of todo) {
  console.log(`\n[${c.id}] ${c.label} · 멤버 ${c.members.map((m) => m.label).join(", ")}`);
  if (dryRun) {
    const near = byMaxDistance(c).slice(0, UNIVERSE_SIZE);
    console.log(
      `  직선거리 상위 ${UNIVERSE_SIZE}개 (상권 확인 전): ${near.map((x) => x.station.name).join(" ")}`,
    );
    console.log(`  이동시간 ${UNIVERSE_SIZE * c.members.length}건 예정`);
    continue;
  }
  try {
    await build(c);
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      console.error("  카카오 쿼터 초과로 멈춥니다. 이 사례는 저장하지 않았어요.");
      process.exit(1);
    }
    throw e;
  }
}
