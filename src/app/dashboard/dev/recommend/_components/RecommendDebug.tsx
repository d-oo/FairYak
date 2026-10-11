"use client";

// 개발용 도구라 새 디자인 시안 적용 대상이 아니다. 색은 Tailwind 기본 팔레트를 쓰고,
// 지도 마커 SVG에만 단계별 색(STAGE_STYLES)을 직접 넣는다.

import { useEffect, useRef, useState } from "react";
import type {
  CandidateTrace,
  RecommendResult,
  RECOMMEND_PARAMS,
} from "@/utils/recommend";

interface Member {
  lat: number;
  lng: number;
}

type DebugResponse = RecommendResult & {
  params: typeof RECOMMEND_PARAMS;
  elapsedMs: number;
};

type Stage = "top" | "ranked" | "unreachable" | "venueLow" | "notQueried";

const STAGE_STYLES: Record<Stage, { color: string; label: string }> = {
  top: { color: "#16a34a", label: "최종 추천" },
  ranked: { color: "#2563eb", label: "이동시간 조회 · 순위 밖" },
  unreachable: { color: "#7c3aed", label: "이동시간 조회 · 갈 수 없는 멤버 있음" },
  venueLow: { color: "#dc2626", label: "상권 부족으로 제외" },
  notQueried: { color: "#9ca3af", label: "우선순위에서 밀려 조회 안 함" },
};
const MEMBER_COLOR = "#111827";

const PRESETS: { name: string; members: Member[] }[] = [
  {
    name: "홍대·잠실·노원",
    members: [
      { lat: 37.5563, lng: 126.922 },
      { lat: 37.5133, lng: 127.1001 },
      { lat: 37.6551, lng: 127.0613 },
    ],
  },
  {
    name: "강남 3명 + 일산",
    members: [
      { lat: 37.4979, lng: 127.0276 },
      { lat: 37.5045, lng: 127.0249 },
      { lat: 37.4925, lng: 127.0313 },
      { lat: 37.6584, lng: 126.7697 },
    ],
  },
  {
    name: "인천·수원·의정부",
    members: [
      { lat: 37.4563, lng: 126.7052 },
      { lat: 37.2636, lng: 127.0286 },
      { lat: 37.7381, lng: 127.0338 },
    ],
  },
];

function stageOf(c: CandidateTrace, resultCount: number): Stage {
  if (c.rank !== null && c.rank <= resultCount) return "top";
  if (c.queried) return c.rank !== null ? "ranked" : "unreachable";
  return c.venueLow ? "venueLow" : "notQueried";
}

function stageText(c: CandidateTrace, resultCount: number): string {
  switch (stageOf(c, resultCount)) {
    case "top":
      return `★ ${c.rank}위`;
    case "ranked":
      return `${c.rank}위 (${resultCount}위 밖)`;
    case "unreachable":
      return "갈 수 없는 멤버 있음";
    case "venueLow":
      return "상권 부족으로 맨 뒤로";
    case "notQueried":
      return "우선순위에서 밀려 조회 안 함";
  }
}

function markerImageUrl(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="12" fill="${color}" stroke="white" stroke-width="2"/>
    <text x="13" y="17.5" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="sans-serif">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function RecommendDebug() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 지도 생성 + 클릭으로 멤버 추가
  useEffect(() => {
    let cancelled = false;
    function init() {
      if (cancelled || !mapContainerRef.current) return;
      window.kakao.maps.load(() => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new window.kakao.maps.Map(mapContainerRef.current, {
          center: new window.kakao.maps.LatLng(37.5665, 126.978),
          level: 9,
        });
        window.kakao.maps.event.addListener(map, "click", (e) => {
          const lat = e.latLng.getLat();
          const lng = e.latLng.getLng();
          setMembers((prev) => (prev.length >= 10 ? prev : [...prev, { lat, lng }]));
          setResult(null);
        });
        mapRef.current = map;
        setMapReady(true);
      });
    }
    function waitForKakao() {
      if (cancelled) return;
      if (window.kakao) init();
      else setTimeout(waitForKakao, 100);
    }
    waitForKakao();
    return () => {
      cancelled = true;
    };
  }, []);

  // 멤버·결과가 바뀔 때마다 마커를 다시 그린다
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new window.kakao.maps.LatLngBounds();
    const addMarker = (
      lat: number,
      lng: number,
      color: string,
      label: string,
      title: string,
      zIndex: number,
    ) => {
      const position = new window.kakao.maps.LatLng(lat, lng);
      markersRef.current.push(
        new window.kakao.maps.Marker({
          map,
          position,
          title,
          zIndex,
          image: new window.kakao.maps.MarkerImage(
            markerImageUrl(color, label),
            new window.kakao.maps.Size(26, 26),
          ),
        }),
      );
      bounds.extend(position);
    };

    members.forEach((m, i) =>
      addMarker(m.lat, m.lng, MEMBER_COLOR, `M${i + 1}`, `멤버 ${i + 1}`, 30),
    );
    if (result) {
      const resultCount = result.params.RESULT_COUNT;
      result.trace.candidates.forEach((c, i) => {
        const stage = stageOf(c, resultCount);
        addMarker(
          c.station.lat,
          c.station.lng,
          STAGE_STYLES[stage].color,
          stage === "top" ? String(c.rank) : String(i + 1),
          `${c.station.name} · ${stageText(c, resultCount)}`,
          stage === "top" ? 20 : 10,
        );
      });
      map.setBounds(bounds);
    }
  }, [mapReady, members, result]);

  async function run() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/location/recommend/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }

  function loadPreset(preset: Member[]) {
    setMembers(preset);
    setResult(null);
    const map = mapRef.current;
    if (!map) return;
    const bounds = new window.kakao.maps.LatLngBounds();
    preset.forEach((m) => bounds.extend(new window.kakao.maps.LatLng(m.lat, m.lng)));
    map.setBounds(bounds);
  }

  const resultCount = result?.params.RESULT_COUNT ?? 5;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">추천 과정 테스트 (개발용)</h1>
        <p className="text-sm text-gray-500 mt-1">
          지도를 클릭해 멤버 출발지를 추가하고 실행하면, 1차 후보 역이 각 단계에서 어떻게
          처리됐는지 보여줍니다. 실행할 때마다 실제 추천과 같은 만큼 카카오 쿼터를 씁니다
          (이동시간 조회 = 조회 대상 역 수 × 멤버 수).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => loadPreset(p.members)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer"
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => {
            setMembers([]);
            setResult(null);
          }}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer"
        >
          멤버 모두 지우기
        </button>
        <button
          onClick={run}
          disabled={members.length === 0 || isRunning}
          className="ml-auto px-4 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white disabled:opacity-40 cursor-pointer"
        >
          {isRunning ? "계산 중..." : `추천 실행 (멤버 ${members.length}명)`}
        </button>
      </div>

      <div
        ref={mapContainerRef}
        className="w-full h-[480px] rounded-xl overflow-hidden border border-gray-200 bg-gray-100"
      />

      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: MEMBER_COLOR }} />
          멤버 (M1, M2 …)
        </span>
        {(Object.keys(STAGE_STYLES) as Stage[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full" style={{ background: STAGE_STYLES[s].color }} />
            {STAGE_STYLES[s].label}
          </span>
        ))}
        <span>· 마커 숫자: 최종 추천은 순위, 나머지는 2단계 정렬 순서</span>
      </div>

      {members.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {members.map((m, i) => (
            <span
              key={i}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-200"
            >
              M{i + 1} {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
              <button
                onClick={() => {
                  setMembers((prev) => prev.filter((_, j) => j !== i));
                  setResult(null);
                }}
                className="text-gray-400 hover:text-red-600 cursor-pointer"
                aria-label={`멤버 ${i + 1} 삭제`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">오류: {error}</p>}

      {result && (
        <section className="space-y-3">
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              <b>최종 추천:</b>{" "}
              {result.top.length > 0
                ? result.top.map((s, i) => `${i + 1}. ${s.name}`).join("  ")
                : "갈 수 있는 역 없음"}
            </p>
            <p className="text-xs text-gray-500">
              1차 후보 {result.trace.candidates.length}개 (직선거리 최선{" "}
              {(result.trace.bestMeters / 1000).toFixed(1)}km, 허브 우선 그룹 = 최선 +{" "}
              {result.params.STRAIGHT_TOLERANCE_METERS / 1000}km 이내) · 상권 기준{" "}
              {result.params.MIN_VENUES}곳 (반경 {result.params.VENUE_RADIUS_METERS}m) · 이동시간
              조회 {result.params.TRANSIT_CANDIDATES}개 역 · 허용 범위 최대{" "}
              {result.trace.limitMinutes ?? "-"}분 이하 · 호출 장소검색{" "}
              {result.trace.calls.local}건 / 이동시간 {result.trace.calls.transit}건 ·{" "}
              {(result.elapsedMs / 1000).toFixed(1)}초
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">순서</th>
                  <th className="px-2 py-2 text-left">역</th>
                  <th className="px-2 py-2 text-left">노선</th>
                  <th className="px-2 py-2 text-right">가장 먼 멤버까지</th>
                  <th className="px-2 py-2 text-center">허브 우선</th>
                  <th className="px-2 py-2 text-right">음식점+카페</th>
                  <th className="px-2 py-2 text-left">
                    이동시간 ({members.map((_, i) => `M${i + 1}`).join("/")})
                  </th>
                  <th className="px-2 py-2 text-right">최대</th>
                  <th className="px-2 py-2 text-right">합</th>
                  <th className="px-2 py-2 text-center">허용 범위</th>
                  <th className="px-2 py-2 text-left">결과</th>
                </tr>
              </thead>
              <tbody>
                {result.trace.candidates.map((c, i) => {
                  const stage = stageOf(c, resultCount);
                  return (
                    <tr key={c.station.id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold text-gray-900">
                        {c.station.name}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{c.station.lines.join(", ")}</td>
                      <td className="px-2 py-1.5 text-right">
                        {(c.maxMeters / 1000).toFixed(1)}km
                      </td>
                      <td className="px-2 py-1.5 text-center">{c.nearBest ? "✓" : ""}</td>
                      <td
                        className={`px-2 py-1.5 text-right ${c.venueLow ? "text-red-600 font-semibold" : ""}`}
                      >
                        {c.venues ?? "조회 실패"}
                      </td>
                      <td className="px-2 py-1.5">
                        {c.transitMinutes
                          ? c.transitMinutes.map((t) => (t === null ? "×" : `${t}`)).join(" / ")
                          : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right">{c.maxMinutes ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">{c.sumMinutes ?? "-"}</td>
                      <td className="px-2 py-1.5 text-center">
                        {c.maxMinutes === null ? "" : c.inTolerance ? "✓" : "✕"}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-white"
                          style={{ background: STAGE_STYLES[stage].color }}
                        >
                          {stageText(c, resultCount)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
