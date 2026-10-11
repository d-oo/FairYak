"use client";

// 졸업전시 체험 화면. 디자인 시안이 나오기 전 임시 화면이라 Tailwind 기본 팔레트를 쓴다
// (기존 디자인 색은 폐기 예정이라 쓰지 않음). 시안이 나오면 apply-design으로 교체한다.

import { useState } from "react";
import dynamic from "next/dynamic";
import AddressSearch, { type AddressResult } from "@/app/_components/AddressSearch";

const KakaoMap = dynamic(() => import("@/app/_components/KakaoMap"), {
  ssr: false,
  loading: () => <div className="w-full h-64 rounded-xl bg-gray-100 animate-pulse" />,
});

const MIN_PLACES = 2;
const MAX_PLACES = 5;

interface Slot {
  // AddressSearch를 초기화(다시 마운트)하기 위한 key
  key: number;
  place: AddressResult | null;
}

interface RecommendedStation {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  // 입력한 출발지 순서대로 이동시간(분)
  minutes: number[];
}

const ERROR_MESSAGES: Record<number, string> = {
  429: "오늘 이동시간 조회 한도를 초과했어요. 스태프에게 알려주세요",
  422: "대중교통으로 모두가 갈 수 있는 역을 찾지 못했어요",
};

let nextSlotKey = 0;
const newSlot = (): Slot => ({ key: nextSlotKey++, place: null });

export default function TryRecommend() {
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: MIN_PLACES }, newSlot),
  );
  // 결과를 계산할 때 쓴 출발지 (입력을 바꿔도 결과 화면이 어긋나지 않도록 따로 보관)
  const [usedPlaces, setUsedPlaces] = useState<AddressResult[]>([]);
  const [stations, setStations] = useState<RecommendedStation[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = slots.flatMap((s) => (s.place ? [s.place] : []));

  function updateSlot(key: number, place: AddressResult | null) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, place } : s)));
  }

  function reset() {
    setSlots(Array.from({ length: MIN_PLACES }, newSlot));
    setStations(null);
    setUsedPlaces([]);
    setError(null);
  }

  async function recommend() {
    setIsLoading(true);
    setError(null);
    setStations(null);
    try {
      const res = await fetch("/api/try/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members: filled.map(({ lat, lng }) => ({ lat, lng })),
        }),
      });
      if (!res.ok) {
        setError(ERROR_MESSAGES[res.status] ?? "추천 중 오류가 발생했어요");
        return;
      }
      const data: { stations: RecommendedStation[] } = await res.json();
      setUsedPlaces(filled);
      setStations(data.stations);
    } catch {
      setError("추천 중 오류가 발생했어요");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">페어약 체험하기</h1>
        <p className="text-sm text-gray-600">
          친구들의 출발지를 입력하면, 모두의 대중교통 이동시간이 고르게 짧은 지하철역을
          추천해 드려요. 가장 오래 걸리는 사람의 시간을 먼저 줄이는 것이 기준이에요.
        </p>
      </header>

      <section className="space-y-4">
        {slots.map((slot, i) => (
          <div key={slot.key} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">출발지 {i + 1}</span>
              {slots.length > MIN_PLACES && (
                <button
                  type="button"
                  onClick={() => setSlots((prev) => prev.filter((s) => s.key !== slot.key))}
                  className="text-xs text-gray-400 hover:text-red-600 cursor-pointer"
                >
                  삭제
                </button>
              )}
            </div>
            <AddressSearch
              showCurrentLocation={false}
              onSelect={(place) => updateSlot(slot.key, place)}
            />
            {slot.place && (
              <p className="text-xs text-gray-500">선택됨: {slot.place.address}</p>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          {slots.length < MAX_PLACES && (
            <button
              type="button"
              onClick={() => setSlots((prev) => [...prev, newSlot()])}
              className="px-4 py-2 text-sm rounded-xl border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer"
            >
              + 출발지 추가
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm rounded-xl border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer"
          >
            처음부터 다시
          </button>
          <button
            type="button"
            onClick={recommend}
            disabled={filled.length < MIN_PLACES || isLoading}
            className="ml-auto px-5 py-2 text-sm font-semibold rounded-xl bg-gray-900 text-white disabled:opacity-40 cursor-pointer"
          >
            {isLoading ? "계산 중..." : "중간 장소 추천받기"}
          </button>
        </div>
        {filled.length < MIN_PLACES && (
          <p className="text-xs text-gray-500">출발지를 {MIN_PLACES}곳 이상 선택해 주세요.</p>
        )}
      </section>

      {isLoading && (
        <p className="text-sm text-gray-500 text-center">
          후보 역들의 이동시간을 조회하고 있어요. 잠시만 기다려 주세요...
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
      )}

      {stations && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">추천 장소</h2>
          <KakaoMap
            locations={stations.map((s) => ({
              name: s.name,
              address: s.lines.join(", "),
              lat: s.lat,
              lng: s.lng,
            }))}
            memberLocations={usedPlaces.map((p, i) => ({
              name: `출발지 ${i + 1} · ${p.name}`,
              lat: p.lat,
              lng: p.lng,
              isMe: false,
            }))}
          />
          <ol className="space-y-3">
            {stations.map((s, rank) => {
              const max = Math.max(...s.minutes);
              return (
                <li key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-gray-400">{rank + 1}</span>
                    <span className="text-base font-bold text-gray-900">{s.name}</span>
                    <span className="text-xs text-gray-500">{s.lines.join(" · ")}</span>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {s.minutes.map((m, i) => (
                      <li
                        key={i}
                        className={`text-xs px-2 py-1 rounded-lg ${
                          m === max ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {usedPlaces[i]?.name ?? `출발지 ${i + 1}`} {m}분
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-gray-400">
            진하게 표시된 시간이 그 장소에서 가장 오래 걸리는 사람이에요.
          </p>
        </section>
      )}
    </main>
  );
}
