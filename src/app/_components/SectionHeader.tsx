// 패널 헤더 (모임 상세·체험 화면): 제목 (+ 오른쪽 끝 보조 표시)
export default function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-ink px-4.5 py-3.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}
