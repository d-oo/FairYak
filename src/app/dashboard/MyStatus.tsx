"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "@/app/dashboard/_components/Calendar";
import { type AddressResult } from "@/app/_components/AddressSearch";
import AddLocationModal from "@/app/dashboard/_components/AddLocationModal";

type Location = { name: string; address: string };

interface Props {
  userId: string;
  initialLocations: Location[];
  initialFreeDates: string[];
}

// ── 일정 관리 탭 ────────────────────────────────────────────────
export default function MyStatus({
  userId,
  initialLocations,
  initialFreeDates,
}: Props) {
  const supabase = createClient();

  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [freeDates, setFreeDates] = useState<Set<string>>(
    new Set(initialFreeDates),
  );
  const [showModal, setShowModal] = useState(false);

  async function toggleDate(ds: string) {
    const next = new Set(freeDates);
    if (freeDates.has(ds)) {
      next.delete(ds);
      setFreeDates(next);
      await supabase
        .from("user_schedules")
        .delete()
        .eq("user_id", userId)
        .eq("free_date", ds);
    } else {
      next.add(ds);
      setFreeDates(next);
      await supabase
        .from("user_schedules")
        .insert({ user_id: userId, free_date: ds });
    }
  }

  async function handleAddLocation(
    name: string,
    result: AddressResult,
  ): Promise<boolean> {
    const { error } = await supabase.from("user_locations").insert({
      user_id: userId,
      name,
      address: result.address,
      // PostGIS WKT 형식: POINT(경도 위도)
      location: `POINT(${result.lng} ${result.lat})`,
    });
    if (error) return false;
    setLocations((prev) => [{ name, address: result.address }, ...prev]);
    return true;
  }

  async function deleteLocation(name: string) {
    const { error } = await supabase
      .from("user_locations")
      .delete()
      .eq("user_id", userId)
      .eq("name", name);
    if (!error) setLocations((prev) => prev.filter((l) => l.name !== name));
  }

  return (
    <>
      {showModal && (
        <AddLocationModal
          onClose={() => setShowModal(false)}
          onAdd={handleAddLocation}
        />
      )}

      <div className="flex flex-wrap items-start gap-5">
        <Calendar
          markedDates={freeDates}
          onToggle={toggleDate}
          className="min-w-0 flex-[999_1_520px]"
        />

        {/* 내 위치 */}
        <section className="min-w-0 flex-[1_1_340px] border border-ink bg-paper">
          <div className="flex items-center justify-between border-b border-ink px-5 py-4">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-base font-semibold">내 위치</h2>
              <span className="font-mono text-xs text-faint">
                {locations.length}
              </span>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="h-7.5 cursor-pointer border border-ink px-3 text-[13px] font-medium text-ink hover:bg-page"
            >
              + 추가
            </button>
          </div>

          {locations.length === 0 ? (
            <div className="px-5 py-9 text-center">
              <p className="text-[13px] text-faint">저장된 위치가 없어요</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-2.5 cursor-pointer text-[13px] font-semibold text-ink underline underline-offset-3"
              >
                위치 추가하기
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-px bg-rule">
              {locations.map((loc) => (
                <li
                  key={loc.name}
                  className="group flex items-center gap-3.5 bg-paper px-5 py-3.5 hover:bg-row-hover"
                >
                  {/* 지도 썸네일 자리. 좌표를 따로 불러오지 않아 바탕색과 핀만 둔다 */}
                  <div className="relative size-14 flex-none border border-ink bg-map-bg">
                    <span className="absolute top-1/2 left-1/2 -mt-[4.5px] -ml-[4.5px] size-2.25 bg-accent shadow-halo" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{loc.name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {loc.address}
                    </p>
                  </div>
                  {/* 마우스로 쓸 때는 행에 올렸을 때만 보인다. 터치 화면은 hover가 없으므로 항상 보인다 */}
                  <button
                    onClick={() => deleteLocation(loc.name)}
                    aria-label={`${loc.name} 삭제`}
                    className="cursor-pointer p-1.5 text-[13px] text-faint hover:text-accent-text focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
