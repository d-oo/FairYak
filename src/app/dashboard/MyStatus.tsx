"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "@/app/dashboard/_components/Calendar";
import { type AddressResult } from "@/app/dashboard/_components/AddressSearch";
import AddLocationModal from "@/app/dashboard/_components/AddLocationModal";

type Location = { name: string; address: string };

interface Props {
  userId: string;
  initialLocations: Location[];
  initialFreeDates: string[];
}

// ── 내 현황 탭 ────────────────────────────────────────────────
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

      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-3 gap-5">
        {/* 왼쪽: 위치 */}
        <div className="col-span-1">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#0d1f2d]">내 위치</h2>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs font-semibold text-[#4ecdc4] hover:text-[#3dbdb4] transition-colors cursor-pointer"
              >
                + 추가
              </button>
            </div>

            {locations.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-3xl mb-2">📍</p>
                <p className="text-xs text-[#9ca3af]">저장된 위치가 없어요</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-3 text-xs text-[#4ecdc4] font-semibold hover:underline cursor-pointer"
                >
                  위치 추가하기
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {locations.map((loc) => (
                  <li
                    key={loc.name}
                    className="group flex items-start justify-between px-3 py-2.5 rounded-xl bg-[#f8f9fa] hover:bg-[#f0f2f5] transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-base mt-0.5 shrink-0">📍</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#374151] truncate">
                          {loc.name}
                        </p>
                        <p className="text-xs text-[#9ca3af] truncate mt-0.5">
                          {loc.address}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteLocation(loc.name)}
                      className="text-[#d1d5db] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer text-xs leading-none shrink-0 ml-2 mt-1"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 오른쪽: 달력 */}
        <div className="col-span-2">
          <Calendar markedDates={freeDates} onToggle={toggleDate} />
        </div>
      </div>
    </>
  );
}
