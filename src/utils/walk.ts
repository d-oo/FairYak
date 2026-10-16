// 대중교통 이동시간에 도보를 함께 고려한다. 카카오(src/utils/kakao/transit.ts)와
// TMAP(src/utils/tmap/transit.ts) 이동시간 조회가 같은 규칙을 쓴다.

import { distanceMeters, type LatLng } from "@/utils/geo";

// 대중교통 경로가 없을 때 도보로 대체하는 최대 직선거리
const WALK_FALLBACK_MAX_METERS = 2000;

// 직선거리 기반 도보 시간 추정 (분). 실제 보행 경로를 감안해 1.3배, 분속 80m로 계산.
function estimateWalkingMinutes(meters: number): number {
  return Math.max(1, Math.ceil((meters * 1.3) / 80));
}

// 대중교통 경로들의 소요시간(분)과, 가까우면 도보 추정 시간까지 놓고 가장 짧은 값. 둘 다 없으면 null.
// 아주 가까우면 대중교통보다 걷는 게 빠를 수 있다 (300m 거리에 버스 8분 경로가 나오기도 함)
export function fastestMinutes(
  start: LatLng,
  end: LatLng,
  transitMinutes: number[],
): number | null {
  const meters = distanceMeters(start, end);
  const candidates =
    meters <= WALK_FALLBACK_MAX_METERS
      ? [...transitMinutes, estimateWalkingMinutes(meters)]
      : transitMinutes;
  return candidates.length > 0 ? Math.min(...candidates) : null;
}
