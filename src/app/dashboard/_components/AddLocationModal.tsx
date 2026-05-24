"use client";

import { useState } from "react";
import AddressSearch, {
  type AddressResult,
} from "@/app/dashboard/_components/AddressSearch";

interface Props {
  onClose: () => void;
  onAdd: (name: string, result: AddressResult) => Promise<boolean>;
}

// ── 위치 추가 모달 ────────────────────────────────────────────
export default function AddLocationModal({
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
            <AddressSearch onSelect={setAddressResult} />
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
