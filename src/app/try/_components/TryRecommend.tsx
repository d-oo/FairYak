"use client";

// 졸업전시 체험 화면. 시안(design_handoff_fairyak_redesign)에 이 화면 명세는 없어서,
// 모임 상세의 패널·지도 규칙(번호 붙은 패널, 주홍 업데이트 버튼, 추천 장소 목록)을 따라 만들었다.

import { useState } from "react";
import AddressSearch, { type AddressResult } from "@/app/_components/AddressSearch";
import RecommendMap from "@/app/_components/RecommendMap";
import SectionHeader from "@/app/_components/SectionHeader";
import type { ScoreMode } from "@/utils/recommend";
import TryProcess, { type TryProcessData } from "./TryProcess";

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

// 순위 기준. "어느 역이 더 공평한가"는 사람마다 생각이 달라서 체험객이 직접 바꿔 보게 한다.
// 기준별 순위는 서버가 한 번에 매겨 주므로 바꿔도 다시 조회하지 않는다 (가중치는 recommend.ts의 SCORE_MODES)
export interface ScoreModeOption {
  id: ScoreMode;
  label: string;
  description: string;
}

const SCORE_MODE_OPTIONS: ScoreModeOption[] = [
  {
    id: "fair",
    label: "한 명도 멀지 않게",
    description:
      "가장 오래 걸리는 사람의 시간을 가장 먼저 줄여요. 다른 사람들이 조금 더 걸리더라도 한 명만 멀리 가는 곳은 피해요.",
  },
  {
    id: "balanced",
    label: "균형",
    description:
      "가장 오래 걸리는 사람의 시간을 가장 크게 보고, 모두의 평균 시간도 함께 따져요.",
  },
  {
    id: "fast",
    label: "다 같이 빨리",
    description:
      "모두의 이동시간을 합쳐서 짧은 곳을 앞세워요. 여럿이 빨라진다면 한 명이 조금 더 걸리는 건 감수해요.",
  },
];

// /api/try/recommend 실패 코드(error)별 안내 문구
const ERROR_MESSAGES: Record<string, string> = {
  quota_exceeded: "오늘 장소 검색 한도를 초과했어요. 스태프에게 알려주세요",
  closed: "오늘 체험이 마감됐어요. 찾아와 주셔서 감사해요!",
  no_reachable_station:
    "대중교통으로 모두가 갈 수 있는 역을 찾지 못했어요. 추천 과정에서 이유를 볼 수 있어요",
};

let nextSlotKey = 0;
const newSlot = (): Slot => ({ key: nextSlotKey++, place: null });

export default function TryRecommend() {
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: MIN_PLACES }, newSlot),
  );
  // 결과를 계산할 때 쓴 출발지 (입력을 바꿔도 결과 화면이 어긋나지 않도록 따로 보관)
  const [usedPlaces, setUsedPlaces] = useState<AddressResult[]>([]);
  // 모두가 갈 수 있는 역 전부와, 기준별로 그 역들을 순위대로 세운 id 목록
  const [reachable, setReachable] = useState<RecommendedStation[] | null>(null);
  const [rankings, setRankings] = useState<Record<ScoreMode, string[]> | null>(null);
  const [mode, setMode] = useState<ScoreMode>("balanced");
  const [process, setProcess] = useState<TryProcessData | null>(null);
  // 추천할 때마다 바뀌어 과정 패널을 1단계부터 다시 보여주게 한다
  const [runId, setRunId] = useState(0);
  // 지도와 목록에서 선택된 추천 역 순번 (0 = 1위)
  const [selected, setSelected] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 카카오 무료 쿼터와 TMAP 월간 상한을 모두 써서 더 추천할 수 없는 상태
  const [isClosed, setIsClosed] = useState(false);

  const filled = slots.flatMap((s) => (s.place ? [s.place] : []));
  const modeOption = SCORE_MODE_OPTIONS.find((o) => o.id === mode)!;
  // 고른 기준의 상위 추천 역
  const stations =
    reachable && rankings && process
      ? rankings[mode]
          .slice(0, process.resultCount)
          .map((id) => reachable.find((s) => s.id === id)!)
      : null;

  function changeMode(next: ScoreMode) {
    setMode(next);
    setSelected(0);
  }

  function updateSlot(key: number, place: AddressResult | null) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, place } : s)));
  }

  function reset() {
    setSlots(Array.from({ length: MIN_PLACES }, newSlot));
    setReachable(null);
    setRankings(null);
    setProcess(null);
    setUsedPlaces([]);
    setError(null);
  }

  async function recommend() {
    setIsLoading(true);
    setError(null);
    setReachable(null);
    setRankings(null);
    setProcess(null);
    try {
      const res = await fetch("/api/try/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members: filled.map(({ lat, lng }) => ({ lat, lng })),
        }),
      });
      const data: {
        error?: string;
        stations?: RecommendedStation[];
        rankings?: Record<ScoreMode, string[]>;
        process?: TryProcessData;
      } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data.error && ERROR_MESSAGES[data.error]) ?? "추천 중 오류가 발생했어요",
        );
        if (data.error === "closed") setIsClosed(true);
      } else {
        setReachable(data.stations ?? null);
        setRankings(data.rankings ?? null);
        setSelected(0);
      }
      // 갈 수 있는 역이 없어 실패(422)해도 과정은 함께 오므로, 왜 실패했는지 보여준다
      if (data.process) {
        setUsedPlaces(filled);
        setProcess(data.process);
        setRunId((id) => id + 1);
      }
    } catch {
      setError("추천 중 오류가 발생했어요");
    } finally {
      setIsLoading(false);
    }
  }

  // 결과가 있으면 계산에 쓴 출발지와 선택된 역까지의 시간을, 없으면 지금 입력 중인 출발지를 보여준다.
  // 선택된 역에서 가장 오래 걸리는 출발지는 주홍으로 표시한다.
  const selectedStation = stations?.[selected] ?? null;
  const slowest = selectedStation ? Math.max(...selectedStation.minutes) : null;
  const mapMembers = (stations ? usedPlaces : filled).map((p, i) => {
    const minutes = selectedStation?.minutes[i];
    return {
      label: minutes !== undefined ? `${p.name} ${minutes}분` : p.name,
      lat: p.lat,
      lng: p.lng,
      isMe: minutes !== undefined && minutes === slowest,
    };
  });

  return (
    <>
      <div className="mb-4.5">
        <h1 className="text-[clamp(24px,3vw,30px)] leading-[1.2] font-semibold tracking-[-0.035em]">
          페어약 체험하기
        </h1>
        <p className="mt-2 text-sm leading-[1.6] text-muted">
          친구들의 출발지를 입력하면, 모두의 대중교통 이동시간이 고르게 짧은 지하철역을
          추천해 드려요. 무엇이 공평한지는 사람마다 다르니, 순위 기준도 직접 바꿔 볼 수 있어요.
        </p>
      </div>

      {/* 좁은 화면: 출발지 → 추천 장소 → 지도 → 추천 과정 순으로 쌓는다.
          넓은 화면: 지도를 오른쪽 위에 고정하고, 그 아래 줄에 추천 장소와 추천 과정을 나란히 둔다 */}
      <div className="grid items-start gap-5 min-[960px]:grid-cols-[340px_minmax(0,1fr)]">
        {/* 출발지 입력 */}
        <section className="border border-ink bg-paper">
          <SectionHeader
            title="출발지"
            right={
              <span className="font-mono text-[11px] text-muted">
                {filled.length}/{MAX_PLACES}
              </span>
            }
          />
          <div className="flex flex-col gap-px bg-rule">
            {slots.map((slot, i) => (
              <div
                key={slot.key}
                className="flex flex-col gap-2 bg-paper px-4.5 py-3.5"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">
                    출발지 <span className="font-mono">{i + 1}</span>
                  </span>
                  {slots.length > MIN_PLACES && (
                    <button
                      type="button"
                      onClick={() =>
                        setSlots((prev) => prev.filter((s) => s.key !== slot.key))
                      }
                      className="cursor-pointer text-[13px] text-faint underline underline-offset-3 hover:text-accent-text"
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
                  <p className="bg-accent-soft px-3 py-2 text-xs text-accent-text-deep">
                    선택됨: {slot.place.address}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-ink px-4.5 py-3.5">
            {slots.length < MAX_PLACES && (
              <button
                type="button"
                onClick={() => setSlots((prev) => [...prev, newSlot()])}
                className="h-9.5 cursor-pointer border border-ink px-3.5 text-[13px] font-medium text-ink hover:bg-page"
              >
                + 출발지 추가
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="h-9.5 cursor-pointer border border-ink px-3.5 text-[13px] font-medium text-ink hover:bg-page"
            >
              처음부터 다시
            </button>
          </div>
          {filled.length < MIN_PLACES && (
            <p className="px-4.5 pb-3.5 text-xs text-muted">
              출발지를 {MIN_PLACES}곳 이상 선택해 주세요.
            </p>
          )}
          <button
            type="button"
            onClick={recommend}
            disabled={filled.length < MIN_PLACES || isLoading || isClosed}
            className="flex h-12 w-full cursor-pointer items-center justify-center border-t border-ink bg-accent text-[15px] font-semibold text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isClosed ? "오늘 체험 마감" : isLoading ? "계산 중..." : "중간 장소 추천받기"}
          </button>
        </section>

        {/* 추천 결과 */}
        {(isLoading || error || stations) && (
          <section className="border border-ink bg-paper">
            <SectionHeader title="추천 장소" />

            {isLoading && (
              <div className="pb-4">
                <div className="flex flex-col gap-px bg-rule">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[34px_1fr] bg-paper px-4.5 py-3.5"
                    >
                      <span className="mt-0.75 h-3 w-4 bg-track" />
                      <span>
                        <span className="block h-3.25 w-3/5 bg-track" />
                        <span className="mt-2 block h-2.5 w-[35%] bg-page" />
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mx-4.5 mt-3.5 text-center text-xs text-muted">
                  후보 역들의 이동시간을 조회하고 있어요. 잠시만 기다려 주세요...
                </p>
              </div>
            )}

            {error && <p className="p-4.5 text-sm text-muted">{error}</p>}

            {stations && (
              <>
                <div className="border-b border-rule px-4.5 py-3.5">
                  <div className="grid grid-cols-3 border border-ink">
                    {SCORE_MODE_OPTIONS.map((o) => {
                      const isActive = o.id === mode;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => changeMode(o.id)}
                          aria-pressed={isActive}
                          className={`min-h-9.5 cursor-pointer border-l border-ink px-2 py-1.5 text-[13px] first:border-l-0 ${
                            isActive
                              ? "bg-ink font-semibold text-paper"
                              : "bg-paper font-medium text-ink hover:bg-row-hover"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-[1.6] text-muted">
                    {modeOption.description}
                  </p>
                </div>
                <div className="flex flex-col gap-px bg-rule">
                  {stations.map((s, i) => {
                    const isSelected = i === selected;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelected(i)}
                        className={`grid w-full cursor-pointer grid-cols-[34px_minmax(0,1fr)] px-4.5 py-3.25 text-left text-ink hover:bg-row-hover ${
                          isSelected ? "bg-accent-soft" : "bg-paper"
                        }`}
                      >
                        <span
                          className={`pt-px font-mono text-[13px] ${
                            isSelected ? "text-accent-text" : "text-faint"
                          }`}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-[15px] ${isSelected ? "font-semibold" : "font-medium"}`}
                          >
                            {s.name} {s.lines.join(", ")}
                          </span>
                          <span className="mt-0.75 block font-mono text-xs text-muted">
                            가장 오래 {Math.max(...s.minutes)}분 · 평균{" "}
                            {Number(
                              (
                                s.minutes.reduce((a, b) => a + b, 0) / s.minutes.length
                              ).toFixed(1),
                            )}
                            분
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="border-t border-rule px-4.5 py-3 text-xs text-muted">
                  지도에서 주홍색 라벨이 선택한 역까지 가장 오래 걸리는 출발지예요. 이 역들을
                  고른 과정은 추천 과정에서 볼 수 있어요.
                </p>
              </>
            )}
          </section>
        )}

        <div className="min-w-0 border border-ink bg-map-bg min-[960px]:col-start-2 min-[960px]:row-start-1">
          <RecommendMap
            members={mapMembers}
            stations={(stations ?? []).map((s) => ({
              label: s.name,
              lat: s.lat,
              lng: s.lng,
            }))}
            // 체험 화면은 선택한 역 하나의 이동시간을 라벨에 보여주므로 한 번에 하나만 선택한다
            selected={stations ? [selected] : []}
            onToggle={setSelected}
            className="relative h-80 overflow-hidden wide:h-135"
          />
        </div>

        {process && (
          <div className="min-w-0">
            <TryProcess
              key={runId}
              process={process}
              memberNames={usedPlaces.map((p) => p.name)}
              ranking={rankings?.[mode] ?? []}
              criterion={modeOption}
            />
          </div>
        )}
      </div>
    </>
  );
}
