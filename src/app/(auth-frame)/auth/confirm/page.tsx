"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">
        확인 메일을 보냈어요!
      </h1>
      <p className="mt-4 text-[15px] leading-[1.7] text-muted">
        {email && (
          <>
            <b className="font-semibold text-ink">{email}</b>로
            <br />
          </>
        )}
        가입 확인 메일이 발송됐어요.
        <br />
        메일함을 확인하고 링크를 클릭하면 가입이 완료돼요.
      </p>
      <p className="mt-5 border border-rule bg-page px-3 py-2.5 text-[13px]">
        메일이 안 보이면 스팸 메일함도 확인해보세요.
      </p>
      <Link
        href="/auth/login"
        className="mt-6 flex h-12.5 items-center justify-center bg-ink text-[15px] font-semibold text-paper hover:bg-ink-hover"
      >
        로그인하러 가기
      </Link>
      <Link
        href="/"
        className="mt-3.5 text-center text-[13px] text-faint hover:text-muted"
      >
        홈으로 돌아가기
      </Link>
    </>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  );
}
