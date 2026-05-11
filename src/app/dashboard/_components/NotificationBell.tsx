"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

interface InvitationItem {
  meetingId: number;
  meetingName: string;
  fromName: string;
  at: string;
  seen: boolean;
}

interface Props {
  userId: string;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function NotificationBell({ userId }: Props) {
  const supabase = createClient();

  const [isOpen, setIsOpen] = useState(false);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      await fetchInvitations();
      if (isCancelled) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (isCancelled) return;

      channel = supabase
        .channel(`invitations-bell-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "invitations" },
          (payload) => {
            const row = payload.new as { to_user: string };
            if (row.to_user !== userId) return;
            fetchInvitations();
          },
        )
        .subscribe();
    }

    setup();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        if (isOpen) closeBell();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, invitations]);

  async function fetchInvitations() {
    setIsLoading(true);

    const { data: invData } = await supabase
      .from("invitations")
      .select("meeting_id, from_user, at, seen, meetings(name)")
      .eq("to_user", userId)
      .order("at", { ascending: false });

    if (!invData || invData.length === 0) {
      setIsLoading(false);
      return;
    }

    const fromIds = invData.map((i) => i.from_user as string);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", fromIds);

    const profileMap = new Map((profileData ?? []).map((p) => [p.id, p.name]));

    setInvitations(
      invData.map((inv) => {
        const meeting = inv.meetings as unknown as { name: string } | null;
        return {
          meetingId: inv.meeting_id as number,
          meetingName: meeting?.name ?? "알 수 없는 모임",
          fromName: profileMap.get(inv.from_user as string) ?? "알 수 없음",
          at: inv.at as string,
          seen: inv.seen as boolean,
        };
      }),
    );

    setIsLoading(false);
  }

  // 드롭다운을 닫을 때 미확인 초대를 일괄 seen 처리
  async function closeBell() {
    setIsOpen(false);

    const unseenIds = invitations
      .filter((inv) => !inv.seen)
      .map((inv) => inv.meetingId);

    if (unseenIds.length === 0) return;

    // 낙관적 업데이트
    setInvitations((prev) =>
      prev.map((inv) =>
        unseenIds.includes(inv.meetingId) ? { ...inv, seen: true } : inv,
      ),
    );

    await supabase
      .from("invitations")
      .update({ seen: true })
      .in("meeting_id", unseenIds)
      .eq("to_user", userId);
  }

  function handleBellClick() {
    if (isOpen) {
      closeBell();
    } else {
      setIsOpen(true);
    }
  }

  async function handleAccept(meetingId: number) {
    setProcessingId(meetingId);

    const { error } = await supabase
      .from("members")
      .insert({ user_id: userId, meeting_id: meetingId });

    if (!error) {
      await supabase
        .from("invitations")
        .delete()
        .eq("meeting_id", meetingId)
        .eq("to_user", userId);

      setInvitations((prev) => prev.filter((i) => i.meetingId !== meetingId));
    }

    setProcessingId(null);
  }

  async function handleDecline(meetingId: number) {
    setProcessingId(meetingId);

    await supabase
      .from("invitations")
      .delete()
      .eq("meeting_id", meetingId)
      .eq("to_user", userId);

    setInvitations((prev) => prev.filter((i) => i.meetingId !== meetingId));
    setProcessingId(null);
  }

  const unreadCount = invitations.filter((inv) => !inv.seen).length;

  return (
    <div ref={containerRef} className="relative">
      {/* 벨 버튼 */}
      <button
        onClick={handleBellClick}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f0f2f5] transition-colors cursor-pointer"
      >
        {isOpen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 text-[#0d1f2d]"
          >
            <path d="M5.85 3.5a.75.75 0 0 0-1.117-1 9.719 9.719 0 0 0-2.348 4.876.75.75 0 0 0 1.479.248A8.219 8.219 0 0 1 5.85 3.5ZM19.267 2.5a.75.75 0 1 0-1.118 1 8.22 8.22 0 0 1 1.987 4.124.75.75 0 0 0 1.48-.248A9.72 9.72 0 0 0 19.267 2.5Z" />
            <path
              fillRule="evenodd"
              d="M12 2.25A6.75 6.75 0 0 0 5.25 9v.75a8.217 8.217 0 0 1-2.119 5.52.75.75 0 0 0 .298 1.206c1.544.57 3.16.99 4.831 1.243a3.75 3.75 0 1 0 7.48 0 24.583 24.583 0 0 0 4.83-1.244.75.75 0 0 0 .298-1.205 8.217 8.217 0 0 1-2.118-5.52V9A6.75 6.75 0 0 0 12 2.25ZM9.75 18c0-.034 0-.067.002-.1a25.05 25.05 0 0 0 4.496 0l.002.1a2.25 2.25 0 1 1-4.5 0Z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-[#6b7280]"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 flex items-center justify-center bg-[#4ecdc4] text-white text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-[#e9ebee] z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0d1f2d]">
              받은 초대
              {invitations.length > 0 && (
                <span className="ml-1.5 text-xs text-[#9ca3af] font-normal">
                  {invitations.length}개
                </span>
              )}
            </h3>
            <button
              onClick={fetchInvitations}
              className="text-xs text-[#9ca3af] hover:text-[#4ecdc4] transition-colors cursor-pointer"
            >
              새로고침
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-8 text-center text-sm text-[#9ca3af]">
                불러오는 중...
              </div>
            )}

            {!isLoading && invitations.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-2">🔕</p>
                <p className="text-sm text-[#9ca3af]">받은 초대가 없어요</p>
              </div>
            )}

            {!isLoading &&
              invitations.map((inv) => (
                <div
                  key={inv.meetingId}
                  className={`px-4 py-3.5 border-b border-[#f8f9fa] last:border-0 ${
                    !inv.seen ? "bg-[#f0faf9]" : "bg-white"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2.5">
                    {!inv.seen && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#4ecdc4] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0d1f2d] truncate">
                        {inv.meetingName}
                      </p>
                      <p className="text-xs text-[#6b7280] mt-0.5">
                        {inv.fromName}님이 초대했어요 ·{" "}
                        {formatRelativeTime(inv.at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecline(inv.meetingId)}
                      disabled={processingId === inv.meetingId}
                      className="flex-1 py-1.5 rounded-xl border border-[#e5e7eb] text-xs font-semibold text-[#6b7280] hover:bg-[#f8f9fa] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      거절
                    </button>
                    <button
                      onClick={() => handleAccept(inv.meetingId)}
                      disabled={processingId === inv.meetingId}
                      className="flex-1 py-1.5 rounded-xl bg-[#4ecdc4] text-white text-xs font-bold hover:bg-[#3dbdb4] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      수락
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
