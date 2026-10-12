import Modal from "@/app/dashboard/_components/Modal";

interface Props {
  meetingName: string;
  isLeaving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function LeaveConfirmModal({
  meetingName,
  isLeaving,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      onClose={onClose}
      cancelDisabled={isLeaving}
      primaryLabel={isLeaving ? "나가는 중..." : "나가기"}
      primaryDisabled={isLeaving}
      primaryTone="accent"
      onPrimary={onConfirm}
    >
      <div className="pt-3 pb-1 text-center">
        <h2 className="text-lg font-semibold">모임을 나가시겠어요?</h2>
        <p className="mt-2.5 text-sm leading-[1.6] text-muted">
          <b className="font-semibold text-ink">&apos;{meetingName}&apos;</b>
          에서 나가면
          <br />
          다시 초대를 받아야 참여할 수 있어요.
        </p>
      </div>
    </Modal>
  );
}
