"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
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

  // 최신 state로 fetchInvitations를 부르되, 매 렌더 새로 만들어지는 함수 때문에 구독을 다시 하지 않도록 Effect Event로 감싼다
  const loadInvitations = useEffectEvent(() => fetchInvitations());

  useEffect(() => {
    let isCancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      await loadInvitations();
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
            loadInvitations();
          },
        )
        .subscribe();
    }

    setup();

    return () => {
      isCancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  // 외부 클릭 시 닫기. 열림 여부·초대 목록은 Effect Event가 최신 값을 읽으므로 리스너는 한 번만 단다
  const onMouseDownOutside = useEffectEvent((e: MouseEvent) => {
    if (
      isOpen &&
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      closeBell();
    }
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      onMouseDownOutside(e);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = invitations.filter((inv) => !inv.seen).length;

  return (
    // relative를 두지 않아 패널이 헤더 영역(layout.tsx) 기준으로 배치된다
    <div ref={containerRef} className="flex">
      <button
        onClick={handleBellClick}
        className={`flex h-8.5 cursor-pointer items-center gap-2 px-2.5 text-[13px] font-medium text-ink hover:bg-page ${
          isOpen ? "bg-page" : ""
        }`}
      >
        알림
        {unreadCount > 0 && (
          <span className="flex h-4.5 min-w-4.5 items-center justify-center bg-accent px-1 font-mono text-[11px] text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        // top: 패널 윗 테두리가 헤더 구분선(1px)과 같은 줄에 겹치도록 헤더 내용 영역 바로 아래
        // right: 헤더 좌우 여백만큼 들여 콘텐츠 오른쪽 끝에 맞춤
        <div className="absolute top-full right-[clamp(16px,4vw,40px)] z-31 w-[min(340px,calc(100vw-32px))] border border-ink bg-paper">
          <div className="flex items-center justify-between border-b border-ink px-4 py-3">
            <h3 className="text-sm font-semibold">
              받은 초대{" "}
              <span className="font-mono text-xs font-normal text-faint">
                {invitations.length > 0 && `${invitations.length}개`}
              </span>
            </h3>
            <button
              onClick={fetchInvitations}
              className="cursor-pointer text-xs text-faint hover:text-ink"
            >
              새로고침
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <p className="px-4 py-8 text-center text-[13px] text-faint">
                불러오는 중...
              </p>
            )}

            {!isLoading && invitations.length === 0 && (
              <p className="px-4 py-8 text-center text-[13px] text-faint">
                받은 초대가 없어요
              </p>
            )}

            {!isLoading && invitations.length > 0 && (
              <div className="flex flex-col gap-px bg-rule">
                {invitations.map((inv) => (
                  <div
                    key={inv.meetingId}
                    className={`px-4 py-3.5 ${inv.seen ? "bg-paper" : "bg-accent-soft"}`}
                  >
                    {/* 안 읽은 표시는 왼쪽 여백에 두어, 읽음 여부와 상관없이 글자·버튼이
                        헤더("받은 초대")와 같은 왼쪽 끝에 맞춰지게 한다 */}
                    <p className="relative truncate text-sm font-semibold">
                      {!inv.seen && (
                        <span className="absolute top-1/2 -left-2.75 size-1.75 -translate-y-1/2 bg-accent" />
                      )}
                      {inv.meetingName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {inv.fromName}님이 초대했어요 ·{" "}
                      {formatRelativeTime(inv.at)}
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        onClick={() => handleDecline(inv.meetingId)}
                        disabled={processingId === inv.meetingId}
                        className="h-8 flex-1 cursor-pointer border border-ink text-xs font-semibold text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        거절
                      </button>
                      <button
                        onClick={() => handleAccept(inv.meetingId)}
                        disabled={processingId === inv.meetingId}
                        className="h-8 flex-1 cursor-pointer bg-accent text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        수락
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
