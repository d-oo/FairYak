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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="text-center space-y-2">
          <p className="text-2xl">🚪</p>
          <h2 className="text-base font-bold text-[#0d1f2d]">
            모임을 나가시겠어요?
          </h2>
          <p className="text-sm text-[#6b7280]">
            <span className="font-semibold text-[#374151]">
              '{meetingName}'
            </span>
            에서 나가면
            <br />
            다시 초대를 받아야 참여할 수 있어요.
          </p>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={isLeaving}
            className="flex-1 py-3 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-[#f8f9fa] transition-colors cursor-pointer disabled:opacity-40"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={isLeaving}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLeaving ? "나가는 중..." : "나가기"}
          </button>
        </div>
      </div>
    </div>
  );
}
