"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Calendar from "@/components/Calendar";
import AddressSearch, { type AddressResult } from "@/components/AddressSearch";

type Location = { name: string; address: string };

interface Props {
  userId: string;
  initialLocations: Location[];
  initialFreeDates: string[];
}

// ── 위치 추가 모달 ────────────────────────────────────────────
function AddLocationModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, result: AddressResult) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [addressResult, setAddressResult] = useState<AddressResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !addressResult) return;
    setLoading(true);
    setError("");

    const ok = await onAdd(name.trim(), addressResult);
    if (ok) {
      onClose();
    } else {
      setError("저장에 실패했어요. 같은 이름의 위치가 있는지 확인해주세요.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0] rounded-t-2xl">
          <h2 className="text-base font-bold text-[#0d1f2d]">위치 추가</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#374151] transition-colors cursor-pointer text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[#374151]">
              위치 이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 집, 회사, 학교"
              autoFocus
              autoComplete="off"
              className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent focus:bg-white transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-[#374151]">
              주소 찾기
            </label>
            <AddressSearch
              onSelect={setAddressResult}
              placeholder="장소명 또는 주소를 검색하세요"
            />
            {addressResult && (
              <p className="text-xs text-[#0d9488] bg-[#f0faf9] px-3 py-2 rounded-xl">
                선택됨: {addressResult.address}
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-[#f8f9fa] transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !addressResult || loading}
              className="flex-1 py-3 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
          <Calendar
            markedDates={freeDates}
            onToggle={toggleDate}
            markedLabel="한가"
          />
        </div>
      </div>
    </>
  );
}
