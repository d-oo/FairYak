"use client";

import { useState } from "react";
import AddressSearch, {
  type AddressResult,
} from "@/app/dashboard/_components/AddressSearch";

interface SavedLocation {
  name: string;
  address: string;
}

export type StagedLocation =
  | { source: "saved"; savedName: string; address: string }
  | { source: "search"; result: AddressResult; address: string };

interface Props {
  savedLocations: SavedLocation[];
  onSelect: (staged: StagedLocation) => void;
  onClose: () => void;
}

type LocationTab = "saved" | "search";

export default function LocationSelectModal({
  savedLocations,
  onSelect,
  onClose,
}: Props) {
  const [tab, setTab] = useState<LocationTab>(
    savedLocations.length > 0 ? "saved" : "search",
  );
  const [selectedSavedName, setSelectedSavedName] = useState<string | null>(
    null,
  );
  const [searchResult, setSearchResult] = useState<AddressResult | null>(null);

  const canConfirm = tab === "saved" ? !!selectedSavedName : !!searchResult;

  function handleConfirm() {
    if (tab === "saved" && selectedSavedName) {
      const loc = savedLocations.find((l) => l.name === selectedSavedName);
      onSelect({
        source: "saved",
        savedName: selectedSavedName,
        address: loc?.address ?? selectedSavedName,
      });
    } else if (tab === "search" && searchResult) {
      onSelect({
        source: "search",
        result: searchResult,
        address: searchResult.address,
      });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0] rounded-t-2xl">
          <h2 className="text-base font-bold text-[#0d1f2d]">출발지 선택</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#374151] transition-colors cursor-pointer text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-[#f0f0f0] px-6">
          {(["saved", "search"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === t
                  ? "border-[#4ecdc4] text-[#0d1f2d]"
                  : "border-transparent text-[#9ca3af] hover:text-[#6b7280]"
              }`}
            >
              {t === "saved" ? "저장된 위치" : "직접 검색"}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {tab === "saved" &&
            (savedLocations.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-2">📍</p>
                <p className="text-sm text-[#9ca3af]">저장된 위치가 없어요</p>
                <button
                  onClick={() => setTab("search")}
                  className="mt-2 text-xs text-[#4ecdc4] font-semibold hover:underline cursor-pointer"
                >
                  직접 검색하기
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {savedLocations.map((loc) => (
                  <li key={loc.name}>
                    <button
                      onClick={() => setSelectedSavedName(loc.name)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                        selectedSavedName === loc.name
                          ? "border-[#4ecdc4] bg-[#f0faf9]"
                          : "border-[#e5e7eb] hover:bg-[#f8f9fa]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base shrink-0">📍</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#374151] truncate">
                            {loc.name}
                          </p>
                          <p className="text-xs text-[#9ca3af] truncate mt-0.5">
                            {loc.address}
                          </p>
                        </div>
                        {selectedSavedName === loc.name && (
                          <span className="ml-auto text-[#4ecdc4] shrink-0">
                            ✓
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === "search" && (
            <>
              <AddressSearch onSelect={setSearchResult} />
              {searchResult && (
                <div className="px-4 py-3 rounded-xl bg-[#f0faf9] border border-[#4ecdc4]/30">
                  <p className="text-xs text-[#0d9488] font-semibold">
                    선택된 위치
                  </p>
                  <p className="text-sm text-[#0d1f2d] font-medium mt-0.5">
                    {searchResult.name}
                  </p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {searchResult.address}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-[#f8f9fa] transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-1 py-3 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
