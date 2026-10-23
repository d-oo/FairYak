// 서버 전용 (KAKAO_REST_API_KEY 사용).
// 카카오 정책상 대중교통 경로 조회 결과는 저장·임시 캐싱이 금지이므로, 결과는 요청 처리 중에만 쓰고 버린다.

import type { LatLng } from "@/utils/geo";
import { fastestMinutes } from "@/utils/walk";
import { KakaoQuotaExceededError } from "./errors";

interface KakaoRoute {
  properties: { totalTime: number };
  steps?: {
    properties: {
      type: string;
      time: number;
      stops?: { name: string }[];
      vehicles?: { name: string }[];
    };
    path?: { points?: [number, number][] };
  }[];
}

// 경로가 없으면 status가 NO_RESULTS(도시 간 등), ENDNODES_NULL(주변에 정류장 없음) 등으로 오고, 그때는 빈 배열.
// 쿼터 초과면 KakaoQuotaExceededError를 던진다.
async function fetchKakaoRoutes(start: LatLng, end: LatLng): Promise<KakaoRoute[]> {
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
  return res.ok && data ? (data.routes ?? []) : [];
}

// 출발지 → 도착지 대중교통 최단 소요시간(분). 경로가 없거나 조회에 실패하면 null.
// 쿼터 초과면 KakaoQuotaExceededError를 던진다.
export async function fetchTransitMinutes(
  start: LatLng,
  end: LatLng,
): Promise<number | null> {
  const routes = await fetchKakaoRoutes(start, end);
  return fastestMinutes(
    start,
    end,
    routes.map((r) => Math.ceil(r.properties.totalTime / 60)),
  );
}

export interface TransitRouteStep {
  // SUBWAY, BUS, WALKING 등
  type: string;
  minutes: number;
  // 탄 노선 이름 (예: "1호선"). 걷는 구간은 null
  line: string | null;
  // 정차역·정류장 이름 (좌표는 오지 않는다). 급행이면 급행 정차역만 온다
  stopNames: string[];
  path: LatLng[];
}

export interface TransitRoute {
  minutes: number;
  steps: TransitRouteStep[];
}

// 출발지 → 도착지 대중교통 경로들(구간별 시간·정차역). 경로가 없거나 조회에 실패하면 빈 배열.
// 쿼터 초과면 KakaoQuotaExceededError를 던진다.
export async function fetchTransitRoutes(
  start: LatLng,
  end: LatLng,
): Promise<TransitRoute[]> {
  const routes = await fetchKakaoRoutes(start, end);
  return routes.map((r) => ({
    minutes: r.properties.totalTime / 60,
    steps: (r.steps ?? []).map((s) => ({
      type: s.properties.type,
      minutes: s.properties.time / 60,
      line: s.properties.vehicles?.[0]?.name ?? null,
      stopNames: (s.properties.stops ?? []).map((x) => x.name),
      path: (s.path?.points ?? []).map(([lng, lat]) => ({ lat, lng })),
    })),
  }));
}
