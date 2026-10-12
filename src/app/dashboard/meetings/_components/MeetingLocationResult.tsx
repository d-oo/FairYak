"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { mapWithConcurrency } from "@/utils/concurrency";
import RecommendMap from "@/app/_components/RecommendMap";
import SectionHeader from "@/app/_components/SectionHeader";
import UpdateProgress from "@/app/dashboard/meetings/_components/UpdateProgress";

interface RecommendedLocation {
  id: number;
  stationId: string;
  placeName: string;
  lat: number;
  lng: number;
}

interface MemberLocation {
  name: string;
  lat: number;
  lng: number;
  isMe: boolean;
}

// /api/location/recommend가 돌려주는 추천 역 (공공데이터 역 목록 기준)
interface RecommendedStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// 다른 멤버가 계산 중일 때 결과를 다시 확인하는 간격
const CALC_RETRY_DELAY_MS = 20000;

// /api/location/recommend 실패 코드별 안내 문구
const RECOMMEND_ERROR_MESSAGES: Record<number, string> = {
  429: "오늘 이동시간 조회 한도를 초과했어요. 내일 다시 시도해 주세요",
  422: "대중교통으로 모두가 갈 수 있는 역을 찾지 못했어요",
};

interface Props {
  meetingId: number;
  memberCount: number;
  currentUserId: string;
}

function formatTravelTime(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${minutes}분`;
}

// 내 이동시간 조회(/api/transit/time → 카카오 대중교통 경로 조회) 동시 요청 수
const TRANSIT_CONCURRENCY = 5;

// 대중교통 최단 소요시간(분). 경로가 없거나 조회에 실패하면 null.
// 카카오 정책상 결과를 저장·캐시할 수 없으므로 필요할 때마다 조회한다.
async function fetchTransitTime(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<number | null> {
  const res = await fetch(
    `/api/transit/time?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.minutes ?? null;
}

// 모임 상세의 지도 블록: 멤버 출발지·추천 역 지도 + 추천 장소 패널(04)
export default function MeetingLocationResult({
  meetingId,
  memberCount,
  currentUserId,
}: Props) {
  const supabase = createClient();
  const isCalculatingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 마지막으로 내 이동시간을 조회한 (내 출발지 + 추천 장소 목록). 같은 조합이면 다시 조회하지 않는다.
  const travelTimesKeyRef = useRef<string | null>(null);
  // 마지막으로 노선을 조회한 역 id 목록
  const stationLinesKeyRef = useRef<string | null>(null);
  // 마지막으로 불러온 추천 결과. 결과가 바뀌면 지도·목록 선택을 전체 선택으로 되돌린다.
  const resultKeyRef = useRef<string | null>(null);

  const [locations, setLocations] = useState<RecommendedLocation[]>([]);
  const [memberLocations, setMemberLocations] = useState<MemberLocation[]>([]);
  // 추천 장소 id → 내 이동시간(분). 저장하지 않고 화면에 있는 동안만 들고 있는다.
  const [myTravelTimes, setMyTravelTimes] = useState<Record<number, number>>(
    {},
  );
  // 역 id → 노선 목록 (공공데이터)
  const [stationLines, setStationLines] = useState<Record<string, string[]>>(
    {},
  );
  // 지도와 목록에서 선택된 추천 장소 순번들 (0 = 1위). 기본은 전체 선택, 누를 때마다 켜고 끈다
  const [selected, setSelected] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  // 다른 멤버가 계산 중이라 결과를 기다리는 상태
  const [isWaitingForOther, setIsWaitingForOther] = useState(false);
  const [allUpdated, setAllUpdated] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);
  // 최신 멤버 수. 보는 도중 누가 들어오거나 나가도 대기 문구가 맞도록 조회할 때마다 갱신한다
  const [currentMemberCount, setCurrentMemberCount] = useState(memberCount);
  const [error, setError] = useState<string | null>(null);


  // 추천 결과 저장 시 Realtime 이벤트가 여러 번 와서 fetchData가 반복 호출되므로,
  // 내 출발지와 추천 장소 목록이 그대로면 다시 조회하지 않는다.
  async function fetchMyTravelTimes(
    myCoord: { lat: number; lng: number },
    locs: RecommendedLocation[],
  ) {
    const key = `${myCoord.lat},${myCoord.lng}|${locs.map((l) => l.id).join(",")}`;
    if (travelTimesKeyRef.current === key) return;
    travelTimesKeyRef.current = key;

    try {
      const times = await mapWithConcurrency(locs, TRANSIT_CONCURRENCY, (loc) =>
        fetchTransitTime(myCoord.lat, myCoord.lng, loc.lat, loc.lng),
      );
      if (travelTimesKeyRef.current !== key) return;
      const result: Record<number, number> = {};
      locs.forEach((loc, i) => {
        const t = times[i];
        if (t !== null) result[loc.id] = t;
      });
      setMyTravelTimes(result);
    } catch {
      // 네트워크 오류 등으로 실패하면 이동시간만 표시하지 않는다. 다음 fetchData에서 다시 시도한다.
      travelTimesKeyRef.current = null;
    }
  }

  // 저장된 결과에는 역 id만 있으므로 노선은 서버(/api/stations)에서 찾아온다
  async function fetchStationLines(stationIds: string[]) {
    const key = stationIds.join(",");
    if (stationLinesKeyRef.current === key) return;
    stationLinesKeyRef.current = key;

    try {
      const res = await fetch(`/api/stations?ids=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error();
      const { stations }: { stations: { id: string; lines: string[] }[] } =
        await res.json();
      if (stationLinesKeyRef.current !== key) return;
      setStationLines(Object.fromEntries(stations.map((s) => [s.id, s.lines])));
    } catch {
      // 노선 없이 역 이름만 표시한다. 다음 fetchData에서 다시 시도한다.
      stationLinesKeyRef.current = null;
    }
  }

  async function fetchData() {
    if (!meetingId) return;

    // 멤버 출발지 (지도 표시용 - 이름 포함)
    const [{ data: memberCoords }, { data: membersData }] = await Promise.all([
      supabase
        .from("member_coordinates")
        .select("user_id, lat, lng")
        .eq("meeting_id", meetingId),
      supabase
        .from("members")
        .select("user_id, profiles(name)")
        .eq("meeting_id", meetingId),
    ]);
    const nameMap = new Map(
      (membersData ?? []).map((m) => [
        m.user_id,
        (m.profiles as unknown as { name: string } | null)?.name ?? "멤버",
      ]),
    );
    setMemberLocations(
      (memberCoords ?? []).map((m) => ({
        name: nameMap.get(m.user_id) ?? "멤버",
        lat: m.lat,
        lng: m.lng,
        isMe: m.user_id === currentUserId,
      })),
    );

    // 추천 장소 확인
    const { data: existing } = await supabase
      .from("recommended_location_coordinates")
      .select("id, station_id, place_name, lat, lng")
      .eq("meeting_id", meetingId)
      .order("rank");

    if (existing && existing.length > 0) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      const locs = existing.map((r) => ({
        id: r.id,
        stationId: r.station_id,
        placeName: r.place_name,
        lat: r.lat,
        lng: r.lng,
      }));
      const resultKey = locs.map((l) => l.id).join(",");
      if (resultKeyRef.current !== resultKey) {
        resultKeyRef.current = resultKey;
        setSelected(locs.map((_, i) => i));
      }
      setLocations(locs);
      fetchStationLines(locs.map((l) => l.stationId));
      const myCoord = (memberCoords ?? []).find(
        (m) => m.user_id === currentUserId,
      );
      if (myCoord) fetchMyTravelTimes(myCoord, locs);
      setAllUpdated(true);
      setIsWaitingForOther(false);
      setError(null);
      setIsLoading(false);
      return;
    }
    setLocations([]);

    // 업데이트 현황 확인
    const { data: members } = await supabase
      .from("members")
      .select("user_id, departure_location")
      .eq("meeting_id", meetingId);

    const freshMemberCount = (members ?? []).length;
    const membersWithLocation = (members ?? []).filter(
      (m) => m.departure_location !== null,
    );

    const { data: futureSchedules } = await supabase
      .from("member_schedules")
      .select("user_id")
      .eq("meeting_id", meetingId)
      .gte("free_date", new Date().toISOString().split("T")[0]);

    const userIdsWithSchedules = new Set(
      (futureSchedules ?? []).map((s) => s.user_id),
    );
    const updated = membersWithLocation.filter((m) =>
      userIdsWithSchedules.has(m.user_id),
    ).length;
    setCurrentMemberCount(freshMemberCount);
    setUpdatedCount(updated);

    if (updated < freshMemberCount) {
      setAllUpdated(false);
      setIsWaitingForOther(false);
      setIsLoading(false);
      return;
    }

    setAllUpdated(true);
    if (!isCalculatingRef.current) await calculate();
  }

  async function calculate() {
    if (isCalculatingRef.current) return;
    isCalculatingRef.current = true;

    // 모임당 한 명만 계산하도록 락을 잡는다. 못 잡으면 다른 멤버가 계산 중이거나 이미 결과가 저장된 것.
    const { data: token, error: claimError } = await supabase.rpc(
      "claim_location_calculation",
      { p_meeting_id: meetingId },
    );
    if (claimError || !token) {
      isCalculatingRef.current = false;
      if (claimError) {
        setError("장소 계산을 시작하지 못했어요");
      } else {
        setIsWaitingForOther(true);
        scheduleRetry();
      }
      setIsLoading(false);
      return;
    }

    setIsWaitingForOther(false);
    setIsCalculating(true);
    setError(null);
    let shouldRefetch = false;

    try {
      // 후보 선정·이동시간 조회·순위 계산은 서버에서 한다 (카카오 키와 역 목록이 서버에 있음)
      const res = await fetch("/api/location/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      if (!res.ok)
        throw new Error(
          RECOMMEND_ERROR_MESSAGES[res.status] ??
            "장소 계산 중 오류가 발생했어요",
        );
      const { stations }: { stations: RecommendedStation[] } =
        await res.json();

      const { error: saveError } = await supabase.rpc(
        "save_recommended_locations",
        {
          p_meeting_id: meetingId,
          p_token: token,
          // 공공데이터 역 정보와 순위만 저장한다 (카카오 응답인 이동시간·장소명은 저장 불가)
          p_locations: stations.map((s, i) => ({
            station_id: s.id,
            rank: i + 1,
            place_name: s.name,
            lat: s.lat,
            lng: s.lng,
          })),
        },
      );
      if (saveError) throw new Error("추천 장소를 저장하지 못했어요");
      // RPC가 true면 저장된 결과를 불러오고, false면(계산 도중 출발지·일정이 바뀌어
      // 락이 풀림) 바뀐 입력으로 다시 계산한다. 둘 다 fetchData가 처리한다.
      shouldRefetch = true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "장소 계산 중 오류가 발생했어요",
      );
      await supabase.rpc("release_location_calculation", {
        p_meeting_id: meetingId,
        p_token: token,
      });
    } finally {
      isCalculatingRef.current = false;
      setIsCalculating(false);
      setIsLoading(false);
    }
    if (shouldRefetch) await fetchData();
  }

  // 다른 멤버의 계산이 끝나면 보통 Realtime으로 결과가 오지만,
  // 그 멤버가 계산 도중 탭을 닫으면 결과가 오지 않으므로 주기적으로 다시 확인한다.
  function scheduleRetry() {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      fetchData();
    }, CALC_RETRY_DELAY_MS);
  }

  const showSkeleton =
    isLoading || ((isCalculating || isWaitingForOther) && allUpdated);
  const showResult =
    !isLoading && !isCalculating && !error && locations.length > 0;

  // 최신 state로 fetchData를 부르되, 매 렌더 새로 만들어지는 fetchData 때문에 구독을 다시 하지 않도록 Effect Event로 감싼다
  const loadData = useEffectEvent(() => fetchData());

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      await loadData();
      if (isCancelled) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token)
        supabase.realtime.setAuth(session.access_token);
      if (isCancelled) return;

      channel = supabase
        .channel(`recommended-locations-${meetingId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "recommended_locations",
            filter: `meeting_id=eq.${meetingId}`,
          },
          () => {
            if (!isCancelled) loadData();
          },
        )
        .subscribe();
    }

    setup();
    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [meetingId, supabase]);

  function toggleSelected(index: number) {
    setSelected((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b),
    );
  }

  return (
    <div className="relative border border-ink bg-map-bg">
      <RecommendMap
        members={memberLocations.map((m) => ({
          label: m.isMe ? `${m.name} (나)` : m.name,
          lat: m.lat,
          lng: m.lng,
          isMe: m.isMe,
        }))}
        stations={
          showResult
            ? locations.map((l) => ({
                label: l.placeName,
                lat: l.lat,
                lng: l.lng,
              }))
            : []
        }
        selected={selected}
        onToggle={toggleSelected}
        hasLeftPanel
        className="relative h-80 overflow-hidden wide:h-135"
      />

      {/* 추천 장소 패널: 넓은 화면에서는 지도 위 왼쪽, 좁은 화면에서는 지도 아래 */}
      <div className="relative z-2 border-t border-ink bg-paper wide:absolute wide:top-4 wide:left-4 wide:w-85 wide:border">
        <SectionHeader title="추천 장소" />

        {!isLoading && !allUpdated && (
          <UpdateProgress total={currentMemberCount} updated={updatedCount} />
        )}

        {showSkeleton && (
          <div className="pb-4">
            <div className="flex flex-col gap-px bg-rule">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-[34px_1fr] bg-paper px-4.5 py-3.5"
                >
                  <span className="mt-0.75 h-3 w-4 bg-track" />
                  <span>
                    <span className="block h-3.25 w-3/5 bg-track" />
                    <span className="mt-2 block h-2.5 w-[35%] bg-page" />
                  </span>
                </div>
              ))}
            </div>
            {(isCalculating || isWaitingForOther) && (
              <p className="mx-4.5 mt-3.5 text-center text-xs text-muted">
                최적 장소를 계산하고 있어요...
              </p>
            )}
          </div>
        )}

        {!isLoading && !isCalculating && !isWaitingForOther && error && (
          <p className="p-4.5 text-sm text-muted">{error}</p>
        )}

        {showResult && (
          <div className="flex flex-col gap-px bg-rule">
            {locations.map((loc, i) => {
              const isSelected = selected.includes(i);
              const lines = stationLines[loc.stationId] ?? [];
              return (
                <button
                  key={loc.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleSelected(i)}
                  className={`grid w-full cursor-pointer grid-cols-[34px_minmax(0,1fr)] px-4.5 py-3.25 text-left text-ink hover:bg-row-hover ${
                    isSelected ? "bg-accent-soft" : "bg-paper"
                  }`}
                >
                  <span
                    className={`pt-px font-mono text-[13px] ${
                      isSelected ? "text-accent-text" : "text-faint"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-[15px] ${isSelected ? "font-semibold" : "font-medium"}`}
                    >
                      {loc.placeName}
                      {lines.length > 0 && ` ${lines.join(", ")}`}
                    </span>
                    {myTravelTimes[loc.id] !== undefined && (
                      <span className="mt-0.75 block font-mono text-xs text-muted">
                        이동시간 약 {formatTravelTime(myTravelTimes[loc.id])}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
