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
}

interface MemberCoord {
  lat: number;
  lng: number;
}

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
  const isFetchingTravelTimesRef = useRef(false);

  const [locations, setLocations] = useState<RecommendedLocation[]>([]);
  const [memberLocations, setMemberLocations] = useState<MemberMapLocation[]>(
    [],
  );
  const [travelTimes, setTravelTimes] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
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
    };
  }, [meetingId]);

  async function fetchMyTravelTimes(locs: RecommendedLocation[]) {
    if (isFetchingTravelTimesRef.current) return;
    isFetchingTravelTimesRef.current = true;

    try {
      const { data: myCoords } = await supabase
        .from("member_coordinates")
        .select("lat, lng")
        .eq("meeting_id", meetingId)
        .eq("user_id", currentUserId)
        .single();

      if (!myCoords) return;

      const times = await Promise.all(
        locs.map((loc) =>
          fetchTransitTime(myCoords.lat, myCoords.lng, loc.lat, loc.lng),
        ),
      );
      const result: Record<number, number> = {};
      locs.forEach((loc, i) => {
        result[loc.id] = times[i];
      });
      setTravelTimes(result);
    } finally {
      isFetchingTravelTimesRef.current = false;
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
      .select("id, place_name, lat, lng")
      .eq("meeting_id", meetingId);

    if (existing && existing.length > 0) {
      const locs = existing.map((r) => ({
        id: r.id,
        placeName: r.place_name,
        lat: r.lat,
        lng: r.lng,
      }));
      setLocations(locs);
      setAllUpdated(true);
      setIsLoading(false);
      fetchMyTravelTimes(locs);
      return;
    }

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
      setIsLoading(false);
      return;
    }

    setAllUpdated(true);
    if (!isCalculatingRef.current) await calculate();
  }

  async function calculate() {
    if (isCalculatingRef.current) return;
    isCalculatingRef.current = true;
    setIsCalculating(true);
    setError(null);

    try {
      const { data: memberCoordsData } = await supabase
        .from("member_coordinates")
        .select("lat, lng")
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
          return { ...candidate, maxTime, avgTime };
        }),
      );

      scored.sort((a, b) =>
        a.maxTime !== b.maxTime ? a.maxTime - b.maxTime : a.avgTime - b.avgTime,
      );
      const top5 = scored.slice(0, 5);

      await supabase
        .from("recommended_locations")
        .delete()
        .eq("meeting_id", meetingId);
      await supabase.from("recommended_locations").insert(
        top5.map((c) => ({
          meeting_id: meetingId,
          recommended_location: `POINT(${c.lng} ${c.lat})`,
          recommended_address: c.name,
        })),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "장소 계산 중 오류가 발생했어요",
      );
    } finally {
      isCalculatingRef.current = false;
      setIsCalculating(false);
      setIsLoading(false);
    }
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

      {(isLoading || isCalculating) && allUpdated && (
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
          {isCalculating && (
            <p className="text-xs text-center text-[#9ca3af]">
              최적 장소를 계산하고 있어요...
            </p>
          )}
        </div>
      )}

      {!isLoading && !isCalculating && error && (
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
                  {travelTimes[loc.id] !== undefined &&
                    travelTimes[loc.id] < 9999 && (
                      <p className="text-xs text-[#4ecdc4] mt-0.5">
                        이동시간 약 {formatTravelTime(travelTimes[loc.id])}
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
