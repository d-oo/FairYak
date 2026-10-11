import { NextRequest, NextResponse } from "next/server";
import { hasExhibitionAccess } from "@/utils/exhibition";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { RECOMMEND_PARAMS, recommendStations } from "@/utils/recommend";

// 졸업전시 체험 모드(/try)용 추천. 로그인·모임 없이 입력한 출발지들로 추천 역을 계산한다.
// 결과(이동시간 포함)는 응답으로만 돌려주고 저장하지 않는다.

export const maxDuration = 30;

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 5;

export async function POST(req: NextRequest) {
  if (!(await hasExhibitionAccess())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { members } = await req.json().catch(() => ({}));
  const valid =
    Array.isArray(members) &&
    members.length >= MIN_MEMBERS &&
    members.length <= MAX_MEMBERS &&
    members.every((m) => Number.isFinite(m?.lat) && Number.isFinite(m?.lng));
  if (!valid) {
    return NextResponse.json(
      { error: `members: ${MIN_MEMBERS}~${MAX_MEMBERS}개의 { lat, lng }` },
      { status: 400 },
    );
  }

  try {
    const { trace } = await recommendStations(
      members.map((m: { lat: number; lng: number }) => ({ lat: m.lat, lng: m.lng })),
    );
    const ranked = trace.candidates
      .filter((c) => c.rank !== null && c.rank <= RECOMMEND_PARAMS.RESULT_COUNT)
      .sort((a, b) => a.rank! - b.rank!);
    if (ranked.length === 0) {
      return NextResponse.json({ error: "no_reachable_station" }, { status: 422 });
    }
    return NextResponse.json({
      stations: ranked.map((c) => ({
        id: c.station.id,
        name: c.station.name,
        lines: c.station.lines,
        lat: c.station.lat,
        lng: c.station.lng,
        // 입력 순서대로 멤버별 이동시간(분). 순위에 오른 역은 모두 값이 있다.
        minutes: c.transitMinutes as number[],
      })),
    });
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
    }
    throw e;
  }
}
