"use client";

// 체험 화면의 "추천 과정" 패널. 추천 결과가 나온 뒤 계산 과정을 4단계로 나눠 다시 보여준다.
// 지도는 건드리지 않고 이 패널 안에서만 보여준다.

import { useState } from "react";
import SectionHeader from "@/app/_components/SectionHeader";
import type { ScoreModeOption } from "./TryRecommend";

// /api/try/recommend 응답의 process
export interface TryProcessData {
  stationCount: number;
  // 이동시간을 어디서 조회했는지 (카카오 무료 쿼터가 바닥나면 TMAP)
  transitProvider: "kakao" | "tmap";
  minVenues: number;
  venueRadius: number;
  resultCount: number;
  candidates: {
    id: string;
    name: string;
    lines: string[];
    // 1: 직선거리로 고른 후보, 2: 출발지별 속도 보정 후 추가된 후보
    source: 1 | 2;
    // 반경 안 음식점+카페 수. 조회 실패면 null
    venues: number | null;
    venueLow: boolean;
    // 몇 단계에서 이동시간을 조회했는지. 조회 안 했으면 null
    queriedIn: 1 | 2 | null;
    // 출발지 순서대로 이동시간(분). 경로 없음은 null
    minutes: (number | null)[] | null;
    // 한 명이라도 갈 수 없으면 null
    maxMinutes: number | null;
    sumMinutes: number | null;
  }[];
}

const STEPS = ["후보 추리기", "상권 확인", "이동시간 조회", "순위 매기기"];

export default function TryProcess({
  process,
  memberNames,
  ranking,
  criterion,
}: {
  process: TryProcessData;
  // 계산에 쓴 출발지 이름 (입력 순서대로)
  memberNames: string[];
  // 체험객이 고른 기준으로 모두가 갈 수 있는 역 id를 순위대로 (실패했으면 빈 배열)
  ranking: string[];
  criterion: ScoreModeOption;
}) {
  const [step, setStep] = useState(0);
  const last = STEPS.length - 1;

  const { candidates } = process;
  const round1 = candidates.filter((c) => c.source === 1);
  const venueLow = round1.filter((c) => c.venueLow);
  // 1단계에서 조회한 역 다음에 2단계에서 조회한 역
  const queried = candidates
    .filter((c) => c.queriedIn !== null)
    .sort((a, b) => a.queriedIn! - b.queriedIn!);
  const round2Count = queried.filter((c) => c.queriedIn === 2).length;
  const ranked = ranking.map((id) => candidates.find((c) => c.id === id)!);
  const unreachable = queried.filter((c) => c.maxMinutes === null);

  const views = [
    {
      title: `전국 ${process.stationCount}개 역 중 ${round1.length}곳을 골랐어요`,
      summary: `${process.stationCount} → ${round1.length}`,
      description:
        "모든 역을 다 조회할 수는 없으니, 먼저 지도 위 직선거리로 후보를 줄였어요. 가장 멀리 있는 출발지까지의 거리가 짧은 역일수록 모두에게 고르게 가까운 역이에요.",
      body: (
        <div className="flex flex-wrap gap-1.5">
          {round1.map((c) => (
            <span
              key={c.id}
              className="border border-rule bg-input px-2.5 py-1 text-[13px]"
            >
              {c.name}
              <span className="ml-1.5 text-xs text-muted">{c.lines.join(", ")}</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      title: "주변에 먹고 마실 곳이 있는지 확인했어요",
      summary: venueLow.length === 0 ? "모두 통과" : `${venueLow.length}곳 제외`,
      description: `만나서 밥 먹고 차 마실 곳이 있어야 하니까, 역 반경 ${process.venueRadius}m 안의 음식점·카페 수를 셌어요. ${process.minVenues}곳이 안 되는 역은 후보에서 뺐어요.`,
      body: (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-px border border-rule bg-rule">
          {round1.map((c) => (
            <div
              key={c.id}
              className={`flex items-baseline gap-2 bg-paper px-3 py-2 text-[13px] ${
                c.venueLow ? "text-faint" : ""
              }`}
            >
              <span className="min-w-0 truncate">{c.name}</span>
              <span className="ml-auto shrink-0 font-mono text-xs">
                {c.venues === null ? "확인 못 함" : `${c.venues}곳`}
              </span>
              {c.venueLow && (
                <span className="shrink-0 bg-accent-soft px-1.5 text-[11px] text-accent-text-deep">
                  부족
                </span>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: `유력한 ${queried.length}곳의 실제 이동시간을 조회했어요`,
      summary: `${queried.length}곳 × ${memberNames.length}명`,
      description:
        `직선거리가 비슷하면 환승 노선이 많고 상권이 큰 역을 앞세워, 앞쪽 ${queried.length - round2Count}곳까지 출발지마다 대중교통 시간을 조회했어요.` +
        (round2Count > 0
          ? ` 역에서 먼 동네는 같은 거리라도 더 오래 걸리고, 노선 방향에 따라서도 빠르기가 달라요. 그래서 출발지별 이동 속도와 근처 역의 실제 조회 결과로 다른 역들의 이동시간을 추정해, 기준마다 유력한 ${round2Count}곳을 더 확인했어요.`
          : "") +
        (process.transitProvider === "tmap"
          ? " (오늘은 카카오 길찾기 조회 한도가 끝나 TMAP 길찾기로 조회했어요.)"
          : ""),
      body: (
        <>
          <div className="overflow-x-auto border border-rule">
            <table className="w-full text-[13px]">
              <thead className="bg-page text-xs text-muted">
                <tr>
                  {/* 표가 패널 폭을 채울 때 남는 폭은 역 칸이 가져가고, 출발지 칸은 내용만큼만 차지한다 */}
                  <th className="w-full px-3 py-2 text-left font-medium">역</th>
                  {memberNames.map((name, i) => (
                    <th key={i} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                      {/* 이름을 다 쓰면 칸이 넓어지므로 입력 화면과 같은 번호로 보여주고, 이름은 툴팁으로 */}
                      <span
                        className="cursor-help underline decoration-dotted underline-offset-3"
                        title={name}
                      >
                        출발지 {i + 1}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queried.map((c) => (
                  <tr key={c.id} className="border-t border-rule bg-paper">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {c.name}
                      {c.queriedIn === 2 && (
                        <span className="ml-1.5 bg-page px-1.5 text-[11px] text-muted">
                          추가 확인
                        </span>
                      )}
                    </td>
                    {(c.minutes ?? []).map((m, i) => (
                      <td
                        key={i}
                        className={`px-2 py-2 text-right font-mono whitespace-nowrap ${
                          m === null
                            ? "text-faint"
                            : m === c.maxMinutes
                              ? "font-semibold text-accent-text"
                              : ""
                        }`}
                      >
                        {m === null ? "×" : `${m}분`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            주홍 숫자는 그 역까지 가장 오래 걸리는 출발지예요. ×는 대중교통으로 갈 수 없는
            경우예요.
          </p>
        </>
      ),
    },
    {
      ...(ranked.length === 0
        ? {
            title: "모두가 갈 수 있는 역이 없었어요",
            summary: "추천 없음",
            description:
              "조회한 역마다 대중교통으로 갈 수 없는 출발지가 있었어요. 출발지끼리 너무 멀면(예: 서울과 부산) 기차가 필요한데, 지금 쓰는 길찾기는 지하철·버스 위주라 경로를 찾지 못해요.",
          }
        : {
            title: `"${criterion.label}" 기준으로 ${Math.min(process.resultCount, ranked.length)}곳을 추천했어요`,
            summary: `상위 ${Math.min(process.resultCount, ranked.length)}곳`,
            description:
              `${criterion.description} 기준을 바꾸면 이미 조회한 이동시간으로 순위만 다시 매겨요.` +
              (unreachable.length > 0
                ? " 한 명이라도 대중교통으로 갈 수 없는 역은 뺐어요."
                : ""),
          }),
      body: (
        <div className="flex flex-col gap-px border border-rule bg-rule">
          {ranked.map((c, i) => {
            const rank = i + 1;
            const isTop = rank <= process.resultCount;
            const avg = c.sumMinutes! / memberNames.length;
            return (
              <div
                key={c.id}
                className={`grid grid-cols-[34px_minmax(0,1fr)_auto] items-baseline gap-x-2 px-3 py-2.5 text-[13px] ${
                  isTop ? "bg-accent-soft" : "bg-paper text-muted"
                }`}
              >
                <span
                  className={`font-mono ${isTop ? "text-accent-text" : "text-faint"}`}
                >
                  {String(rank).padStart(2, "0")}
                </span>
                <span className={`truncate ${isTop ? "font-semibold text-ink" : ""}`}>
                  {c.name}
                </span>
                <span className="font-mono text-xs whitespace-nowrap">
                  가장 오래 {c.maxMinutes}분 · 평균 {Number(avg.toFixed(1))}분
                </span>
              </div>
            );
          })}
          {unreachable.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-baseline gap-x-2 bg-paper px-3 py-2.5 text-[13px] text-faint"
            >
              <span className="font-mono">–</span>
              <span className="truncate line-through">{c.name}</span>
              <span className="text-xs whitespace-nowrap">갈 수 없는 출발지가 있어 제외</span>
            </div>
          ))}
        </div>
      ),
    },
  ];
  const view = views[step];

  return (
    <section className="border border-ink bg-paper">
      <SectionHeader
        title="추천 과정"
        right={
          <span className="font-mono text-[11px] text-muted">
            {step + 1}/{STEPS.length}
          </span>
        }
      />

      <div className="grid grid-cols-4 border-b border-ink">
        {STEPS.map((label, i) => {
          const isActive = i === step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`flex cursor-pointer flex-col items-start gap-0.5 border-l border-rule px-3 py-2.5 text-left first:border-l-0 hover:bg-row-hover ${
                isActive ? "bg-accent-soft" : "bg-paper"
              }`}
            >
              <span
                className={`font-mono text-[11px] ${isActive ? "text-accent-text" : "text-faint"}`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`text-[13px] ${isActive ? "font-semibold" : "font-medium text-muted"}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-4.5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-semibold">{view.title}</h3>
          <span className="ml-auto font-mono text-sm text-accent-text">{view.summary}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">{view.description}</p>
        <div className="mt-3.5">{view.body}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-ink px-4.5 py-3">
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className="h-9.5 cursor-pointer border border-ink px-3.5 text-[13px] font-medium text-ink enabled:hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => setStep(step + 1)}
          disabled={step === last}
          className="h-9.5 cursor-pointer border border-ink px-3.5 text-[13px] font-medium text-ink enabled:hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </section>
  );
}
