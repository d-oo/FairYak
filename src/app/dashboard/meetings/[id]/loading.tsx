function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border border-ink bg-paper">
      <div className="border-b border-ink px-4.5 py-3.5">
        <div className="h-4.5 w-24 bg-track" />
      </div>
      <div className="flex flex-col gap-px bg-rule">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-paper px-4.5 py-3">
            <div className="h-4 w-1/2 bg-track" />
            <div className="mt-1.5 h-3 w-3/4 bg-page" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MeetingDetailLoading() {
  return (
    <div className="animate-pulse">
      {/* 상단 행 */}
      <div className="mb-4.5 flex items-center gap-4">
        <div className="h-9 w-18 border border-ink" />
        <div className="h-8 w-48 bg-track" />
        <div className="ml-auto h-10 w-20 bg-track" />
      </div>

      {/* 지도 블록 */}
      <div className="relative h-80 border border-ink bg-map-bg wide:h-135">
        <div className="absolute top-4 left-4 hidden w-85 wide:block">
          <PanelSkeleton rows={3} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-5">
        <PanelSkeleton rows={3} />
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={3} />
      </div>
    </div>
  );
}
