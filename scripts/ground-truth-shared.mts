// 정답표 생성(ground-truth-build)과 평가(ground-truth-eval, ground-truth-sweep)가 함께 쓰는 것들.
//
// 정답표 = 사례마다 "멤버에게서 가까운 역들 × 멤버 전원"의 카카오 대중교통 이동시간 전부.
// 정답 후보는 상권 기준을 통과한 역을 UNIVERSE_LISTS의 순서마다 모아 합친다(겹치는 역은 한 번만).
// 순서는 직선거리(km)를 이동시간 대신 넣은 근사 점수다.
//  - "가장 먼 멤버까지의 직선거리" 30개: 최대 쪽 기준의 정답이 들어 있는 넓은 기본 범위
//  - "평균 직선거리"와 각 기준(SCORE_MODES)의 근사 점수 10개씩: 멤버가 한쪽에 몰리면 기준마다 최적 지점이
//    달라서(평균 쪽 기준은 최대 쪽과 평균 쪽 사이) 기본 범위 밖에 있는 경우가 있어 따로 모은다
// 카카오 정책상 이동시간은 저장 금지지만, 알고리즘 검증을 위해 data/ground-truth/(gitignore)에만 잠시 둔다.
// 검증이 끝나면 폴더째 삭제한다. 절대 커밋하지 않는다.

import { readFileSync } from "node:fs";
import { distanceMeters } from "@/utils/geo";
import { mapWithConcurrency } from "@/utils/concurrency";
import {
  RECOMMEND_PARAMS,
  SCORE_MODES,
  countVenues,
  powerMeanCriterion,
  stations,
  type Criterion,
  type Station,
} from "@/utils/recommend";

export const CASES_PATH = "scripts/ground-truth-cases.json";
export const OUTPUT_DIR = "data/ground-truth";
const MAX_CRITERION: Criterion = { label: "최대", score: (d) => Math.max(...d) };
export const UNIVERSE_LISTS: { criterion: Criterion; size: number }[] = [
  { criterion: MAX_CRITERION, size: 30 },
  { criterion: powerMeanCriterion(1), size: 10 },
  ...Object.values(SCORE_MODES).map((criterion) => ({ criterion, size: 10 })),
];

export interface CaseMember {
  label: string;
  lat: number;
  lng: number;
}

export interface Case {
  id: string;
  label: string;
  members: CaseMember[];
  // 검증용 사례: 파라미터를 맞출 때는 보지 않고, 맞춘 결과를 마지막에 확인하는 데만 쓴다
  holdout: boolean;
}

export interface GroundTruth {
  caseId: string;
  label: string;
  // 이동시간은 조회 시각에 따라 달라지므로 언제 조회했는지 남긴다
  queriedAt: string;
  members: CaseMember[];
  // minutes는 멤버 순서대로, 경로 없음은 null.
  // source: 어느 정답 후보 목록(근사 점수 기준 이름)에서 왔는지, 또는 "fill"(평가 중 보충).
  // 없으면 처음 만든 정답표의 "최대" 목록. 나중에 붙인 역은 filledAt이 있다
  stations: {
    id: string;
    name: string;
    minutes: (number | null)[];
    source?: string;
    filledAt?: string;
  }[];
}

type RawMember = { station: string } | { label: string; lat: number; lng: number };

function resolveMember(m: RawMember): CaseMember {
  if ("station" in m) {
    const found = stations.filter((s) => s.name === m.station);
    if (found.length !== 1)
      throw new Error(`역 이름 "${m.station}"에 해당하는 역이 ${found.length}개예요`);
    return { label: m.station, lat: found[0].lat, lng: found[0].lng };
  }
  return m;
}

export function loadCases(): Case[] {
  const raw = JSON.parse(readFileSync(CASES_PATH, "utf8")) as {
    cases: { id: string; label: string; members: RawMember[]; holdout?: boolean }[];
  };
  return raw.cases.map((c) => ({
    ...c,
    members: c.members.map(resolveMember),
    holdout: c.holdout ?? false,
  }));
}

export function stationById(id: string): Station {
  const s = stations.find((x) => x.id === id);
  if (!s) throw new Error(`역 id ${id}가 stations.json에 없어요 (역 목록이 바뀌었나요?)`);
  return s;
}

export function caseFile(caseId: string): string {
  return `${OUTPUT_DIR}/${caseId}.json`;
}

// 상권 수를 한 실행 안에서만 메모리로 재사용한다 (요청 처리 중 메모리 사용이라 카카오 정책상 허용 범위)
export function createVenueCache() {
  const cache = new Map<string, Promise<number | null>>();
  let calls = 0;
  return {
    countVenues(station: Station): Promise<number | null> {
      let hit = cache.get(station.id);
      if (!hit) {
        calls += 2;
        hit = countVenues(station);
        cache.set(station.id, hit);
      }
      return hit;
    },
    get localCalls() {
      return calls;
    },
  };
}

type VenueCache = ReturnType<typeof createVenueCache>;

// 직선거리(km)를 이동시간 대신 넣은 기준 점수가 낮은 순
export function orderedStations(members: CaseMember[], criterion: Criterion): Station[] {
  return stations
    .map((station) => ({
      station,
      key: criterion.score(members.map((m) => distanceMeters(station, m) / 1000)),
    }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.station);
}

// 순서대로 상권을 확인해 가며 기준을 통과한 역을 size개 모은다 (조회 실패는 알고리즘과 같게 통과로 본다)
export async function pickVenuePassing(
  ordered: Station[],
  size: number,
  venues: VenueCache,
): Promise<Station[]> {
  const picked: Station[] = [];
  let next = 0;
  while (picked.length < size && next < ordered.length) {
    const batch: Station[] = [];
    while (batch.length < size - picked.length && next < ordered.length)
      batch.push(ordered[next++]);
    const counts = await mapWithConcurrency(batch, RECOMMEND_PARAMS.VENUE_CONCURRENCY, (s) =>
      venues.countVenues(s),
    );
    batch.forEach((s, i) => {
      const v = counts[i];
      if (v === null || v >= RECOMMEND_PARAMS.MIN_VENUES) picked.push(s);
    });
  }
  return picked;
}
