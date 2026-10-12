"use client";

import KakaoMapCanvas, {
  type MapPadding,
} from "@/app/_components/KakaoMapCanvas";
import { MemberPin, RouteLines } from "@/app/_components/MapMarks";

export interface MapMember {
  label: string;
  lat: number;
  lng: number;
  isMe: boolean;
}

export interface MapStation {
  // 지도 라벨에 쓰는 짧은 이름 (예: "약수역")
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  members: MapMember[];
  stations: MapStation[];
  // 선택된 역의 순번들 (0 = 1위). 여러 개를 동시에 선택할 수 있다
  selected: number[];
  // 지도에서 역 마커를 누르면 그 역의 선택을 켜고 끈다
  onToggle?: (index: number) => void;
  // 넓은 화면에서 지도 왼쪽을 덮는 오버레이 패널(16px + 340px)이 있으면 그 자리를 비우고 맞춘다
  hasLeftPanel?: boolean;
  className?: string;
}

// 라벨이 들어갈 자리를 남기는 여백 (시안: 좌 24 / 우 130 / 위 40 / 아래 64)
function getPadding(hasLeftPanel: boolean): MapPadding {
  const wide = window.innerWidth >= 760;
  return wide && hasLeftPanel
    ? { top: 40, right: 140, bottom: 64, left: 406 }
    : { top: 40, right: 130, bottom: 64, left: 24 };
}

// 멤버 출발지와 추천 역을 보여주는 지도. 선택된 역마다 모든 멤버에서 점선을 긋는다.
export default function RecommendMap({
  members,
  stations,
  selected,
  onToggle,
  hasLeftPanel = false,
  className = "",
}: Props) {
  const selectedSet = new Set(selected);

  return (
    <KakaoMapCanvas
      fitPoints={[...members, ...stations]}
      getPadding={() => getPadding(hasLeftPanel)}
      className={className}
    >
      {(project) => {
        const pins = members.map((m) => ({ ...m, ...project(m) }));
        const marks = stations.map((s, i) => ({
          ...s,
          ...project(s),
          index: i,
          isSelected: selectedSet.has(i),
        }));
        // 1위가 맨 위에 오도록 순위가 낮은 마커부터 그린다
        const selectedMarks = marks.filter((m) => m.isSelected).reverse();

        // 멤버 핀이 선택된 역 마커와 겹치면 멤버 라벨을 마커 바깥으로 밀어낸다
        const labelX = (p: { x: number; y: number }) =>
          selectedMarks.reduce(
            (x, s) =>
              Math.abs(p.x - s.x) < 24 && Math.abs(p.y - s.y) < 24
                ? Math.max(x, s.x - p.x + 24)
                : x,
            12,
          );
        // 멤버 라벨이 역 라벨 자리에 있으면 역 라벨을 마커 왼쪽으로 뒤집는다
        const flip = (s: { x: number; y: number }) =>
          pins.some(
            (p) => Math.abs(p.x - s.x) < 170 && Math.abs(p.y - s.y) < 40,
          );

        return (
          <>
            <RouteLines
              lines={selectedMarks.flatMap((s) =>
                pins.map((p) => ({ from: p, to: s, isMe: p.isMe })),
              )}
            />
            {marks.map((s) =>
              s.isSelected ? null : (
                <button
                  key={s.index}
                  type="button"
                  aria-label={s.label}
                  onClick={() => onToggle?.(s.index)}
                  className="absolute mt-[6.5px] ml-[6.5px] size-3.25 cursor-pointer rounded-full border-2 border-ink bg-paper p-0"
                  style={{ left: s.x, top: s.y }}
                />
              ),
            )}
            {pins.map((p, i) => (
              <MemberPin
                key={i}
                x={p.x}
                y={p.y}
                label={p.label}
                isMe={p.isMe}
                labelX={labelX(p)}
              />
            ))}
            {selectedMarks.map((s) => (
              <div
                key={s.index}
                className="absolute size-0"
                style={{ left: s.x, top: s.y }}
              >
                <button
                  type="button"
                  aria-label={s.label}
                  onClick={() => onToggle?.(s.index)}
                  className="absolute -top-3.5 -left-3.5 flex size-7 cursor-pointer items-center justify-center rounded-full bg-accent p-0 font-mono text-[13px] font-medium text-white"
                  style={{
                    boxShadow: "0 0 0 3px var(--paper), 0 0 0 4px var(--ink)",
                  }}
                >
                  {s.index + 1}
                </button>
                <div
                  className="pointer-events-none absolute -top-3 bg-ink px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap text-paper"
                  style={
                    flip(s)
                      ? { left: -22, transform: "translateX(-100%)" }
                      : { left: 22 }
                  }
                >
                  {s.label}
                </div>
              </div>
            ))}
          </>
        );
      }}
    </KakaoMapCanvas>
  );
}
