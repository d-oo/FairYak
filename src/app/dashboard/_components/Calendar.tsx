"use client";

import { useState } from "react";

const MONTH_NAMES = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface CalendarProps {
  markedDates: Set<string>;
  onToggle?: (dateStr: string) => Promise<void>;
  markedLabel?: string;
}

export default function Calendar({
  markedDates,
  onToggle,
  markedLabel = "한가",
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loadingDate, setLoadingDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const today = new Date();
  const todayStr = toDateStr(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const isReadOnly = !onToggle;

  async function handleDayClick(ds: string) {
    if (isReadOnly || loadingDate || !onToggle) return;
    setLoadingDate(ds);
    await onToggle(ds);
    setLoadingDate(null);
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e9ebee]">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f0f2f5] text-[#6b7280] hover:text-[#0d1f2d] transition-colors cursor-pointer text-xl leading-none"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="text-base font-bold text-[#0d1f2d]">
            {year}년 {MONTH_NAMES[month]}
          </p>
          {!isReadOnly && (
            <p className="text-xs text-[#9ca3af] mt-0.5">
              한가한 날을 클릭해서 표시해요
            </p>
          )}
        </div>
        <button
          onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#f0f2f5] text-[#6b7280] hover:text-[#0d1f2d] transition-colors cursor-pointer text-xl leading-none"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-bold py-2 ${
              i === 0
                ? "text-red-400"
                : i === 6
                  ? "text-blue-400"
                  : "text-[#9ca3af]"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${year}-${month}-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ds = toDateStr(year, month, day);
          const isMarked = markedDates.has(ds);
          const isToday = ds === todayStr;
          const isLoading = loadingDate === ds;
          const dow = (firstDayOfMonth + i) % 7;
          const isRed = dow === 0;

          const baseClass = `
            relative aspect-square flex flex-col items-center justify-center rounded-xl
            text-sm font-semibold transition-all select-none
            ${isReadOnly ? "cursor-default" : "cursor-pointer"}
            ${
              isMarked
                ? "bg-[#4ecdc4] text-white shadow-sm hover:bg-[#3dbdb4]"
                : isToday
                  ? "ring-2 ring-[#4ecdc4] text-[#0d1f2d] hover:bg-[#f0f2f5]"
                  : !isReadOnly
                    ? "hover:bg-[#f0f2f5]"
                    : ""
            }
            ${!isMarked && isRed ? "text-red-400" : ""}
            ${!isMarked && !isRed && dow === 6 ? "text-blue-400" : ""}
            ${!isMarked && !isRed && dow !== 6 ? "text-[#374151]" : ""}
            ${isLoading ? "opacity-50" : ""}
          `;

          const content = (
            <>
              <span>{day}</span>
              {isMarked && (
                <span className="text-[9px] leading-none mt-0.5 opacity-80 font-normal">
                  {markedLabel}
                </span>
              )}
            </>
          );

          return isReadOnly ? (
            <div key={ds} className={baseClass}>
              {content}
            </div>
          ) : (
            <button
              key={ds}
              onClick={() => handleDayClick(ds)}
              disabled={!!loadingDate}
              className={baseClass}
            >
              {content}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-5 mt-5 pt-4 border-t border-[#f0f0f0]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-[#4ecdc4]" />
          <span className="text-xs text-[#6b7280]">{markedLabel}한 날</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg ring-2 ring-[#4ecdc4]" />
          <span className="text-xs text-[#6b7280]">오늘</span>
        </div>
      </div>
    </div>
  );
}
