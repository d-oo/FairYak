"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import InviteSearchPanel, {
  type InviteTarget,
} from "@/components/InviteSearchPanel";

interface MeetingMember {
  user_id: string;
  profiles: { name: string } | null;
}

interface MeetingItem {
  meetingId: number;
  meetingName: string;
  joinedAt: string;
  memberCount: number;
  otherMemberNames: string[];
}

interface Props {
  userId: string;
  userEmail: string;
}

function formatMemberNames(names: string[]): string {
  if (names.length === 0) return "나만 있어요";
  if (names.length <= 3) return names.map((n) => `${n}님`).join(", ");
  return `${names[0]}님, ${names[1]}님 외 ${names.length - 2}명`;
}

// ── 모임 만들기 모달 ──────────────────────────────────────────
function CreateMeetingModal({
  userId,
  userEmail,
  onClose,
  onCreated,
}: {
  userId: string;
  userEmail: string;
  onClose: () => void;
  onCreated: (meeting: MeetingItem) => void;
}) {
  const supabase = createClient();

  const [meetingName, setMeetingName] = useState("");
  const [inviteList, setInviteList] = useState<InviteTarget[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // 새 모임 생성 시에는 기존 멤버/초대 체크 불필요 → 프로필 조회만
  async function handleSearch(
    email: string,
  ): Promise<{ data: InviteTarget | null; error: string }> {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("email", email)
      .single();

    if (!profile)
      return {
        data: null,
        error: "해당 이메일로 가입된 사용자를 찾을 수 없어요.",
      };
    return {
      data: { id: profile.id, name: profile.name, email: profile.email },
      error: "",
    };
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!meetingName.trim()) return;
    setIsSubmitting(true);
    setSubmitError("");

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .insert({ name: meetingName.trim() })
      .select("id, name")
      .single();

    if (meetingError || !meeting) {
      setSubmitError("모임 생성에 실패했어요. 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("members")
      .insert({ user_id: userId, meeting_id: meeting.id });

    if (memberError) {
      setSubmitError("모임 참여 처리에 실패했어요. 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (inviteList.length > 0) {
      await supabase.from("invitations").insert(
        inviteList.map((target) => ({
          meeting_id: meeting.id,
          from_user: userId,
          to_user: target.id,
        })),
      );
    }

    onCreated({
      meetingId: meeting.id,
      meetingName: meeting.name,
      joinedAt: new Date().toISOString(),
      memberCount: 1,
      otherMemberNames: [],
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0] sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-bold text-[#0d1f2d]">모임 만들기</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#374151] transition-colors cursor-pointer text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[#374151]">
              모임 이름
            </label>
            <input
              type="text"
              value={meetingName}
              onChange={(e) => setMeetingName(e.target.value)}
              placeholder="예: 대학 동창 모임"
              autoFocus
              autoComplete="off"
              className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent focus:bg-white transition-all text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-[#374151]">
              인원 초대{" "}
              <span className="text-xs text-[#9ca3af] font-normal">(선택)</span>
            </label>
            <InviteSearchPanel
              userEmail={userEmail}
              inviteList={inviteList}
              onListChange={setInviteList}
              onSearch={handleSearch}
            />
          </div>

          {submitError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">
              {submitError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-[#f8f9fa] transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!meetingName.trim() || isSubmitting}
              className="flex-1 py-3 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "만드는 중..." : "모임 만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 모임 목록 ─────────────────────────────────────────────────
export default function MeetingList({ userId, userEmail }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchMeetings();
  }, []);

  async function fetchMeetings() {
    const { data } = await supabase
      .from("members")
      .select(
        `
        joined_at,
        meetings (
          id,
          name,
          members (
            user_id,
            profiles (name)
          )
        )
      `,
      )
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

    if (!data) {
      setIsLoading(false);
      return;
    }

    setMeetings(
      data
        .filter((row) => row.meetings)
        .map((row) => {
          const meeting = row.meetings as unknown as {
            id: number;
            name: string;
            members: MeetingMember[];
          };
          const allMembers = meeting.members ?? [];
          const otherNames = allMembers
            .filter((m) => m.user_id !== userId)
            .map((m) => m.profiles?.name ?? "")
            .filter(Boolean);
          return {
            meetingId: meeting.id,
            meetingName: meeting.name,
            joinedAt: row.joined_at,
            memberCount: allMembers.length,
            otherMemberNames: otherNames,
          };
        }),
    );

    setIsLoading(false);
  }

  return (
    <>
      {showModal && (
        <CreateMeetingModal
          userId={userId}
          userEmail={userEmail}
          onClose={() => setShowModal(false)}
          onCreated={(meeting) => setMeetings((prev) => [meeting, ...prev])}
        />
      )}

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-[#0d1f2d]">내 모임</h2>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-xl bg-[#0d1f2d] text-white text-xs font-bold hover:bg-[#1a3244] transition-colors cursor-pointer"
          >
            + 모임 만들기
          </button>
        </div>

        {isLoading && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e9ebee]">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-[#f8f9fa] rounded-2xl p-5 border border-[#e9ebee] animate-pulse aspect-square"
                />
              ))}
            </div>
          </div>
        )}

        {!isLoading && meetings.length === 0 && (
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-[#e9ebee] text-center">
            <p className="text-5xl mb-4">🗓️</p>
            <h3 className="text-base font-bold text-[#0d1f2d] mb-2">
              아직 모임이 없어요
            </h3>
            <p className="text-sm text-[#9ca3af] mb-5">
              새로운 모임을 만들거나 초대를 기다려봐요.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2.5 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer"
            >
              + 모임 만들기
            </button>
          </div>
        )}

        {!isLoading && meetings.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e9ebee]">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {meetings.map((meeting) => (
                <button
                  key={meeting.meetingId}
                  onClick={() =>
                    router.push(`/dashboard/meetings/${meeting.meetingId}`)
                  }
                  className="group text-left bg-[#f8f9fa] rounded-2xl p-5 border border-[#e9ebee] hover:border-[#4ecdc4]/60 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#0d1f2d] flex items-center justify-center text-lg group-hover:bg-[#4ecdc4] transition-colors">
                      🗓️
                    </div>
                    <span className="text-xs font-semibold text-[#9ca3af] bg-white px-2.5 py-1 rounded-full">
                      {meeting.memberCount}명
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0d1f2d] group-hover:text-[#4ecdc4] transition-colors line-clamp-2 leading-snug">
                      {meeting.meetingName}
                    </h3>
                    <p className="text-xs text-[#9ca3af] mt-1.5 line-clamp-2 leading-relaxed">
                      {formatMemberNames(meeting.otherMemberNames)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
