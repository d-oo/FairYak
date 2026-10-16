// 서버 전용 (TMAP_APP_KEY 사용). 졸업전시 체험 모드에서 카카오 대중교통 무료 쿼터가 바닥났을 때만 쓴다.
// TMAP은 건당 과금이라 호출 전에 src/utils/tmap/usage.ts로 월간 상한 안에서 예약해야 한다.
// 총 소요시간만 필요하므로 일반 경로 API보다 싼 "대중교통 요약정보" API를 쓴다 (경로별 totalTime 제공).
// 카카오와 같은 방식으로 결과는 요청 처리 중에만 쓰고 버린다.

import type { LatLng } from "@/utils/geo";
import { fastestMinutes } from "@/utils/walk";

// 경로 없음 상태 코드 (11 너무 가까움, 12·13 출발·도착지 근처 정류장 없음, 14 탐색된 경로 없음)
const NO_ROUTE_STATUSES = new Set([11, 12, 13, 14]);

// 경로 없음이 아닌 실패 (형식 오류, 서버 오류, 사용 한도 차단 등). 유료 호출이라
// 실패를 "갈 수 없음"으로 덮어 결과를 왜곡하지 않고 계산 전체를 실패로 처리한다
export class TmapError extends Error {
  constructor(message: string) {
    super(`TMAP transit error: ${message}`);
  }
}

// 출발지 → 도착지 대중교통 최단 소요시간(분). 경로가 없으면 null (2km 이내면 도보 추정으로 대체)
export async function fetchTmapTransitMinutes(
  start: LatLng,
  end: LatLng,
): Promise<number | null> {
  const res = await fetch("https://apis.openapi.sk.com/transit/routes/sub", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      appKey: process.env.TMAP_APP_KEY ?? "",
    },
    body: JSON.stringify({
      startX: String(start.lng),
      startY: String(start.lat),
      endX: String(end.lng),
      endY: String(end.lat),
      format: "json",
    }),
  });
  const data = await res.json().catch(() => null);

  const itineraries: { totalTime: number }[] | undefined =
    data?.metaData?.plan?.itineraries;
  if (res.ok && itineraries) {
    return fastestMinutes(
      start,
      end,
      itineraries.map((it) => Math.ceil(it.totalTime / 60)),
    );
  }
  // 경로 없음은 HTTP 200 또는 400에 result.status로 온다
  const status = data?.result?.status;
  if (NO_ROUTE_STATUSES.has(status)) return fastestMinutes(start, end, []);
  throw new TmapError(`HTTP ${res.status} ${JSON.stringify(data?.result ?? data?.error ?? null)}`);
}
