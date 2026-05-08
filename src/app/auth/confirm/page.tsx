"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  return (
    <div className="w-full max-w-md text-center space-y-6">
      <div className="text-6xl">📬</div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-[#0d1f2d]">
          확인 메일을 보냈어요!
        </h2>
        <p className="text-[#6b7280] leading-relaxed">
          {email && (
            <>
              <span className="font-semibold text-[#0d1f2d]">{email}</span>로
              <br />
            </>
          )}
          가입 확인 메일이 발송됐어요.
          <br />
          메일함을 확인하고 링크를 클릭하면 가입이 완료돼요.
        </p>
      </div>
      <div className="px-4 py-3 rounded-xl bg-[#4ecdc4]/10 border border-[#4ecdc4]/20 text-[#0d9488] text-sm">
        메일이 안 보이면 스팸 메일함도 확인해보세요.
      </div>
      <Link
        href="/auth/login"
        className="inline-block w-full py-3.5 rounded-xl bg-[#0d1f2d] text-white font-semibold text-sm hover:bg-[#1a3244] active:scale-[0.99] transition-all cursor-pointer"
      >
        로그인하러 가기
      </Link>
      <Link
        href="/"
        className="block text-sm text-[#9ca3af] hover:text-[#6b7280] transition-colors cursor-pointer"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] px-6">
      <Suspense>
        <ConfirmContent />
      </Suspense>
    </div>
  );
}
