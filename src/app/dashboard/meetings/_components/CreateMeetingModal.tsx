"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import InviteSearchPanel, {
  type InviteTarget,
} from "@/app/dashboard/_components/InviteSearchPanel";
import Modal, {
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
} from "@/app/dashboard/_components/Modal";

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
      .rpc("find_profile_by_email", { p_email: email })
      .maybeSingle<InviteTarget>();

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

    // 모임 생성 + 본인 멤버 등록을 RPC 한 번으로 처리 (RLS상 생성 직후엔 멤버가 아니라 조회 불가)
    const { data: meeting, error: meetingError } = await supabase
      .rpc("create_meeting", { p_name: meetingName.trim() })
      .single<{ id: number; name: string }>();

    if (meetingError || !meeting) {
      setSubmitError("모임 생성에 실패했어요. 다시 시도해주세요.");
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
    <Modal
      title="모임 만들기"
      onClose={onClose}
      onSubmit={handleSubmit}
      primaryLabel={isSubmitting ? "만드는 중..." : "모임 만들기"}
      primaryDisabled={!meetingName.trim() || isSubmitting}
    >
      <label className="flex flex-col gap-1.5">
        <span className={MODAL_LABEL_CLASS}>모임 이름</span>
        <input
          type="text"
          value={meetingName}
          onChange={(e) => setMeetingName(e.target.value)}
          placeholder="예: 대학 동창 모임"
          autoFocus
          autoComplete="off"
          className={MODAL_INPUT_CLASS}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={MODAL_LABEL_CLASS}>
          인원 초대{" "}
          <span className="text-xs font-normal text-faint">(선택)</span>
        </span>
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
