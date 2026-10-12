"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import InviteSearchPanel, {
  type InviteTarget,
} from "@/app/dashboard/_components/InviteSearchPanel";
import Modal, { MODAL_ERROR_CLASS } from "@/app/dashboard/_components/Modal";

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
      .rpc("find_profile_by_email", { p_email: email })
      .maybeSingle<InviteTarget>();

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
    <Modal
      title="인원 초대"
      onClose={onClose}
      onSubmit={handleSubmit}
      primaryLabel={
        isSubmitting ? "초대 중..." : `초대 보내기 (${inviteList.length}명)`
      }
      primaryDisabled={inviteList.length === 0 || isSubmitting}
    >
      <div className="flex flex-col gap-2">
        <InviteSearchPanel
          userEmail={userEmail}
          inviteList={inviteList}
          onListChange={setInviteList}
          onSearch={handleSearch}
        />
      </div>

      {submitError && <p className={MODAL_ERROR_CLASS}>{submitError}</p>}
    </Modal>
  );
}
