"use client";

// 공통 모달 틀: 헤더(제목 + ✕) → 본문 → [취소 | 주 버튼].
// onSubmit을 주면 본문과 버튼을 form으로 감싸고 주 버튼이 submit이 된다.
interface Props {
  // 없으면 헤더 없이 본문만 (모임 나가기 확인)
  title?: string;
  onClose: () => void;
  // 헤더 아래 탭 등 본문 위에 붙는 영역
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  primaryLabel: string;
  primaryDisabled?: boolean;
  // 주 버튼 색. 모임 나가기만 주홍
  primaryTone?: "ink" | "accent";
  onPrimary?: () => void;
  onSubmit?: (e: React.SubmitEvent<HTMLFormElement>) => void;
  cancelDisabled?: boolean;
}

export default function Modal({
  title,
  onClose,
  headerExtra,
  children,
  primaryLabel,
  primaryDisabled = false,
  primaryTone = "ink",
  onPrimary,
  onSubmit,
  cancelDisabled = false,
}: Props) {
  const content = (
    <>
      <div className="flex flex-col gap-4 p-5">{children}</div>
      <div className="flex gap-2 px-5 pb-5">
        <button
          type="button"
          onClick={onClose}
          disabled={cancelDisabled}
          className="h-11.5 flex-1 cursor-pointer border border-ink text-sm font-semibold text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
        >
          취소
        </button>
        <button
          type={onSubmit ? "submit" : "button"}
          onClick={onSubmit ? undefined : onPrimary}
          disabled={primaryDisabled}
          className={`h-11.5 flex-1 cursor-pointer text-sm font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-40 ${
            primaryTone === "accent"
              ? "bg-accent enabled:hover:bg-accent-hover"
              : "bg-ink enabled:hover:bg-ink-hover"
          }`}
        >
          {primaryLabel}
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-overlay p-4">
      <div className="max-h-[calc(100vh-32px)] w-[min(460px,100%)] overflow-y-auto border border-ink bg-paper">
        {title && (
          <div className="sticky top-0 z-1 flex items-center justify-between border-b border-ink bg-paper px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer p-1 text-base text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}
        {headerExtra}
        {onSubmit ? <form onSubmit={onSubmit}>{content}</form> : content}
      </div>
    </div>
  );
}

// 모달 안 입력창·라벨·오류 박스 공통 클래스
export const MODAL_INPUT_CLASS =
  "h-11.5 w-full border border-ink bg-input px-3.5 text-sm text-ink outline-none focus:shadow-focus";

export const MODAL_LABEL_CLASS = "text-[13px] font-semibold";

export const MODAL_ERROR_CLASS =
  "border border-accent bg-error-bg px-3 py-2 text-xs text-accent-text-strong";
