"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import InviteModal from "@/app/dashboard/meetings/_components/InviteModal";
import LocationSelectModal, {
  type StagedLocation,
} from "@/app/dashboard/meetings/_components/LocationSelectModal";
import MeetingMemberList, {
  type MemberItem,
  type PendingInviteItem,
} from "@/app/dashboard/meetings/_components/MeetingMemberList";
import LeaveConfirmModal from "@/app/dashboard/meetings/_components/LeaveConfirmModal";
import MeetingScheduleResult from "@/app/dashboard/meetings/_components/MeetingScheduleResult";
import MeetingLocationResult from "@/app/dashboard/meetings/_components/MeetingLocationResult";
import MeetingLogSection from "@/app/dashboard/meetings/_components/MeetingLogSection";
import SectionHeader from "@/app/_components/SectionHeader";
import BackIcon from "@/app/_components/BackIcon";

interface SavedLocation {
  name: string;
  address: string;
}

interface Props {
  meetingId: number;
  meetingName: string;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  myDepartureAddress: string | null;
  myHasLocation: boolean;
  initialMembers: MemberItem[];
  initialPendingInvites: PendingInviteItem[];
  savedLocations: SavedLocation[];
}

// ── MeetingDetail 메인 ────────────────────────────────────────
export default function MeetingDetailClient({
  meetingId,
  meetingName,
  currentUserId,
  currentUserName,
  currentUserEmail,
  myDepartureAddress: initialMyDepartureAddress,
  myHasLocation: initialMyHasLocation,
  initialMembers,
  initialPendingInvites,
  savedLocations,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberItem[]>(
    [...initialMembers].sort((a) => (a.userId === currentUserId ? -1 : 1)),
  );
  const [pendingInvites, setPendingInvites] = useState<PendingInviteItem[]>(
    initialPendingInvites,
  );
  const [myDepartureAddress, setMyDepartureAddress] = useState(
    initialMyDepartureAddress,
  );
  const [myHasLocation, setMyHasLocation] = useState(initialMyHasLocation);
  const [stagedLocation, setStagedLocation] = useState<StagedLocation | null>(
    null,
  );
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);

  const canUpdate = myHasLocation || stagedLocation !== null;

  useEffect(() => {
    if (scheduleError) {
      const t = setTimeout(() => setScheduleError(false), 3000);
      return () => clearTimeout(t);
    }
  }, [scheduleError]);
  const displayAddress = stagedLocation?.address ?? myDepartureAddress;
  const countLabel = `${members.length}명 참여${
    pendingInvites.length > 0 ? ` · ${pendingInvites.length}명 대기중` : ""
  }`;

  useEffect(() => {
    router.prefetch("/dashboard/meetings");
  }, [router]);

  async function handleUpdate() {
    if (!canUpdate || isUpdating) return;
    setScheduleError(false);
    setIsUpdating(true);

    // 오늘 이후 한가한 날 확인
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data: futureDates } = await supabase
      .from("user_schedules")
      .select("free_date")
      .eq("user_id", currentUserId)
      .gte("free_date", todayStr);

    if (!futureDates || futureDates.length === 0) {
      setScheduleError(true);
      setIsUpdating(false);
      return;
    }

    if (stagedLocation) {
      if (stagedLocation.source === "saved") {
        await supabase.rpc("copy_location_to_member", {
          p_user_id: currentUserId,
          p_meeting_id: meetingId,
          p_location_name: stagedLocation.savedName,
        });
      } else {
        await supabase
          .from("members")
          .update({
            departure_address: stagedLocation.result.address,
            departure_location: `POINT(${stagedLocation.result.lng} ${stagedLocation.result.lat})`,
          })
          .eq("user_id", currentUserId)
          .eq("meeting_id", meetingId);
      }

      setMyDepartureAddress(stagedLocation.address);
      setMyHasLocation(true);
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === currentUserId
            ? {
                ...m,
                hasDeparture: true,
                departureAddress: stagedLocation.address,
              }
            : m,
        ),
      );
      setStagedLocation(null);
    }

    // user_schedules → member_schedules 동기화
    await supabase
      .from("member_schedules")
      .delete()
      .eq("user_id", currentUserId)
      .eq("meeting_id", meetingId);

    const { data: userSchedules } = await supabase
      .from("user_schedules")
      .select("free_date")
      .eq("user_id", currentUserId);

    if (userSchedules && userSchedules.length > 0) {
      await supabase.from("member_schedules").insert(
        userSchedules.map((s) => ({
          user_id: currentUserId,
          meeting_id: meetingId,
          free_date: s.free_date,
        })),
      );
    }

    // 업데이트 로그
    await supabase.from("meeting_logs").insert({
      meeting_id: meetingId,
      user_name: currentUserName,
      type: "updated",
    });

    // 출발지와 오늘 이후 한가한 날이 반영됐으므로 "업데이트 완료"
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === currentUserId ? { ...m, isUpdated: true } : m,
      ),
    );
    setIsUpdating(false);
  }

  async function handleLeave() {
    setIsLeaving(true);

    // members에서 삭제, 마지막 인원이면 모임도 삭제 (RPC 내부에서 처리)
    await supabase.rpc("leave_meeting", { p_meeting_id: meetingId });

    router.push("/dashboard/meetings");
  }

  return (
    <>
      {showInviteModal && (
        <InviteModal
          meetingId={meetingId}
          userId={currentUserId}
          userEmail={currentUserEmail}
          onClose={() => setShowInviteModal(false)}
          onInvited={(targets) =>
            setPendingInvites((prev) => [...prev, ...targets])
          }
        />
      )}

      {showLocationModal && (
        <LocationSelectModal
          savedLocations={savedLocations}
          onSelect={setStagedLocation}
          onClose={() => setShowLocationModal(false)}
        />
      )}

      {showLeaveModal && (
        <LeaveConfirmModal
          meetingName={meetingName}
          isLeaving={isLeaving}
          onConfirm={handleLeave}
          onClose={() => setShowLeaveModal(false)}
        />
      )}

      <div className="mb-4.5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <button
          onClick={() => router.push("/dashboard/meetings")}
          className="flex h-9 flex-none cursor-pointer items-center gap-1.5 border border-ink px-3 font-mono text-[13px] whitespace-nowrap text-ink hover:bg-paper"
        >
          <BackIcon />
          목록
        </button>
        <h1 className="text-[clamp(24px,3vw,30px)] leading-[1.2] font-semibold tracking-[-0.035em]">
          {meetingName}
        </h1>
        <span className="font-mono text-xs text-muted">{countLabel}</span>
        <button
          onClick={() => setShowInviteModal(true)}
          className="ml-auto h-10 cursor-pointer bg-ink px-4.5 text-sm font-semibold text-paper hover:bg-ink-hover"
        >
          + 초대
        </button>
      </div>

      <MeetingLocationResult
        meetingId={meetingId}
        memberCount={members.length}
        currentUserId={currentUserId}
      />

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-5">
        <div className="flex flex-col gap-5">
          <MeetingMemberList
            members={members}
            pendingInvites={pendingInvites}
            currentUserId={currentUserId}
            countLabel={countLabel}
          />

          {/* 내 출발지 */}
          <section className="border border-ink bg-paper">
            <SectionHeader title="내 출발지" />
            {displayAddress ? (
              <div className="flex items-center justify-between gap-3 px-4.5 py-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{displayAddress}</p>
                  {stagedLocation && (
                    <p className="mt-1 text-xs text-accent-text">
                      업데이트 전 미적용 상태예요
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowLocationModal(true)}
                  className="flex-none cursor-pointer text-[13px] text-muted underline underline-offset-3 hover:text-ink"
                >
                  변경
                </button>
              </div>
            ) : (
              <div className="px-4.5 py-5.5 text-center">
                <p className="mb-3.5 text-sm text-muted">
                  출발지를 선택하고 업데이트를 눌러주세요
                </p>
                <button
                  onClick={() => setShowLocationModal(true)}
                  className="h-10 cursor-pointer border border-ink px-4.5 text-sm font-semibold text-ink hover:bg-page"
                >
                  출발지 선택하기
                </button>
              </div>
            )}
            <div className="group relative">
              {canUpdate && !isUpdating && (
                <div className="pointer-events-none absolute right-3 bottom-[calc(100%+8px)] z-6 hidden bg-ink px-2.5 py-1.75 text-xs whitespace-nowrap text-paper group-hover:block">
                  현재 내 일정과 변경된 위치가 반영됩니다.
                </div>
              )}
              <button
                onClick={handleUpdate}
                disabled={!canUpdate || isUpdating}
                className="flex h-12 w-full cursor-pointer items-center justify-center border-t border-ink bg-accent text-[15px] font-semibold text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isUpdating ? "업데이트 중..." : "업데이트"}
              </button>
              {scheduleError && (
                <div className="absolute top-[calc(100%+10px)] right-3 left-3 z-6">
                  <div className="flex items-center gap-2.5 border border-ink bg-bubble-bg px-3.5 py-3 text-[13px]">
                    <span className="size-2 flex-none bg-accent" />
                    <span>일정 관리에서 한가한 날을 먼저 입력해주세요.</span>
                  </div>
                  {/* 말풍선 꼬리 */}
                  <div className="absolute -top-1.25 right-6 size-2.5 rotate-45 border-t border-l border-ink bg-bubble-bg" />
                </div>
              )}
            </div>
          </section>
        </div>

        <MeetingScheduleResult
          meetingId={meetingId}
          memberCount={members.length}
        />

        <div className="flex flex-col gap-3.5">
          <MeetingLogSection meetingId={meetingId} />
          <button
            onClick={() => setShowLeaveModal(true)}
            className="cursor-pointer self-end px-0.5 py-1 text-[13px] text-faint underline underline-offset-3 hover:text-accent-text"
          >
            모임 나가기
          </button>
        </div>
      </div>
    </>
  );
}
