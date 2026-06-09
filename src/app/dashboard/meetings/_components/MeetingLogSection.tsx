"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

interface LogItem {
  id: number;
  userName: string | null;
  type: string;
  createdAt: string;
}

interface Props {
  meetingId: number;
}

function getLogDisplay(
  type: string,
  userName: string | null,
): { icon: string; text: string } {
  switch (type) {
    case "member_joined":
      return { icon: "👋", text: `${userName}님이 참여했어요` };
    case "member_left":
      return { icon: "🚪", text: `${userName}님이 나갔어요` };
    case "updated":
      return { icon: "🔄", text: `${userName}님이 업데이트했어요` };
    case "result_updated":
      return { icon: "✨", text: "추천 결과가 업데이트됐어요" };
    default:
      return { icon: "📝", text: "알 수 없는 활동" };
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
  }, [meetingId]);

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
      <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">활동 로그</h2>

      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#f0f2f5] shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[#f0f2f5] rounded w-48" />
                <div className="h-2.5 bg-[#f0f2f5] rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <p className="text-sm text-[#9ca3af] text-center py-4">
          아직 활동이 없어요
        </p>
      )}

      {!isLoading && logs.length > 0 && (
        <ul className="space-y-3">
          {logs.map((log) => {
            const { icon, text } = getLogDisplay(log.type, log.userName);
            return (
              <li key={log.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#f0f2f5] flex items-center justify-center text-sm shrink-0">
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#374151]">{text}</p>
                </div>
                <span className="text-xs text-[#9ca3af] shrink-0">
                  {formatTime(log.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
