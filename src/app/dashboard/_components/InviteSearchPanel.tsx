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

// 이메일 검색 행 + 결과 + 추가된 인원 태그. 부모의 flex 열(간격 8px) 안에 놓인다.
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
    <>
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
          className="h-11 min-w-0 flex-1 border border-ink bg-input px-3.5 text-sm text-ink outline-none focus:shadow-focus"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching || !searchEmail.trim()}
          className="h-11 flex-none cursor-pointer bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
        >
          {isSearching ? "..." : "검색"}
        </button>
      </div>

      {searchError && (
        <p className="text-xs text-accent-text-strong">{searchError}</p>
      )}

      {searchResult && (
        <div className="flex items-center justify-between gap-3 border border-ink bg-input px-3.5 py-2.5">
          <div>
            <p className="text-sm font-semibold">{searchResult.name}</p>
            <p className="text-xs text-muted">{searchResult.email}</p>
          </div>
          <button
            type="button"
            onClick={addToList}
            className="cursor-pointer text-[13px] font-semibold text-accent-text"
          >
            + 추가
          </button>
        </div>
      )}

      {inviteList.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {inviteList.map((target) => (
            <li
              key={target.id}
              className="flex items-center justify-between gap-3 border border-accent bg-accent-soft px-3.5 py-2.25"
            >
              <div>
                <p className="text-sm font-semibold">{target.name}</p>
                <p className="text-xs text-muted">{target.email}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onListChange(inviteList.filter((t) => t.id !== target.id))
                }
                className="cursor-pointer p-1 text-xs text-muted hover:text-accent-text"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
