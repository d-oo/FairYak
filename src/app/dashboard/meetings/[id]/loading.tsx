export default function MeetingDetailLoading() {
  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* 헤더 스켈레톤 */}
      <div className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
        <div className="h-6 w-20 bg-[#f0f2f5] rounded-lg animate-pulse" />
        <div className="h-4 w-40 bg-[#f0f2f5] rounded-lg animate-pulse" />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* 서브헤더 스켈레톤 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-16 bg-white rounded-xl border border-[#e9ebee] animate-pulse" />
            <div className="h-6 w-36 bg-[#f0f2f5] rounded-lg animate-pulse" />
          </div>
          <div className="h-8 w-16 bg-[#f0f2f5] rounded-xl animate-pulse" />
        </div>

        {/* 인원 현황 스켈레톤 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <div className="h-4 w-24 bg-[#f0f2f5] rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="px-3 py-3 rounded-xl border border-[#f0f0f0] bg-[#f8f9fa] space-y-2"
              >
                <div className="h-3 w-20 bg-[#e9ebee] rounded animate-pulse" />
                <div className="h-3 w-28 bg-[#e9ebee] rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* 출발지 스켈레톤 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <div className="h-4 w-20 bg-[#f0f2f5] rounded animate-pulse mb-4" />
          <div className="h-14 w-full bg-[#f0f2f5] rounded-xl animate-pulse" />
        </div>

        {/* 업데이트 버튼 스켈레톤 */}
        <div className="h-12 w-full bg-[#f0f2f5] rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
