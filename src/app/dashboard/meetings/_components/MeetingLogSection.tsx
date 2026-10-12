"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import SectionHeader from "@/app/_components/SectionHeader";

interface LogItem {
  id: number;
  userName: string | null;
  type: string;
  createdAt: string;
}

interface Props {
  meetingId: number;
}

function getLogText(type: string, userName: string | null): string {
  switch (type) {
    case "member_joined":
      return `${userName}님이 참여했어요`;
    case "member_left":
      return `${userName}님이 나갔어요`;
    case "updated":
      return `${userName}님이 업데이트했어요`;
    case "result_updated":
      return "추천 결과가 업데이트됐어요";
    default:
      return "알 수 없는 활동";
  }
}

function formatTime(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

export default function MeetingLogSection({ meetingId }: Props) {
  const supabase = createClient();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      const { data } = await supabase
        .from("meeting_logs")
        .select("id, user_name, type, created_at")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: false });

      if (!isCancelled) {
        setLogs(
          (data ?? []).map((r) => ({
            id: r.id,
            userName: r.user_name,
            type: r.type,
            createdAt: r.created_at,
          })),
        );
        setIsLoading(false);
      }
      if (isCancelled) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token)
        supabase.realtime.setAuth(session.access_token);
      if (isCancelled) return;

      channel = supabase
        .channel(`meeting-logs-${meetingId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "meeting_logs",
            filter: `meeting_id=eq.${meetingId}`,
          },
          (payload) => {
            if (isCancelled) return;
            const r = payload.new as {
              id: number;
              user_name: string | null;
              type: string;
              created_at: string;
            };
            setLogs((prev) => [
              {
                id: r.id,
                userName: r.user_name,
                type: r.type,
                createdAt: r.created_at,
              },
              ...prev,
            ]);
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

  return (
    <section className="border border-ink bg-paper">
      <SectionHeader title="활동 로그" />

      {isLoading && (
        <div className="flex animate-pulse flex-col gap-px bg-rule">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[72px_minmax(0,1fr)] bg-paper px-4.5 py-2.5"
            >
              <div className="mt-0.5 h-3 w-10 bg-track" />
              <div className="h-4 w-2/3 bg-track" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <p className="p-4.5 text-center text-sm text-faint">아직 활동이 없어요</p>
      )}

      {!isLoading && logs.length > 0 && (
        <ul className="flex flex-col gap-px bg-rule">
          {logs.map((log) => (
            <li
              key={log.id}
              className="grid grid-cols-[72px_minmax(0,1fr)] bg-paper px-4.5 py-2.5 text-sm"
            >
              <span className="pt-0.5 font-mono text-xs text-faint">
                {formatTime(log.createdAt)}
              </span>
              <span>{getLogText(log.type, log.userName)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
