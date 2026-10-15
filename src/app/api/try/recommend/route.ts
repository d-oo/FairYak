import { NextRequest, NextResponse } from "next/server";
import { hasExhibitionAccess } from "@/utils/exhibition";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import {
  RECOMMEND_PARAMS,
  SCORE_MODES,
  STATION_COUNT,
  TRY_REFINE_RATIOS,
  rankCandidates,
  recommendStations,
  type ScoreMode,
} from "@/utils/recommend";

// 졸업전시 체험 모드(/try)용 추천. 로그인·모임 없이 입력한 출발지들로 추천 역을 계산한다.
// 결과(이동시간·상권 수 포함)는 응답으로만 돌려주고 저장하지 않는다.
// process는 체험 화면의 "추천 과정" 패널용으로, 계산 trace에서 체험객에게 보여줄 값만 추린 것이다.
// 갈 수 있는 역이 없어 422로 실패해도 왜 실패했는지 보여줄 수 있도록 process는 함께 돌려준다.
// 순위 기준(SCORE_MODES)은 체험객이 화면에서 바꿔 볼 수 있도록 기준마다 순위를 매겨 함께 돌려준다.

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
    // 후보 목록 하나로 세 기준을 모두 매기므로 2단계 자리도 기준별로 나눠 쓴다
    const { trace } = await recommendStations(
      members.map((m: { lat: number; lng: number }) => ({ lat: m.lat, lng: m.lng })),
      { refineRatios: TRY_REFINE_RATIOS },
    );
    const processInfo = {
      stationCount: STATION_COUNT,
      minVenues: RECOMMEND_PARAMS.MIN_VENUES,
      venueRadius: RECOMMEND_PARAMS.VENUE_RADIUS_METERS,
      resultCount: RECOMMEND_PARAMS.RESULT_COUNT,
      // 1단계 후보(정렬 순서대로) 다음에 2단계에서 추가된 후보
      candidates: trace.candidates.map((c) => ({
        id: c.station.id,
        name: c.station.name,
        lines: c.station.lines,
        source: c.source,
        venues: c.venues,
        venueLow: c.venueLow,
        queriedIn: c.queriedIn,
        minutes: c.transitMinutes,
        maxMinutes: c.maxMinutes,
        sumMinutes: c.sumMinutes,
      })),
    };
    const reachable = trace.candidates.filter((c) => c.score !== null);
    if (reachable.length === 0) {
      return NextResponse.json(
        { error: "no_reachable_station", process: processInfo },
        { status: 422 },
      );
    }
    // 기준마다 모두가 갈 수 있는 역 id를 순위대로
    const rankings = Object.fromEntries(
      Object.entries(SCORE_MODES).map(([mode, weight]) => [
        mode,
        rankCandidates(trace.candidates, weight).map((c) => c.station.id),
      ]),
    ) as Record<ScoreMode, string[]>;
    return NextResponse.json({
      // 모두가 갈 수 있는 역 전부 (어느 기준에서 몇 위인지는 rankings로 정한다)
      stations: reachable.map((c) => ({
        id: c.station.id,
        name: c.station.name,
        lines: c.station.lines,
        lat: c.station.lat,
        lng: c.station.lng,
        // 입력 순서대로 멤버별 이동시간(분). 모두가 갈 수 있는 역이므로 전부 값이 있다.
        minutes: c.transitMinutes as number[],
      })),
      rankings,
      process: processInfo,
    });
  } catch (e) {
    if (e instanceof KakaoQuotaExceededError) {
      return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
    }
    throw e;
  }
}
