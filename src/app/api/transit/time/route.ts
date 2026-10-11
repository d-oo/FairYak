import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { fetchTransitMinutes } from "@/utils/kakao/transit";

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

  try {
    const minutes = await fetchTransitMinutes(
      { lat: startLat, lng: startLng },
      { lat: endLat, lng: endLng },
    );
    return NextResponse.json({ minutes });
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
    }
    throw e;
  }
}
