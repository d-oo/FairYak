import { NextRequest, NextResponse } from "next/server";
import { hasExhibitionAccess } from "@/utils/exhibition";
import { KakaoQuotaExceededError } from "@/utils/kakao/errors";
import { fetchTransitMinutes } from "@/utils/kakao/transit";
import {
  RECOMMEND_PARAMS,
  SCORE_MODES,
  STATION_COUNT,
  TRY_REFINE_CRITERIA,
  rankCandidates,
  recommendStations,
  type RecommendTrace,
  type ScoreMode,
} from "@/utils/recommend";
import { TmapError, fetchTmapTransitMinutes } from "@/utils/tmap/transit";
import { reserveTmapCalls } from "@/utils/tmap/usage";

// 졸업전시 체험 모드(/try)용 추천. 로그인·모임 없이 입력한 출발지들로 추천 역을 계산한다.
// 결과(이동시간·상권 수 포함)는 응답으로만 돌려주고 저장하지 않는다.
// process는 체험 화면의 "추천 과정" 패널용으로, 계산 trace에서 체험객에게 보여줄 값만 추린 것이다.
// 갈 수 있는 역이 없어 422로 실패해도 왜 실패했는지 보여줄 수 있도록 process는 함께 돌려준다.
// 순위 기준(SCORE_MODES)은 체험객이 화면에서 바꿔 볼 수 있도록 기준마다 순위를 매겨 함께 돌려준다.
//
// 이동시간은 카카오(하루 무료 쿼터, 초과 과금 꺼 둠)로 조회하고, 대중교통 쿼터가 바닥나면 TMAP(유료)으로 넘어간다.
// TMAP은 계산 전에 이번에 쓸 최대 호출 수를 월간 상한(src/utils/tmap/usage.ts) 안에서 예약하고,
// 상한에 걸리면 "closed"로 체험을 마감한다. 장소 검색(상권) 쿼터 초과는 TMAP으로 대신할 수 없어 그대로 실패한다.

export const maxDuration = 30;

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 5;

// 카카오 대중교통 쿼터 초과를 확인하면 다음 날 0시(한국 시간)까지 카카오를 건너뛰고 바로 TMAP을 쓴다.
// 서버 인스턴스 메모리라 인스턴스마다 한 번씩은 카카오를 시도한다 (실패한 카카오 호출은 비용이 없다)
let kakaoTransitExhaustedUntil = 0;

function nextKstMidnight(now: number): number {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  return (Math.floor((now + KST_OFFSET) / DAY) + 1) * DAY - KST_OFFSET;
}

// 개발 서버에서 TMAP 폴백을 시험할 때 카카오를 건너뛴다 (.env.local에 TRY_FORCE_TMAP=1, 실제 TMAP 비용이 든다)
const forceTmap =
  process.env.NODE_ENV === "development" && process.env.TRY_FORCE_TMAP === "1";

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

  const points = members.map((m: { lat: number; lng: number }) => ({
    lat: m.lat,
    lng: m.lng,
  }));

  try {
    // 후보 목록 하나로 세 기준을 모두 매기므로 2단계 자리도 기준별로 나눠 쓴다
    let trace: RecommendTrace | null = null;
    let transitProvider: "kakao" | "tmap" = "kakao";
    if (!forceTmap && Date.now() >= kakaoTransitExhaustedUntil) {
      let transitQuotaHit = false;
      try {
        ({ trace } = await recommendStations(points, {
          refineCriteria: TRY_REFINE_CRITERIA,
          fetchMinutes: async (start, end) => {
            try {
              return await fetchTransitMinutes(start, end);
            } catch (e) {
              if (e instanceof KakaoQuotaExceededError) transitQuotaHit = true;
              throw e;
            }
          },
        }));
      } catch (e) {
        if (!transitQuotaHit) throw e;
        kakaoTransitExhaustedUntil = nextKstMidnight(Date.now());
      }
    }
    if (!trace) {
      // 카카오와 TMAP은 같은 구간도 몇 분씩 달라서 한 계산 안에서 섞지 않고, 처음부터 TMAP으로 다시 계산한다
      const maxCalls =
        (RECOMMEND_PARAMS.TRANSIT_CANDIDATES + TRY_REFINE_CRITERIA.length) * points.length;
      if (!(await reserveTmapCalls(maxCalls))) {
        return NextResponse.json({ error: "closed" }, { status: 429 });
      }
      transitProvider = "tmap";
      ({ trace } = await recommendStations(points, {
        refineCriteria: TRY_REFINE_CRITERIA,
        fetchMinutes: fetchTmapTransitMinutes,
      }));
    }

    const processInfo = {
      stationCount: STATION_COUNT,
      minVenues: RECOMMEND_PARAMS.MIN_VENUES,
      venueRadius: RECOMMEND_PARAMS.VENUE_RADIUS_METERS,
      resultCount: RECOMMEND_PARAMS.RESULT_COUNT,
      transitProvider,
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
      Object.entries(SCORE_MODES).map(([mode, criterion]) => [
        mode,
        rankCandidates(trace.candidates, criterion).map((c) => c.station.id),
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
    if (e instanceof TmapError) {
      console.error(e);
      return NextResponse.json({ error: "transit_failed" }, { status: 502 });
    }
    throw e;
  }
}
