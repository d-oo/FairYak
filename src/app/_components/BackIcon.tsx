// 뒤로가기 꺾쇠. 이전 디자인에서 쓰던 chevron(polyline 15 18 9 12 15 6)을
// 새 시안 톤에 맞춰 선 끝·꺾이는 곳을 각지게 하고 선을 가늘게 다듬었다 (모서리 둥글림 없음).
export default function BackIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="7 4 10 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      className={`h-2.75 w-1.75 flex-none ${className}`}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
