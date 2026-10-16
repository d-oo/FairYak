// 서버 전용 (KAKAO_REST_API_KEY 사용).
// 카카오 정책상 대중교통 경로 조회 결과는 저장·임시 캐싱이 금지이므로, 결과는 요청 처리 중에만 쓰고 버린다.

import type { LatLng } from "@/utils/geo";
import { fastestMinutes } from "@/utils/walk";
import { KakaoQuotaExceededError } from "./errors";

// 출발지 → 도착지 대중교통 최단 소요시간(분). 경로가 없거나 조회에 실패하면 null.
// 쿼터 초과면 KakaoQuotaExceededError를 던진다.
export async function fetchTransitMinutes(
  start: LatLng,
  end: LatLng,
): Promise<number | null> {
  const params = new URLSearchParams({
    start_x: String(start.lng),
    start_y: String(start.lat),
    end_x: String(end.lng),
    end_y: String(end.lat),
  });
  const res = await fetch(
    `https://dapi.kakao.com/v2/routing/publictraffic?${params}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } },
  );
  const data = await res.json().catch(() => null);

  // 쿼터 초과는 HTTP 429 또는 code -10으로 온다
  if (res.status === 429 || data?.code === -10)
    throw new KakaoQuotaExceededError();

  // 경로가 없으면 status가 NO_RESULTS(도시 간 등), ENDNODES_NULL(주변에 정류장 없음) 등으로 온다
  const transitMinutes: number[] =
    res.ok && data
      ? (data.routes ?? []).map((r: { properties: { totalTime: number } }) =>
          Math.ceil(r.properties.totalTime / 60),
        )
      : [];
  return fastestMinutes(start, end, transitMinutes);
}
