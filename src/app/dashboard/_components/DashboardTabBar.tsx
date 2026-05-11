"use client";

import { usePathname, useRouter } from "next/navigation";
import NotificationBell from "@/app/dashboard/_components/NotificationBell";

interface Props {
  userId: string;
}

export default function DashboardTabBar({ userId }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isMyStatus = pathname === "/dashboard";
  const isMeetings = pathname.startsWith("/dashboard/meetings");

  return (
    <div className="bg-white border-b border-[#e5e7eb] px-6 flex items-center justify-between">
      <div className="flex gap-1">
        {(
          [
            ["일정 관리", "/dashboard", isMyStatus],
            ["모임 목록", "/dashboard/meetings", isMeetings],
          ] as const
        ).map(([label, href, active]) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`px-5 py-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              active
                ? "border-[#4ecdc4] text-[#0d1f2d]"
                : "border-transparent text-[#9ca3af] hover:text-[#6b7280]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <NotificationBell userId={userId} />
    </div>
  );
}
