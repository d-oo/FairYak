import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

export default async function LandingPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[#0d1f2d] flex flex-col relative overflow-hidden">
      {/* 배경 장식 원 - 굵기 증가 */}
      <div className="absolute inset-0 pointer-events-none opacity-15">
        <div className="absolute top-16 left-16 w-72 h-72 rounded-full border-4 border-[#4ecdc4]" />
        <div className="absolute top-28 left-28 w-48 h-48 rounded-full border-4 border-[#4ecdc4]" />
        <div className="absolute bottom-32 right-8 w-96 h-96 rounded-full border-4 border-[#4ecdc4]" />
        <div className="absolute bottom-16 right-20 w-56 h-56 rounded-full border-4 border-[#4ecdc4]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 rounded-full border-4 border-[#4ecdc4]" />
      </div>
      <div className="absolute top-0 right-0 w-1/3 h-full bg-linear-to-l from-[#4ecdc4]/5 to-transparent pointer-events-none" />

      {/* 헤더 */}
      <header className="relative z-10 px-10 py-8">
        <span className="text-2xl font-bold text-[#4ecdc4] tracking-tight">
          페어약
        </span>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-xl w-full space-y-8 text-center">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white leading-tight">
              모임 일정 및 장소 추천
            </h1>
            <p className="text-[#8faabb] text-xl leading-relaxed">
              가입하고 친구들을 초대해보세요.
              <br />
              모두가 만족하는 모임 날짜와 장소를
              <br />
              찾아드릴게요.
            </p>
          </div>

          <div className="space-y-3 inline-flex flex-col items-start">
            {[
              { emoji: "📅", text: "바쁜 날 / 한가한 날 등록" },
              { emoji: "📍", text: "자주 가는 장소 저장" },
              { emoji: "📅", text: "모두가 한가한 날 찾기" },
              { emoji: "🎯", text: "모두의 중간 지점 추천" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-xl">{item.emoji}</span>
                <span className="text-[#8faabb]">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-4 justify-center pt-2">
            <Link
              href="/auth/signup"
              className="px-8 py-3.5 rounded-xl bg-[#4ecdc4] text-[#0d1f2d] font-bold text-sm hover:bg-[#3dbdb4] active:scale-[0.99] transition-all cursor-pointer"
            >
              시작하기
            </Link>
            <Link
              href="/auth/login"
              className="px-8 py-3.5 rounded-xl border border-[#4ecdc4]/50 text-[#4ecdc4] font-semibold text-sm hover:bg-[#4ecdc4]/10 active:scale-[0.99] transition-all cursor-pointer"
            >
              로그인
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
