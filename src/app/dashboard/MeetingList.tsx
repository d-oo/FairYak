"use client";

export default function MeetingList() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="bg-white rounded-2xl p-12 shadow-sm border border-[#e9ebee] text-center">
        <p className="text-5xl mb-4">🗓️</p>
        <h3 className="text-lg font-bold text-[#0d1f2d] mb-2">
          아직 모임이 없어요
        </h3>
        <p className="text-sm text-[#9ca3af] mb-6">
          새로운 모임을 만들거나 초대를 기다려봐요.
        </p>
        <button className="px-6 py-3 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer">
          + 모임 만들기
        </button>
      </div>
    </div>
  );
}
