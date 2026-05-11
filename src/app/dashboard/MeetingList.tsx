"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import CreateMeetingModal from "@/app/dashboard/meetings/_components/CreateMeetingModal";

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
                  className="bg-[#f8f9fa] rounded-2xl p-5 border border-[#e9ebee] animate-pulse flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#e9ebee]" />
                    <div className="w-9 h-6 rounded-full bg-[#e9ebee]" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3.5 bg-[#e9ebee] rounded-lg w-3/4" />
                    <div className="h-3 bg-[#e9ebee] rounded-lg w-1/2" />
                  </div>
                </div>
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
