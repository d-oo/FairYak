"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import InviteSearchPanel, {
  type InviteTarget,
} from "@/app/dashboard/_components/InviteSearchPanel";

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
  onClose: () => void;
  onCreated: (meeting: MeetingItem) => void;
}

export default function CreateMeetingModal({
  userId,
  userEmail,
  onClose,
  onCreated,
}: Props) {
  const supabase = createClient();

  const [meetingName, setMeetingName] = useState("");
  const [inviteList, setInviteList] = useState<InviteTarget[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

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
