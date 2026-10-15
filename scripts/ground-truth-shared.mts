// 정답표 생성(ground-truth-build)과 평가(ground-truth-eval)가 함께 쓰는 것들.
//
// 정답표 = 사례마다 "멤버에게서 가까운 역 UNIVERSE_SIZE개 × 멤버 전원"의 카카오 대중교통 이동시간 전부.
// 카카오 정책상 이동시간은 저장 금지지만, 알고리즘 검증을 위해 data/ground-truth/(gitignore)에만 잠시 둔다.
// 검증이 끝나면 폴더째 삭제한다. 절대 커밋하지 않는다.

import { readFileSync } from "node:fs";
import { stations, type Station } from "@/utils/recommend";

export const CASES_PATH = "scripts/ground-truth-cases.json";
export const OUTPUT_DIR = "data/ground-truth";
// 상권 기준을 통과한 역 중 "가장 먼 멤버까지의 직선거리"가 짧은 순으로 몇 개를 정답 후보로 삼을지
export const UNIVERSE_SIZE = 30;

export interface CaseMember {
  label: string;
  lat: number;
  lng: number;
}

export interface Case {
  id: string;
  label: string;
  members: CaseMember[];
}

export interface GroundTruth {
  caseId: string;
  label: string;
  // 이동시간은 조회 시각에 따라 달라지므로 언제 조회했는지 남긴다
  queriedAt: string;
  members: CaseMember[];
  // 직선거리 순(평가 중 --fill로 보충한 역은 뒤에 붙고 filledAt이 있다). minutes는 멤버 순서대로, 경로 없음은 null
  stations: { id: string; name: string; minutes: (number | null)[]; filledAt?: string }[];
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
    cases: { id: string; label: string; members: RawMember[] }[];
  };
  return raw.cases.map((c) => ({ ...c, members: c.members.map(resolveMember) }));
}

export function stationById(id: string): Station {
  const s = stations.find((x) => x.id === id);
  if (!s) throw new Error(`역 id ${id}가 stations.json에 없어요 (역 목록이 바뀌었나요?)`);
  return s;
}

export function caseFile(caseId: string): string {
  return `${OUTPUT_DIR}/${caseId}.json`;
}
