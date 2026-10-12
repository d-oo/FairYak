// 추천 일정·추천 장소의 대기 상태: 전원이 업데이트할 때까지 진행 바를 보여준다
export default function UpdateProgress({
  total,
  updated,
}: {
  total: number;
  updated: number;
}) {
  return (
    <div className="p-4.5">
      <p className="text-sm font-medium">아직 모든 인원이 업데이트하지 않았어요</p>
      <p className="mt-1.5 font-mono text-xs text-muted">
        {total}명 중 {updated}명 완료
      </p>
      <div className="relative mt-3 h-1.5 bg-track">
        <div
          className="absolute inset-y-0 left-0 bg-ink"
          style={{ width: `${total ? (updated / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
