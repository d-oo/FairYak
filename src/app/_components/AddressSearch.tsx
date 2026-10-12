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
  // 전시용 체험 화면처럼 기기 위치가 의미 없는 곳에서는 "현재 위치 사용"을 숨긴다
  showCurrentLocation?: boolean;
}

export default function AddressSearch({
  onSelect,
  showCurrentLocation = true,
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
    <div ref={containerRef} className="flex flex-col gap-2">
      {/* 검색 입력 */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onKeyDown={(e) => e.key === "Escape" && setShowDropdown(false)}
          placeholder="장소명 또는 주소를 검색하세요"
          autoComplete="off"
          className={`h-11.5 w-full border pr-21 pl-3.5 text-sm text-ink outline-none focus:shadow-focus ${
            selected ? "border-accent bg-accent-soft" : "border-ink bg-input"
          }`}
        />
        {isSearching && (
          <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-faint">
            검색 중...
          </span>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {showDropdown && results.length > 0 && (
        <ul className="flex flex-col gap-px border border-ink bg-rule">
          {results.map((result, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(result)}
                className="block w-full cursor-pointer bg-input px-3.5 py-2.5 text-left text-ink hover:bg-page"
              >
                <span className="block text-sm font-semibold">
                  {result.name}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {result.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 현재 위치 사용 버튼 */}
      {showCurrentLocation && (
        <button
          type="button"
          onClick={handleGps}
          disabled={isGpsLoading}
          className="cursor-pointer self-start text-xs font-semibold text-accent-text disabled:opacity-50"
        >
          {isGpsLoading ? "위치 가져오는 중..." : "현재 위치 사용"}
        </button>
      )}

      {/* 에러 */}
      {error && (
        <p className="border border-accent bg-error-bg px-3 py-2 text-xs text-accent-text-strong">
          {error}
        </p>
      )}
    </div>
  );
}
