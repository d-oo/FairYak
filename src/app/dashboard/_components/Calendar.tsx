"use client";

import { useState } from "react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface DayCell {
  day: number;
  ds: string;
  dow: number;
  isPast: boolean;
  isToday: boolean;
}

// 달 이동 상태와 칸 목록. 앞뒤 빈칸(null)을 넣어 7의 배수로 맞춘다.
function useMonthCells() {
  const [currentDate, setCurrentDate] = useState(new Date());
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

  const cells: (DayCell | null)[] = Array(firstDayOfMonth).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = toDateStr(year, month, day);
    cells.push({
      day,
      ds,
      dow: (firstDayOfMonth + day - 1) % 7,
      isPast: ds < todayStr,
      isToday: ds === todayStr,
    });
  }
  while (cells.length % 7) cells.push(null);

  return {
    title: `${year}년 ${month + 1}월`,
    cells,
    prev: () => setCurrentDate(new Date(year, month - 1, 1)),
    next: () => setCurrentDate(new Date(year, month + 1, 1)),
  };
}

// 요일 색 (일 = 주홍, 토 = 파랑)
function dowTextClass(dow: number) {
  return dow === 0 ? "text-accent-text" : dow === 6 ? "text-saturday" : "text-ink";
}

// ── 일정 관리 탭의 달력: 한가한 날을 클릭해서 토글 ──────────────
interface CalendarProps {
  markedDates: Set<string>;
  onToggle: (dateStr: string) => Promise<void>;
  className?: string;
}

export default function Calendar({
  markedDates,
  onToggle,
  className = "",
}: CalendarProps) {
  const { title, cells, prev, next } = useMonthCells();
  const [loadingDate, setLoadingDate] = useState<string | null>(null);

  async function handleDayClick(ds: string) {
    if (loadingDate) return;
    setLoadingDate(ds);
    await onToggle(ds);
    setLoadingDate(null);
  }

  return (
    <section
      className={`border border-ink bg-paper p-[clamp(16px,2.4vw,28px)] ${className}`}
    >
      <div className="mb-4.5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[28px] leading-none font-semibold tracking-[-0.03em]">
            {title}
          </h2>
          <p className="mt-2.5 text-[13px] text-muted">
            한가한 날을 클릭해서 표시해요
          </p>
        </div>
        <div className="flex">
          <button
            onClick={prev}
            className="size-9 cursor-pointer border border-ink font-mono text-[15px] text-ink hover:bg-page"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="size-9 cursor-pointer border border-l-0 border-ink font-mono text-[15px] text-ink hover:bg-page"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-ink font-mono text-xs text-muted">
        {DAY_NAMES.map((d, i) => (
          <span
            key={d}
            className={`px-2.5 py-2 ${i === 0 ? "text-accent-text" : i === 6 ? "text-saturday" : ""}`}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-rule">
        {cells.map((cell, i) => {
          const base =
            "flex h-12.5 flex-col justify-between border-r border-b border-rule px-2.5 py-2 text-left select-none wide:h-19";
          if (!cell) return <div key={`blank-${i}`} className={base} />;

          const isMarked = !cell.isPast && markedDates.has(cell.ds);
          const color = cell.isPast
            ? "text-disabled"
            : isMarked
              ? "bg-accent text-white"
              : dowTextClass(cell.dow);

          return (
            <button
              key={cell.ds}
              onClick={() => handleDayClick(cell.ds)}
              disabled={!!loadingDate || cell.isPast}
              className={`${base} ${color} ${cell.isToday ? "shadow-today" : ""} ${
                cell.isPast ? "cursor-default" : "cursor-pointer"
              } ${loadingDate === cell.ds ? "opacity-50" : ""}`}
            >
              <span className="font-mono text-sm font-medium">{cell.day}</span>
              <span className="text-xs font-medium">{isMarked ? "한가" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        {markedDates.size > 0 && (
          <span className="flex items-center gap-2">
            <span className="size-3.5 bg-accent" />
            한가한 날
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="size-3.5 shadow-today" />
          오늘
        </span>
      </div>
    </section>
  );
}

// ── 추천 일정의 작은 달력 (읽기 전용) ─────────────────────────
interface MiniCalendarProps {
  // 모두가 한가한 추천 날짜
  markedDates: Set<string>;
  // 전원 일치 날짜가 없을 때 가장 많은 인원이 한가한 날짜(폴백)
  secondaryDates: Set<string>;
}

export function MiniCalendar({ markedDates, secondaryDates }: MiniCalendarProps) {
  const { title, cells, prev, next } = useMonthCells();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <div className="flex">
          <button
            onClick={prev}
            className="size-7.5 cursor-pointer border border-ink font-mono text-[13px] text-ink hover:bg-page"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="size-7.5 cursor-pointer border border-l-0 border-ink font-mono text-[13px] text-ink hover:bg-page"
          >
            ›
          </button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center font-mono text-[11px] text-faint">
        {DAY_NAMES.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} className="h-9" />;
          const isMarked = !cell.isPast && markedDates.has(cell.ds);
          const isSecondary =
            !cell.isPast && !isMarked && secondaryDates.has(cell.ds);
          const color = cell.isPast
            ? "text-disabled"
            : isMarked
              ? "bg-accent text-white"
              : `${isSecondary ? "bg-accent-tint" : ""} ${dowTextClass(cell.dow)}`;
          return (
            <div
              key={cell.ds}
              className={`flex h-9 items-center justify-center font-mono text-[13px] ${color} ${
                cell.isToday ? "shadow-today" : ""
              }`}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span
            className={`size-3.5 ${secondaryDates.size > 0 ? "bg-accent-tint" : "bg-accent"}`}
          />
          추천 날짜
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3.5 shadow-today" />
          오늘
        </span>
      </div>
    </div>
  );
}
