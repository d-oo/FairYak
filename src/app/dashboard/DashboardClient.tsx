"use client";

import { useState } from "react";
import MyStatus from "./MyStatus";
import MeetingList from "./MeetingList";

type Tab = "dashboard" | "meetings";

interface Props {
  userId: string;
  userName: string;
  userEmail: string;
  initialLocations: { name: string; address: string }[];
  initialFreeDates: string[];
}

export default function DashboardClient({
  userId,
  initialLocations,
  initialFreeDates,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div>
      {/* 탭 바 */}
      <div className="bg-white border-b border-[#e5e7eb] px-6">
        <div className="flex gap-1">
          {(
            [
              ["dashboard", "내 현황"],
              ["meetings", "모임 목록"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === key
                  ? "border-[#4ecdc4] text-[#0d1f2d]"
                  : "border-transparent text-[#9ca3af] hover:text-[#6b7280]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "dashboard" && (
        <MyStatus
          userId={userId}
          initialLocations={initialLocations}
          initialFreeDates={initialFreeDates}
        />
      )}
      {activeTab === "meetings" && <MeetingList />}
    </div>
  );
}
