import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { RECOMMEND_PARAMS, recommendStations } from "@/utils/recommend";

// 개발용: 임의의 멤버 좌표로 추천 과정을 단계별로 돌려준다 (/dashboard/dev/recommend 테스트 페이지용).
// 호출마다 실제 추천과 같은 만큼 카카오 쿼터를 쓰므로 개발 서버(npm run dev)에서만 연다.

export const maxDuration = 30;

const MAX_MEMBERS = 10;

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { members } = await req.json().catch(() => ({}));
  const valid =
    Array.isArray(members) &&
    members.length > 0 &&
    members.length <= MAX_MEMBERS &&
    members.every(
      (m) => Number.isFinite(m?.lat) && Number.isFinite(m?.lng),
    );
  if (!valid) {
    return NextResponse.json(
      { error: `members: 1~${MAX_MEMBERS}개의 { lat, lng }` },
      { status: 400 },
    );
  }

  try {
    const startedAt = Date.now();
    const result = await recommendStations(
      members.map((m: { lat: number; lng: number }) => ({ lat: m.lat, lng: m.lng })),
    );
    return NextResponse.json({
      ...result,
      params: RECOMMEND_PARAMS,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
    }
    throw e;
  }
}
