export default function MeetingDetailLoading() {
  return (
    <div>
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* 서브헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-16 bg-white rounded-xl border border-[#e9ebee] animate-pulse" />
            <div className="h-6 w-36 bg-[#e9ebee] rounded-lg animate-pulse" />
          </div>
          <div className="h-8 w-14 bg-[#e9ebee] rounded-xl animate-pulse" />
        </div>

        {/* 모임 인원 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <div className="h-4 w-24 bg-[#e9ebee] rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="px-3 py-3 rounded-xl border border-[#f0f0f0] bg-[#f8f9fa] space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#e9ebee] shrink-0" />
                  <div className="h-3 bg-[#e9ebee] rounded w-16" />
                </div>
                <div className="h-3 bg-[#e9ebee] rounded w-24 ml-4" />
              </div>
            ))}
          </div>
        </div>

        {/* 내 출발지 (업데이트 버튼 헤더 우측) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 w-20 bg-[#e9ebee] rounded animate-pulse" />
            <div className="h-7 w-20 bg-[#e9ebee] rounded-xl animate-pulse" />
          </div>
          <div className="h-14 w-full bg-[#f0f2f5] rounded-xl animate-pulse" />
        </div>

        {/* 추천 일정 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <div className="h-4 w-20 bg-[#e9ebee] rounded animate-pulse mb-4" />
          <div className="space-y-3 animate-pulse">
            <div className="h-7 w-48 bg-[#f0f2f5] rounded-full" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-[#f0f2f5] rounded-xl" />
            ))}
          </div>
        </div>

        {/* 모임 나가기 */}
        <div className="flex justify-end">
          <div className="h-8 w-24 bg-white rounded-xl border border-[#e9ebee] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
