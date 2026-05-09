"use client";

import { useState, useRef, useEffect } from "react";

export type AddressResult = {
  name: string; // 장소명
  address: string; // 도로명 주소 (없으면 지번 주소)
  lat: number;
  lng: number;
};

interface Props {
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
}

export default function AddressSearch({
  onSelect,
  placeholder = "장소명 또는 주소를 검색하세요",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<AddressResult | null>(null);
  const [error, setError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setError("");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => search(value), 300);
  }

  async function search(q: string) {
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/address/search?query=${encodeURIComponent(q)}`,
      );
      const data = await res.json();

      const parsed: AddressResult[] = (data.documents ?? []).map(
        (doc: {
          place_name: string;
          road_address_name: string;
          address_name: string;
          x: string;
          y: string;
        }) => ({
          name: doc.place_name,
          address: doc.road_address_name || doc.address_name,
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
        }),
      );

      setResults(parsed);
      setShowDropdown(parsed.length > 0);
    } catch {
      setError("검색 중 오류가 발생했어요.");
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelect(result: AddressResult) {
    setSelected(result);
    setQuery(result.name);
    setShowDropdown(false);
    onSelect(result);
  }

  async function handleGps() {
    if (!navigator.geolocation) {
      setError("이 브라우저는 위치 정보를 지원하지 않아요.");
      return;
    }

    setIsGpsLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          const res = await fetch(`/api/address/reverse?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          const doc = data.documents?.[0];

          if (!doc) {
            setError("현재 위치의 주소를 찾지 못했어요.");
            setIsGpsLoading(false);
            return;
          }

          const address =
            doc.road_address?.address_name || doc.address?.address_name || "";
          const result: AddressResult = {
            name: "현재 위치",
            address,
            lat,
            lng,
          };

          setSelected(result);
          setQuery(address);
          setShowDropdown(false);
          onSelect(result);
        } catch {
          setError("주소 변환 중 오류가 발생했어요.");
        } finally {
          setIsGpsLoading(false);
        }
      },
      (err) => {
        const messages: Record<number, string> = {
          1: "위치 접근 권한이 거부됐어요. 브라우저 설정을 확인해주세요.",
          2: "위치를 가져올 수 없어요.",
          3: "위치 요청이 시간 초과됐어요.",
        };
        setError(messages[err.code] ?? "위치를 가져오는 중 오류가 발생했어요.");
        setIsGpsLoading(false);
      },
      { timeout: 10000 },
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      {/* 검색 입력 */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] text-sm">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onKeyDown={(e) => e.key === "Escape" && setShowDropdown(false)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 pr-4 py-3 rounded-xl border text-sm text-[#0d1f2d] placeholder-[#9ca3af]
            focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all
            ${selected ? "border-[#4ecdc4] bg-[#f0faf9]" : "border-[#e5e7eb] bg-[#f8f9fa] focus:bg-white"}
          `}
        />
        {isSearching && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]">
            검색 중...
          </span>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {showDropdown && results.length > 0 && (
        <ul className="w-full bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
          {results.map((result, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(result)}
                className="w-full px-4 py-3 text-left hover:bg-[#f8f9fa] transition-colors cursor-pointer border-b border-[#f0f0f0] last:border-0"
              >
                <p className="text-sm font-semibold text-[#0d1f2d] truncate">
                  {result.name}
                </p>
                <p className="text-xs text-[#9ca3af] truncate mt-0.5">
                  {result.address}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 현재 위치 사용 버튼 */}
      <button
        type="button"
        onClick={handleGps}
        disabled={isGpsLoading}
        className="flex items-center gap-2 text-xs text-[#4ecdc4] font-semibold hover:text-[#3dbdb4] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>
          {isGpsLoading ? "위치 가져오는 중..." : "📍 현재 위치 사용"}
        </span>
      </button>

      {/* 에러 */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">
          {error}
        </p>
      )}
    </div>
  );
}
