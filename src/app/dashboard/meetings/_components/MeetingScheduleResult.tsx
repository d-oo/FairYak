"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "@/app/dashboard/_components/Calendar";

interface Props {
  meetingId: number;
  memberCount: number;
}

interface ScheduleResult {
  type: "perfect" | "partial";
  dates: string[];
  partialCount?: number;
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatKoreanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${month}월 ${day}일 (${days[date.getDay()]})`;
}

export default function MeetingScheduleResult({
  meetingId,
  memberCount,
}: Props) {
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const todayStr = toDateStr(new Date());

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
        .channel(`schedule-result-${meetingId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "member_schedules" },
          () => {
            if (!isCancelled) fetchData();
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "members" },
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

  async function fetchData() {
    // 1. 모든 멤버 업데이트 여부 확인 (departure_location이 있으면 업데이트한 것)
    const { data: members } = await supabase
      .from("members")
      .select("departure_location")
      .eq("meeting_id", meetingId);

    const updated = (members ?? []).filter(
      (m) => m.departure_location !== null,
    ).length;
    setUpdatedCount(updated);

    if (updated < memberCount) {
      setResult(null);
      // 미완료 상태면 기존 추천 결과 삭제
      await supabase
        .from("recommended_schedules")
        .delete()
        .eq("meeting_id", meetingId);
      setIsLoading(false);
      return;
    }

    // 2. member_schedules 조회
    const { data: schedules } = await supabase
      .from("member_schedules")
      .select("user_id, free_date")
      .eq("meeting_id", meetingId)
      .gte("free_date", todayStr);

    // 3. 날짜별 인원 수 집계
    const dateMap = new Map<string, number>();
    for (const s of schedules ?? []) {
      dateMap.set(s.free_date, (dateMap.get(s.free_date) ?? 0) + 1);
    }

    // 4. 완벽한 공통 한가일 찾기
    const perfectDates = [...dateMap.entries()]
      .filter(([_, count]) => count === memberCount)
      .map(([date]) => date)
      .sort();

    let datesToStore: string[];

    if (perfectDates.length > 0) {
      setResult({ type: "perfect", dates: perfectDates });
      datesToStore = perfectDates;
    } else {
      const maxCount = Math.max(...dateMap.values());
      const partialDates = [...dateMap.entries()]
        .filter(([_, count]) => count === maxCount)
        .map(([date]) => date)
        .sort();
      setResult({
        type: "partial",
        dates: partialDates,
        partialCount: maxCount,
      });
      datesToStore = partialDates;
    }

    // 5. recommended_schedules 업데이트 (기존 삭제 후 재삽입)
    await supabase
      .from("recommended_schedules")
      .delete()
      .eq("meeting_id", meetingId);
    if (datesToStore.length > 0) {
      await supabase
        .from("recommended_schedules")
        .insert(
          datesToStore.map((date) => ({
            meeting_id: meetingId,
            common_free_date: date,
          })),
        );
    }

    setIsLoading(false);
  }

  const markedDates =
    result?.type === "perfect" ? new Set(result.dates) : new Set<string>();

  const secondaryDates =
    result?.type === "partial" ? new Set(result.dates) : new Set<string>();

  const listDates = result?.dates.slice(0, 5) ?? [];

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
      <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">추천 일정</h2>

      {/* 업데이트 대기 */}
      {!isLoading && updatedCount < memberCount && (
        <div className="text-center py-6 space-y-2">
          <p className="text-2xl">📅</p>
          <p className="text-sm text-[#6b7280]">
            아직 모든 인원이 업데이트하지 않았어요
          </p>
          <p className="text-xs text-[#9ca3af]">
            {memberCount}명 중 {updatedCount}명 완료
          </p>
          {/* 진행 바 */}
          <div className="mx-auto w-48 h-1.5 bg-[#f0f2f5] rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-[#4ecdc4] rounded-full transition-all"
              style={{ width: `${(updatedCount / memberCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 결과 */}
      {!isLoading &&
        updatedCount >= memberCount &&
        result &&
        result.dates.length > 0 && (
          <div className="space-y-5">
            {/* 상태 배지 */}
            {result.type === "perfect" ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#4ecdc4]/10 text-[#0d9488] text-xs font-semibold">
                ✅ 모두가 한가한 날이 있어요
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fef3c7] text-[#92400e] text-xs font-semibold">
                📊 모두가 한가한 날은 없어요 — 가장 많은 {result.partialCount}/
                {memberCount}명이 한가한 날을 추천해요
              </div>
            )}

            {/* 날짜 리스트 (최대 5개) */}
            <ul className="space-y-2">
              {listDates.map((date) => (
                <li
                  key={date}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                    result.type === "perfect"
                      ? "bg-[#f0faf9] border border-[#4ecdc4]/30"
                      : "bg-[#fffbeb] border border-[#fcd34d]/50"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      result.type === "perfect"
                        ? "bg-[#4ecdc4]"
                        : "bg-[#fbbf24]"
                    }`}
                  />
                  <span
                    className={`text-sm font-semibold ${
                      result.type === "perfect"
                        ? "text-[#0d9488]"
                        : "text-[#92400e]"
                    }`}
                  >
                    {formatKoreanDate(date)}
                  </span>
                  {result.type === "partial" && (
                    <span className="ml-auto text-xs text-[#92400e]/70">
                      {result.partialCount}/{memberCount}명
                    </span>
                  )}
                </li>
              ))}
              {result.dates.length > 5 && (
                <p className="text-xs text-[#9ca3af] text-center">
                  외 {result.dates.length - 5}개 날짜가 있어요
                </p>
              )}
            </ul>

            {/* 달력 */}
            <Calendar
              markedDates={markedDates}
              secondaryDates={secondaryDates}
              markedLabel="공통"
              secondaryLabel="차선"
            />
          </div>
        )}

      {isLoading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-7 w-48 bg-[#f0f2f5] rounded-full" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-[#f0f2f5] rounded-xl" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
