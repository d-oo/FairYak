"use client";

import { useState } from "react";
import AddressSearch, {
  type AddressResult,
} from "@/app/_components/AddressSearch";
import Modal, {
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
} from "@/app/dashboard/_components/Modal";

interface Props {
  onClose: () => void;
  onAdd: (name: string, result: AddressResult) => Promise<boolean>;
}

// ── 위치 추가 모달 ────────────────────────────────────────────
export default function AddLocationModal({ onClose, onAdd }: Props) {
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
    <Modal
      title="위치 추가"
      onClose={onClose}
      onSubmit={handleSubmit}
      primaryLabel={loading ? "저장 중..." : "저장"}
      primaryDisabled={!name.trim() || !addressResult || loading}
    >
      <label className="flex flex-col gap-1.5">
        <span className={MODAL_LABEL_CLASS}>위치 이름</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          placeholder="예: 집, 회사, 학교"
          autoFocus
          autoComplete="off"
          className={MODAL_INPUT_CLASS}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className={MODAL_LABEL_CLASS}>주소 찾기</span>
        <AddressSearch onSelect={setAddressResult} />
        {addressResult && (
          <p className="bg-accent-soft px-3 py-2 text-xs text-accent-text-deep">
            선택됨: {addressResult.address}
          </p>
        )}
      </div>

      {error && <p className={MODAL_ERROR_CLASS}>{error}</p>}
    </Modal>
  );
}
