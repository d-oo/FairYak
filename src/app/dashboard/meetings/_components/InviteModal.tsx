"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import InviteSearchPanel, {
  type InviteTarget,
} from "@/app/dashboard/_components/InviteSearchPanel";

interface Props {
  meetingId: number;
  userId: string;
  userEmail: string;
  onClose: () => void;
  onInvited: (targets: { toUserId: string; toUserName: string }[]) => void;
}

export default function InviteModal({
  meetingId,
  userId,
  userEmail,
  onClose,
  onInvited,
}: Props) {
  const supabase = createClient();

  const [inviteList, setInviteList] = useState<InviteTarget[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // 검색 + 모임 내 중복 체크
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

    const { data: existingMember } = await supabase
      .from("members")
      .select("user_id")
      .eq("meeting_id", meetingId)
      .eq("user_id", profile.id)
      .single();

    if (existingMember)
      return { data: null, error: "이미 모임에 참여중인 인원이에요." };

    const { data: existingInvite } = await supabase
      .from("invitations")
      .select("to_user")
      .eq("meeting_id", meetingId)
      .eq("to_user", profile.id)
      .single();

    if (existingInvite)
      return { data: null, error: "이미 초대 대기중인 인원이에요." };

    return {
      data: { id: profile.id, name: profile.name, email: profile.email },
      error: "",
    };
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inviteList.length === 0) return;
    setIsSubmitting(true);
    setSubmitError("");

    const { error } = await supabase.from("invitations").insert(
      inviteList.map((target) => ({
        meeting_id: meetingId,
        from_user: userId,
        to_user: target.id,
      })),
    );

    if (error) {
      setSubmitError("초대 전송에 실패했어요. 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    onInvited(inviteList.map((t) => ({ toUserId: t.id, toUserName: t.name })));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0] sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-bold text-[#0d1f2d]">인원 초대</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#374151] transition-colors cursor-pointer text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <InviteSearchPanel
            userEmail={userEmail}
            inviteList={inviteList}
            onListChange={setInviteList}
            onSearch={handleSearch}
          />

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
              disabled={inviteList.length === 0 || isSubmitting}
              className="flex-1 py-3 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? "초대 중..."
                : `초대 보내기 (${inviteList.length}명)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
