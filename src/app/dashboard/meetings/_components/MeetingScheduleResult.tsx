"use client";

import { useState, useEffect, useEffectEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import { MiniCalendar } from "@/app/dashboard/_components/Calendar";
import SectionHeader from "@/app/_components/SectionHeader";
import UpdateProgress from "@/app/dashboard/meetings/_components/UpdateProgress";

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
  const todayStr = toDateStr(new Date());

  const [isLoading, setIsLoading] = useState(true);
  const [updatedCount, setUpdatedCount] = useState(0);
  // 최신 멤버 수. 보는 도중 누가 들어오거나 나가도 대기 문구·인원 수가 맞도록 조회할 때마다 갱신한다
  const [currentMemberCount, setCurrentMemberCount] = useState(memberCount);
  const [result, setResult] = useState<ScheduleResult | null>(null);


  async function fetchData() {
    // 1. 최신 멤버 현황 확인
    const { data: members } = await supabase
      .from("members")
      .select("user_id, departure_location")
      .eq("meeting_id", meetingId);

    const freshMemberCount = (members ?? []).length;
    const membersWithLocation = (members ?? []).filter(
      (m) => m.departure_location !== null,
    );

    // 미래 member_schedules가 있는 멤버만 "업데이트 완료"로 판단
    const { data: futureSchedules } = await supabase
      .from("member_schedules")
      .select("user_id, free_date")
      .eq("meeting_id", meetingId)
      .gte("free_date", todayStr);

    const userIdsWithFutureSchedules = new Set(
      (futureSchedules ?? []).map((s) => s.user_id),
    );
    const updated = membersWithLocation.filter((m) =>
      userIdsWithFutureSchedules.has(m.user_id),
    ).length;
    setCurrentMemberCount(freshMemberCount);
    setUpdatedCount(updated);

    if (updated < freshMemberCount) {
      setResult(null);
      setIsLoading(false);
      return;
    }

    // 2. 날짜별 인원 수 집계 (step 1에서 조회한 futureSchedules 재사용)
    const dateMap = new Map<string, number>();
    for (const s of futureSchedules ?? []) {
      dateMap.set(s.free_date, (dateMap.get(s.free_date) ?? 0) + 1);
    }

    // 4. 완벽한 공통 한가일 찾기
    const perfectDates = [...dateMap.entries()]
      .filter(([, count]) => count === freshMemberCount)
      .map(([date]) => date)
      .sort();

    if (perfectDates.length > 0) {
      setResult({ type: "perfect", dates: perfectDates });
    } else {
      const maxCount = Math.max(...dateMap.values());
      const partialDates = [...dateMap.entries()]
        .filter(([, count]) => count === maxCount)
        .map(([date]) => date)
        .sort();
      setResult({
        type: "partial",
        dates: partialDates,
        partialCount: maxCount,
      });
    }

    setIsLoading(false);
  }

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
        .channel(`schedule-result-${meetingId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "member_schedules" },
          () => {
            if (!isCancelled) loadData();
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "members" },
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
    };
  }, [meetingId, supabase]);

  const markedDates =
    result?.type === "perfect" ? new Set(result.dates) : new Set<string>();
  const secondaryDates =
    result?.type === "partial" ? new Set(result.dates) : new Set<string>();
  const listDates = result?.dates.slice(0, 5) ?? [];

  return (
    <section className="border border-ink bg-paper">
      <SectionHeader title="추천 일정" />

      {/* 업데이트 대기 */}
      {!isLoading && updatedCount < currentMemberCount && (
        <UpdateProgress total={currentMemberCount} updated={updatedCount} />
      )}

      {/* 결과 */}
      {!isLoading &&
        updatedCount >= currentMemberCount &&
        result &&
        result.dates.length > 0 && (
          <div className="px-4.5 pt-3.5 pb-4.5">
            {result.type === "perfect" ? (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="size-2 flex-none bg-accent" />
                <span>모두가 한가한 날이 있어요</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-[13px] leading-normal">
                <span className="mt-1.5 size-2 flex-none bg-accent-tint shadow-[inset_0_0_0_1px_var(--accent)]" />
                <span>
                  모두가 한가한 날은 없어요 — 가장 많은 {result.partialCount}/
                  {currentMemberCount}명이 한가한 날을 추천해요
                </span>
              </div>
            )}

            <div className="mt-3 mb-4.5 border-t border-ink">
              <ul className="flex flex-col gap-px border-b border-rule bg-rule">
                {listDates.map((date) => (
                  <li
                    key={date}
                    className="flex items-baseline justify-between gap-3 bg-paper py-2.5"
                  >
                    <span className="text-xl font-semibold tracking-[-0.02em]">
                      {formatKoreanDate(date)}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {result.type === "partial" &&
                        `${result.partialCount}/${currentMemberCount}명`}
                    </span>
                  </li>
                ))}
              </ul>
              {result.dates.length > 5 && (
                <p className="mt-2 text-center text-xs text-muted">
                  외 {result.dates.length - 5}개 날짜가 있어요
                </p>
              )}
            </div>

            <MiniCalendar
              markedDates={markedDates}
              secondaryDates={secondaryDates}
            />
          </div>
        )}

      {isLoading && (
        <div className="animate-pulse px-4.5 pt-3.5 pb-4.5">
          <div className="h-4 w-48 bg-track" />
          <div className="mt-3 flex flex-col gap-3 border-t border-ink pt-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-40 bg-track" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
