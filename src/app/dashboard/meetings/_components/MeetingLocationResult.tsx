"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import dynamic from "next/dynamic";
import { type MapLocation, type MemberMapLocation } from "./KakaoMap";

const KakaoMap = dynamic(() => import("./KakaoMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-xl bg-[#f0f2f5] border border-[#e9ebee] animate-pulse" />
  ),
});

interface RecommendedLocation {
  id: number;
  placeName: string;
  lat: number;
  lng: number;
  // user_id → 이동시간(분). ODsay 조회에 실패한 멤버는 키가 없다.
  travelTimes: Record<string, number>;
}

interface MemberCoord {
  user_id: string;
  lat: number;
  lng: number;
}

// 다른 멤버가 계산 중일 때 결과를 다시 확인하는 간격
const CALC_RETRY_DELAY_MS = 20000;

interface Candidate {
  name: string;
  lat: number;
  lng: number;
}

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

function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const baseName = c.name.split(" ")[0];
    if (!groups.has(baseName)) groups.set(baseName, []);
    groups.get(baseName)!.push(c);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const baseName = group[0].name.split(" ")[0];
    const lines = group
      .map((c) => c.name.split(" ").slice(1).join(" "))
      .filter(Boolean);
    return {
      name: `${baseName} ${lines.join(", ")}`,
      lat: group[0].lat,
      lng: group[0].lng,
    };
  });
}

async function fetchCandidates(
  lat: number,
  lng: number,
  radius: number,
  category: string,
): Promise<Candidate[]> {
  const res = await fetch(
    `/api/location/candidates?lat=${lat}&lng=${lng}&radius=${radius}&category=${category}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.places ?? [];
}

async function fetchTransitTime(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<number> {
  const apiKey = encodeURIComponent(
    process.env.NEXT_PUBLIC_ODSAY_API_KEY ?? "",
  );
  const url = `https://api.odsay.com/v1/api/searchPubTransPathT?SX=${startLng}&SY=${startLat}&EX=${endLng}&EY=${endLat}&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return 9999;
  const data = await res.json();
  if (data.error) return 9999;
  return data.result?.path?.[0]?.info?.totalTime ?? 9999;
}

export default function MeetingLocationResult({
  meetingId,
  memberCount,
  currentUserId,
}: Props) {
  const supabase = createClient();
  const isCalculatingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [locations, setLocations] = useState<RecommendedLocation[]>([]);
  const [memberLocations, setMemberLocations] = useState<MemberMapLocation[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  // 다른 멤버가 계산 중이라 결과를 기다리는 상태
  const [isWaitingForOther, setIsWaitingForOther] = useState(false);
  const [allUpdated, setAllUpdated] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      await fetchData();
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
            if (!isCancelled) fetchData();
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
  }, [meetingId]);

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
      .select("id, place_name, lat, lng, travel_times")
      .eq("meeting_id", meetingId);

    if (existing && existing.length > 0) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      setLocations(
        existing.map((r) => ({
          id: r.id,
          placeName: r.place_name,
          lat: r.lat,
          lng: r.lng,
          travelTimes: (r.travel_times ?? {}) as Record<string, number>,
        })),
      );
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
      const { data: memberCoordsData } = await supabase
        .from("member_coordinates")
        .select("user_id, lat, lng")
        .eq("meeting_id", meetingId);

      const memberCoords: MemberCoord[] = memberCoordsData ?? [];
      if (memberCoords.length === 0)
        throw new Error("멤버 좌표를 가져올 수 없어요");

      const centroid = {
        lat:
          memberCoords.reduce((sum, m) => sum + m.lat, 0) / memberCoords.length,
        lng:
          memberCoords.reduce((sum, m) => sum + m.lng, 0) / memberCoords.length,
      };

      let rawCandidates: Candidate[] = [];
      for (const radius of [10000, 20000, 30000]) {
        const results = await fetchCandidates(
          centroid.lat,
          centroid.lng,
          radius,
          "SW8",
        );
        if (results.length >= 1) {
          rawCandidates = results;
          break;
        }
      }
      if (rawCandidates.length < 1) {
        for (const radius of [10000, 20000, 30000]) {
          const results = await fetchCandidates(
            centroid.lat,
            centroid.lng,
            radius,
            "AT4",
          );
          if (results.length >= 1) {
            rawCandidates = results;
            break;
          }
        }
      }
      if (rawCandidates.length === 0)
        throw new Error("주변에 적합한 장소를 찾을 수 없어요");

      const candidates = deduplicateCandidates(rawCandidates);

      const scored = await Promise.all(
        candidates.map(async (candidate) => {
          const times = await Promise.all(
            memberCoords.map((m) =>
              fetchTransitTime(m.lat, m.lng, candidate.lat, candidate.lng),
            ),
          );
          const maxTime = Math.max(...times);
          const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
          // 화면에서 다시 ODsay를 호출하지 않도록 멤버별 이동시간을 함께 저장한다
          const travelTimes: Record<string, number> = {};
          memberCoords.forEach((m, i) => {
            if (times[i] < 9999) travelTimes[m.user_id] = times[i];
          });
          return { ...candidate, maxTime, avgTime, travelTimes };
        }),
      );

      scored.sort((a, b) =>
        a.maxTime !== b.maxTime ? a.maxTime - b.maxTime : a.avgTime - b.avgTime,
      );
      const top5 = scored.slice(0, 5);

      const { error: saveError } = await supabase.rpc(
        "save_recommended_locations",
        {
          p_meeting_id: meetingId,
          p_token: token,
          p_locations: top5.map((c) => ({
            place_name: c.name,
            lat: c.lat,
            lng: c.lng,
            travel_times: c.travelTimes,
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

  const mapLocations: MapLocation[] = locations.map((l) => ({
    name: l.placeName,
    address: l.placeName,
    lat: l.lat,
    lng: l.lng,
  }));

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
      <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">추천 장소</h2>

      {!isLoading && !allUpdated && (
        <div className="text-center py-6 space-y-2">
          <p className="text-2xl">📍</p>
          <p className="text-sm text-[#6b7280]">
            아직 모든 인원이 업데이트하지 않았어요
          </p>
          <p className="text-xs text-[#9ca3af]">
            {memberCount}명 중 {updatedCount}명 완료
          </p>
        </div>
      )}

      {(isLoading || isCalculating || isWaitingForOther) && allUpdated && (
        <div className="space-y-4 animate-pulse">
          <div className="w-full h-64 rounded-xl bg-[#f0f2f5] border border-[#e9ebee]" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f8f9fa] border border-[#e9ebee]"
              >
                <div className="w-6 h-6 rounded-full bg-[#e9ebee] shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-[#e9ebee] rounded w-32" />
                  <div className="h-3 bg-[#e9ebee] rounded w-16" />
                </div>
              </div>
            ))}
          </div>
          {(isCalculating || isWaitingForOther) && (
            <p className="text-xs text-center text-[#9ca3af]">
              최적 장소를 계산하고 있어요...
            </p>
          )}
        </div>
      )}

      {!isLoading && !isCalculating && !isWaitingForOther && error && (
        <div className="text-center py-6">
          <p className="text-2xl mb-2">😔</p>
          <p className="text-sm text-[#6b7280]">{error}</p>
        </div>
      )}

      {!isLoading && !isCalculating && !error && locations.length > 0 && (
        <div className="space-y-4">
          <KakaoMap
            locations={mapLocations}
            memberLocations={memberLocations}
          />
          <ul className="space-y-2">
            {locations.map((loc, i) => (
              <li
                key={loc.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f8f9fa] border border-[#e9ebee]"
              >
                <span className="w-6 h-6 rounded-full bg-[#0d1f2d] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#374151] truncate">
                    {loc.placeName}
                  </p>
                  {loc.travelTimes[currentUserId] !== undefined && (
                    <p className="text-xs text-[#4ecdc4] mt-0.5">
                      이동시간 약{" "}
                      {formatTravelTime(loc.travelTimes[currentUserId])}
                    </p>
                  )}
                </div>
                <span className="text-base shrink-0">📍</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
