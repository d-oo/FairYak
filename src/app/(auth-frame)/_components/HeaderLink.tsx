"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BackIcon from "@/app/_components/BackIcon";

// 프레임 헤더 오른쪽 링크. 레이아웃이 화면 간에 유지되므로 경로를 보고 바꾼다.
// 랜딩은 "로그인", 로그인·회원가입·이메일 확인은 "처음으로"
export default function HeaderLink() {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <Link
        href="/auth/login"
        className="text-sm font-medium text-ink hover:text-accent-text"
      >
        로그인
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className="flex items-center gap-1.5 font-mono text-[13px] text-muted hover:text-ink"
    >
      <BackIcon />
      처음으로
    </Link>
  );
}
