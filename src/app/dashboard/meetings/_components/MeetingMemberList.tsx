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

interface Props {
  members: MemberItem[];
  pendingInvites: PendingInviteItem[];
  currentUserId: string;
}

export default function MeetingMemberList({
  members,
  pendingInvites,
  currentUserId,
}: Props) {
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
      <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">
        모임 인원
        <span className="ml-2 text-xs font-normal text-[#9ca3af]">
          {members.length}명 참여
          {pendingInvites.length > 0 && ` · ${pendingInvites.length}명 대기중`}
        </span>
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className={`px-3 py-3 rounded-xl border ${
              member.userId === currentUserId
                ? "border-[#4ecdc4]/50 bg-[#f0faf9]"
                : "border-[#f0f0f0] bg-[#f8f9fa]"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${member.hasLocation ? "bg-[#4ecdc4]" : "bg-[#e5e7eb]"}`}
              />
              <p className="text-sm font-semibold text-[#374151] truncate">
                {member.name}
                {member.userId === currentUserId && (
                  <span className="ml-1 text-[10px] text-[#4ecdc4] font-normal">
                    (나)
                  </span>
                )}
              </p>
            </div>
            {member.hasLocation ? (
              <p className="text-xs text-[#9ca3af] truncate pl-4">
                {member.departureAddress}
              </p>
            ) : (
              <p className="text-xs text-[#d1d5db] pl-4">위치 미입력</p>
            )}
          </div>
        ))}

        {pendingInvites.map((inv) => (
          <div
            key={inv.toUserId}
            className="px-3 py-3 rounded-xl border border-dashed border-[#e5e7eb] bg-white"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-[#e5e7eb] shrink-0" />
              <p className="text-sm font-semibold text-[#9ca3af] truncate">
                {inv.toUserName}
              </p>
            </div>
            <p className="text-xs text-[#c4c9d0] pl-4">초대 대기중</p>
          </div>
        ))}
      </div>
    </section>
  );
}
