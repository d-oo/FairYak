"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import InviteModal from "@/app/dashboard/meetings/_components/InviteModal";
import LocationSelectModal, {
  type StagedLocation,
} from "@/app/dashboard/meetings/_components/LocationSelectModal";
import MeetingMemberList from "@/app/dashboard/meetings/_components/MeetingMemberList";
import LeaveConfirmModal from "@/app/dashboard/meetings/_components/LeaveConfirmModal";
import MeetingScheduleResult from "@/app/dashboard/meetings/_components/MeetingScheduleResult";
import MeetingLocationResult from "@/app/dashboard/meetings/_components/MeetingLocationResult";

interface MemberItem {
  userId: string;
  name: string;
  hasLocation: boolean;
  departureAddress: string | null;
}

interface PendingInviteItem {
  toUserId: string;
  toUserName: string;
}

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

  useEffect(() => {
    router.prefetch("/dashboard/meetings");
  }, []);

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
                hasLocation: true,
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

    setIsUpdating(false);
  }

  async function handleLeave() {
    setIsLeaving(true);

    // members에서 삭제
    await supabase
      .from("members")
      .delete()
      .eq("user_id", currentUserId)
      .eq("meeting_id", meetingId);

    // 남은 인원 확인
    const { count } = await supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("meeting_id", meetingId);

    if (count === 0) {
      // 마지막 인원 → 모임 삭제 (CASCADE로 연관 데이터 정리)
      await supabase.from("meetings").delete().eq("id", meetingId);
    } else {
      // 퇴장 로그
      await supabase.from("meeting_logs").insert({
        meeting_id: meetingId,
        user_name: currentUserName,
        type: "member_left",
      });
    }

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

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* 서브 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard/meetings")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#e5e7eb] bg-white text-sm font-semibold text-[#6b7280] hover:text-[#0d1f2d] hover:border-[#0d1f2d] transition-all cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="7 4 10 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>목록</span>
            </button>
            <h1 className="text-xl font-bold text-[#0d1f2d]">{meetingName}</h1>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 rounded-xl bg-[#0d1f2d] text-white text-xs font-bold hover:bg-[#1a3244] transition-colors cursor-pointer"
          >
            + 초대
          </button>
        </div>
        <MeetingMemberList
          members={members}
          pendingInvites={pendingInvites}
          currentUserId={currentUserId}
        />

        {/* 내 출발지 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[#0d1f2d]">내 출발지</h2>
            <div className="relative group">
              <button
                onClick={handleUpdate}
                disabled={!canUpdate || isUpdating}
                className="px-3 py-1.5 rounded-xl bg-[#4ecdc4] text-white text-xs font-bold hover:bg-[#3dbdb4] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isUpdating ? "업데이트 중..." : "업데이트"}
              </button>
              {scheduleError && (
                <div className="absolute top-full right-0 mt-3 z-10">
                  {/* 말풍선 꼬리 */}
                  <div className="absolute -top-2 right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-[#fcd34d]" />
                  <div className="absolute -top-1.5 right-4.25 w-0 h-0 border-l-[7px] border-r-[7px] border-b-[7px] border-l-transparent border-r-transparent border-b-[#fff8f0]" />
                  <div className="flex items-center gap-2 px-4 py-3 bg-[#fff8f0] border border-[#fcd34d] rounded-xl shadow-sm whitespace-nowrap">
                    <span className="text-base">📅</span>
                    <p className="text-xs text-[#92400e] font-medium">
                      일정 관리에서 한가한 날을 먼저 입력해주세요.
                    </p>
                  </div>
                </div>
              )}
              {canUpdate && !isUpdating && (
                <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-[#0d1f2d] text-white text-xs rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  현재 내 일정과 변경된 위치가 반영됩니다.
                  <div className="absolute top-full right-3 border-4 border-transparent border-t-[#0d1f2d]" />
                </div>
              )}
            </div>
          </div>

          {displayAddress ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#f0faf9] border border-[#4ecdc4]/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">📍</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0d9488] truncate">
                    {displayAddress}
                  </p>
                  {stagedLocation && (
                    <p className="text-xs text-[#f59e0b] mt-0.5">
                      업데이트 전 미적용 상태예요
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowLocationModal(true)}
                className="text-xs text-[#6b7280] hover:text-[#0d1f2d] font-semibold transition-colors cursor-pointer shrink-0 ml-3"
              >
                변경
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">📍</p>
              <p className="text-sm text-[#6b7280] mb-4">
                출발지를 선택하고 업데이트를 눌러주세요
              </p>
              <button
                onClick={() => setShowLocationModal(true)}
                className="px-5 py-2.5 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer"
              >
                출발지 선택하기
              </button>
            </div>
          )}
        </section>

        <MeetingScheduleResult
          meetingId={meetingId}
          memberCount={members.length}
        />

        <MeetingLocationResult />

        {/* 모임 나가기 */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowLeaveModal(true)}
            className="px-4 py-2 rounded-xl border border-[#e5e7eb] text-xs font-semibold text-[#9ca3af] hover:border-red-300 hover:text-red-500 transition-colors cursor-pointer"
          >
            모임 나가기
          </button>
        </div>
      </div>
    </>
  );
}
