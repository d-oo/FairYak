"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateMeetingModal from "@/app/dashboard/meetings/_components/CreateMeetingModal";

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
  initialMeetings: MeetingItem[];
}

function formatMemberNames(names: string[]): string {
  if (names.length === 0) return "나만 있어요";
  if (names.length <= 3) return names.map((n) => `${n}님`).join(", ");
  return `${names[0]}님, ${names[1]}님 외 ${names.length - 2}명`;
}

export default function MeetingList({
  userId,
  userEmail,
  initialMeetings,
}: Props) {
  const router = useRouter();

  const [meetings, setMeetings] = useState<MeetingItem[]>(initialMeetings);
  const [showModal, setShowModal] = useState(false);

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

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-base font-semibold">내 모임</h2>
          <span className="font-mono text-xs text-faint">{meetings.length}</span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="h-9.5 cursor-pointer bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-hover"
        >
          + 모임 만들기
        </button>
      </div>

      {meetings.length === 0 && (
        <div className="border border-ink bg-paper px-5 py-14 text-center">
          <h3 className="text-base font-semibold">아직 모임이 없어요</h3>
          <p className="mt-2 mb-5 text-sm text-muted">
            새로운 모임을 만들거나 초대를 기다려봐요.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="h-10 cursor-pointer bg-ink px-4.5 text-sm font-semibold text-paper hover:bg-ink-hover"
          >
            + 모임 만들기
          </button>
        </div>
      )}

      {meetings.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
          {meetings.map((meeting) => (
            <button
              key={meeting.meetingId}
              onClick={() =>
                router.push(`/dashboard/meetings/${meeting.meetingId}`)
              }
              className="flex min-h-42 cursor-pointer flex-col border border-ink bg-paper p-0 text-left text-ink hover:bg-input hover:shadow-[inset_0_0_0_1px_var(--ink)]"
            >
              <span className="flex flex-1 flex-col self-stretch px-4 pt-4.5 pb-4">
                <span className="text-xl leading-[1.3] font-semibold tracking-[-0.02em]">
                  {meeting.meetingName}
                </span>
                <span className="mt-auto flex items-baseline gap-2 pt-5 text-[13px] text-muted">
                  <span className="flex-none font-mono text-xs text-ink">
                    {meeting.memberCount}명
                  </span>
                  <span className="min-w-0">
                    {formatMemberNames(meeting.otherMemberNames)}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
