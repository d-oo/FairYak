import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// 카카오 대중교통 경로가 없을 때 도보로 대체하는 최대 직선거리
const WALK_FALLBACK_MAX_METERS = 2000;

function distanceMeters(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(endLat - startLat);
  const dLng = toRad(endLng - startLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(startLat)) *
      Math.cos(toRad(endLat)) *
      Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 직선거리 기반 도보 시간 추정 (분). 실제 보행 경로를 감안해 1.3배, 분속 80m로 계산.
function estimateWalkingMinutes(meters: number): number {
  return Math.max(1, Math.ceil((meters * 1.3) / 80));
}

// 출발지 → 도착지 대중교통 최단 소요시간(분). 경로가 없으면 minutes: null.
// 카카오 정책상 대중교통 경로 조회 결과는 저장·캐시할 수 없으므로 매 요청마다 조회한다.
export async function GET(req: NextRequest) {
  // 하루 무료 쿼터를 외부에서 소진하지 못하도록 로그인 사용자만 허용
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const startLat = Number(searchParams.get("start_lat"));
  const startLng = Number(searchParams.get("start_lng"));
  const endLat = Number(searchParams.get("end_lat"));
  const endLng = Number(searchParams.get("end_lng"));
  if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) {
    return NextResponse.json(
      { error: "start_lat, start_lng, end_lat, end_lng required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    start_x: String(startLng),
    start_y: String(startLat),
    end_x: String(endLng),
    end_y: String(endLat),
  });
  const res = await fetch(
    `https://dapi.kakao.com/v2/routing/publictraffic?${params}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } },
  );
  const data = await res.json().catch(() => null);

  // 쿼터 초과는 HTTP 429 또는 code -10으로 온다
  if (res.status === 429 || data?.code === -10) {
    return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
  }
  if (!res.ok || !data) {
    return NextResponse.json(
      { error: "Kakao API error" },
      { status: res.ok ? 502 : res.status },
    );
  }

  // 경로가 없으면 status가 NO_RESULTS(도시 간 등), ENDNODES_NULL(주변에 정류장 없음) 등으로 온다
  const transitMinutes: number[] = (data.routes ?? []).map(
    (r: { properties: { totalTime: number } }) =>
      Math.ceil(r.properties.totalTime / 60),
  );
  const meters = distanceMeters(startLat, startLng, endLat, endLng);
  // 아주 가까우면 대중교통보다 걷는 게 빠를 수 있다 (300m 거리에 버스 8분 경로가 나오기도 함)
  const candidates =
    meters <= WALK_FALLBACK_MAX_METERS
      ? [...transitMinutes, estimateWalkingMinutes(meters)]
      : transitMinutes;

  return NextResponse.json({
    minutes: candidates.length > 0 ? Math.min(...candidates) : null,
  });
}
