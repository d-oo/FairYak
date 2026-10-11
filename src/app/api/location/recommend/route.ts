import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { LatLng } from "@/utils/geo";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { recommendStations } from "@/utils/recommend";

// 모임 멤버들의 출발지를 기준으로 추천 역 상위 5개를 계산한다(계산 방식은 src/utils/recommend.ts).
// 저장은 하지 않는다. 클라이언트가 계산 락을 잡고 이 라우트를 호출한 뒤
// save_recommended_locations RPC로 역 id·순위를 저장한다.

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { meetingId } = await req.json().catch(() => ({}));
  if (typeof meetingId !== "number") {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }

  // RLS상 모임 멤버가 아니면 빈 배열이 온다
  const { data: memberCoords } = await supabase
    .from("member_coordinates")
    .select("lat, lng")
    .eq("meeting_id", meetingId);
  const members: LatLng[] = (memberCoords ?? []).filter(
    (m) => m.lat !== null && m.lng !== null,
  );
  if (members.length === 0) {
    return NextResponse.json({ error: "no_member_locations" }, { status: 404 });
  }

  try {
    const { top } = await recommendStations(members);
    if (top.length === 0) {
      return NextResponse.json({ error: "no_reachable_station" }, { status: 422 });
    }
    return NextResponse.json({
      stations: top.map(({ id, name, lat, lng }) => ({ id, name, lat, lng })),
    });
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
    }
    throw e;
  }
}
