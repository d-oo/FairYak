"use client";

import { useState } from "react";
import AddressSearch, {
  type AddressResult,
} from "@/app/_components/AddressSearch";
import Modal from "@/app/dashboard/_components/Modal";

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
    <Modal
      title="출발지 선택"
      onClose={onClose}
      headerExtra={
        <div className="flex gap-5 border-b border-ink px-5">
          {(["saved", "search"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`cursor-pointer border-b-3 pt-3 pb-2.25 text-sm font-semibold ${
                tab === t
                  ? "border-accent text-ink"
                  : "border-transparent text-faint"
              }`}
            >
              {t === "saved" ? "저장된 위치" : "직접 검색"}
            </button>
          ))}
        </div>
      }
      primaryLabel="선택"
      primaryDisabled={!canConfirm}
      onPrimary={handleConfirm}
    >
      {tab === "saved" &&
        (savedLocations.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-faint">저장된 위치가 없어요</p>
            <button
              type="button"
              onClick={() => setTab("search")}
              className="mt-2 cursor-pointer text-[13px] font-semibold text-ink underline underline-offset-3"
            >
              직접 검색하기
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {savedLocations.map((loc) => {
              const isSelected = selectedSavedName === loc.name;
              return (
                <li key={loc.name}>
                  <button
                    type="button"
                    onClick={() => setSelectedSavedName(loc.name)}
                    className={`flex w-full cursor-pointer items-center gap-3 border px-3.5 py-3 text-left text-ink ${
                      isSelected
                        ? "border-accent bg-accent-soft"
                        : "border-rule bg-input"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {loc.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {loc.address}
                      </span>
                    </span>
                    <span className="text-sm text-accent-text">
                      {isSelected ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "search" && (
        <div className="flex flex-col gap-2">
          <AddressSearch onSelect={setSearchResult} />
          {searchResult && (
            <div className="border border-accent bg-accent-soft px-3.5 py-2.5">
              <p className="text-xs font-semibold text-accent-text-strong">
                선택된 위치
              </p>
              <p className="mt-0.5 text-sm font-medium">{searchResult.name}</p>
              <p className="mt-0.5 text-xs text-muted">{searchResult.address}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
