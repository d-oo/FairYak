"use client";

import { usePathname, useRouter } from "next/navigation";

// 헤더의 탭 전환 버튼. 좁은 화면에서는 헤더 둘째 줄 전체 폭으로 내려간다.
export default function DashboardTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  const isMyStatus = pathname === "/dashboard";
  const isMeetings = pathname.startsWith("/dashboard/meetings");

  return (
    <div className="order-3 mb-3 flex basis-full border border-ink wide:order-0 wide:mb-0 wide:basis-auto">
      {(
        [
          ["일정 관리", "/dashboard", isMyStatus],
          ["모임 목록", "/dashboard/meetings", isMeetings],
        ] as const
      ).map(([label, href, active]) => (
        <button
          key={href}
          onClick={() => router.push(href)}
          className={`h-8.5 flex-1 cursor-pointer px-4 text-sm font-semibold whitespace-nowrap wide:flex-none ${
            active ? "bg-ink text-paper" : "text-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
