"use client";

import { useState } from "react";

export interface InviteTarget {
  id: string;
  name: string;
  email: string;
}

interface Props {
  userEmail: string;
  inviteList: InviteTarget[];
  onListChange: (list: InviteTarget[]) => void;
  onSearch: (
    email: string,
  ) => Promise<{ data: InviteTarget | null; error: string }>;
}

export default function InviteSearchPanel({
  userEmail,
  inviteList,
  onListChange,
  onSearch,
}: Props) {
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState<InviteTarget | null>(null);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch() {
    const email = searchEmail.trim();
    if (!email) return;
    if (email === userEmail) {
      setSearchError("본인은 초대할 수 없어요.");
      return;
    }
    if (inviteList.some((t) => t.email === email)) {
      setSearchError("이미 추가된 인원이에요.");
      return;
    }

    setIsSearching(true);
    setSearchResult(null);
    setSearchError("");

    const { data, error } = await onSearch(email);
    setSearchResult(data);
    setSearchError(error);
    setIsSearching(false);
  }

  function addToList() {
    if (!searchResult) return;
    onListChange([...inviteList, searchResult]);
    setSearchResult(null);
    setSearchEmail("");
    setSearchError("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={searchEmail}
          onChange={(e) => {
            setSearchEmail(e.target.value);
            setSearchError("");
            setSearchResult(null);
          }}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.preventDefault(), handleSearch())
          }
          placeholder="이메일로 검색"
          autoComplete="off"
          className="flex-1 px-4 py-2.5 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] text-sm text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent focus:bg-white transition-all"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching || !searchEmail.trim()}
          className="px-4 py-2.5 rounded-xl bg-[#0d1f2d] text-white text-sm font-semibold hover:bg-[#1a3244] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {isSearching ? "..." : "검색"}
        </button>
      </div>

      {searchError && <p className="text-xs text-red-500">{searchError}</p>}

      {searchResult && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#f8f9fa] border border-[#e5e7eb]">
          <div>
            <p className="text-sm font-semibold text-[#374151]">
              {searchResult.name}
            </p>
            <p className="text-xs text-[#9ca3af]">{searchResult.email}</p>
          </div>
          <button
            type="button"
            onClick={addToList}
            className="text-xs font-bold text-[#4ecdc4] hover:text-[#3dbdb4] cursor-pointer transition-colors"
          >
            + 추가
          </button>
        </div>
      )}

      {inviteList.length > 0 && (
        <ul className="space-y-1.5">
          {inviteList.map((target) => (
            <li
              key={target.id}
              className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#4ecdc4]/10 border border-[#4ecdc4]/20"
            >
              <div>
                <p className="text-sm font-semibold text-[#0d9488]">
                  {target.name}
                </p>
                <p className="text-xs text-[#0d9488]/70">{target.email}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onListChange(inviteList.filter((t) => t.id !== target.id))
                }
                className="text-[#0d9488]/50 hover:text-red-400 cursor-pointer text-xs"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
