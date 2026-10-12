export default function MeetingsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-16 bg-track" />
        <div className="h-9.5 w-28 bg-track" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex min-h-42 flex-col border border-ink bg-paper"
          >
            <div className="flex flex-1 flex-col px-4 pt-4.5 pb-4">
              <div className="h-5 w-3/4 bg-track" />
              <div className="mt-auto flex gap-2">
                <div className="h-3.5 w-6 bg-track" />
                <div className="h-3.5 w-1/2 bg-page" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
