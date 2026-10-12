import SectionHeader from "@/app/_components/SectionHeader";

export interface MemberItem {
  userId: string;
  name: string;
  // 출발지가 있고 오늘 이후 한가한 날이 반영된 상태 ("업데이트 완료")
  isUpdated: boolean;
  hasDeparture: boolean;
  departureAddress: string | null;
}

export interface PendingInviteItem {
  toUserId: string;
  toUserName: string;
}

interface Props {
  members: MemberItem[];
  pendingInvites: PendingInviteItem[];
  currentUserId: string;
  countLabel: string;
}

// 다른 멤버의 날짜는 표시하지 않는다
export default function MeetingMemberList({
  members,
  pendingInvites,
  currentUserId,
  countLabel,
}: Props) {
  return (
    <section className="border border-ink bg-paper">
      <SectionHeader
        title="모임 인원"
        right={
          <span className="font-mono text-[11px] text-muted">{countLabel}</span>
        }
      />
      <div className="flex flex-col gap-px bg-rule">
        {members.map((member) => {
          const isMe = member.userId === currentUserId;
          return (
            <div
              key={member.userId}
              className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-x-1.5 bg-paper px-4.5 py-2.75"
            >
              <span
                className={`mt-1.75 size-2 ${
                  !member.hasDeparture
                    ? "shadow-[inset_0_0_0_1px_var(--faint)]"
                    : isMe
                      ? "bg-accent"
                      : "bg-ink"
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {member.name}{" "}
                  {isMe && (
                    <span className="text-xs font-medium text-accent-text">
                      (나)
                    </span>
                  )}
                </p>
                <p
                  className={`mt-px truncate text-[13px] ${
                    member.hasDeparture ? "text-muted" : "text-disabled"
                  }`}
                >
                  {member.hasDeparture
                    ? member.departureAddress
                    : "위치 미입력"}
                </p>
              </div>
              <span
                className={`pt-0.75 font-mono text-[11px] whitespace-nowrap ${
                  member.isUpdated ? "text-muted" : "text-accent-text"
                }`}
              >
                {member.isUpdated ? "업데이트 완료" : "업데이트 전"}
              </span>
            </div>
          );
        })}

        {pendingInvites.map((inv) => (
          <div
            key={inv.toUserId}
            className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-1.5 bg-paper px-4.5 py-2.75"
          >
            <span className="mt-1.75 size-2 shadow-[inset_0_0_0_1px_var(--faint)]" />
            <div>
              <p className="text-sm font-semibold text-faint">
                {inv.toUserName}
              </p>
              <p className="mt-px text-[13px] text-disabled">초대 대기중</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
