export default function MeetingsLoading() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div className="h-4 w-16 bg-[#e9ebee] rounded animate-pulse" />
        <div className="h-8 w-24 bg-[#e9ebee] rounded-xl animate-pulse" />
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e9ebee]">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-[#f8f9fa] rounded-2xl p-5 border border-[#e9ebee] animate-pulse flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#e9ebee]" />
                <div className="w-9 h-6 rounded-full bg-[#e9ebee]" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 bg-[#e9ebee] rounded-lg w-3/4" />
                <div className="h-3 bg-[#e9ebee] rounded-lg w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
