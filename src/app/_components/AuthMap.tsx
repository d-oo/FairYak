"use client";

import KakaoMapCanvas from "@/app/_components/KakaoMapCanvas";
import { MemberPin, RouteLines } from "@/app/_components/MapMarks";

// 랜딩·인증 화면 배경의 예시 모임 (장식용 고정 데이터)
const SAMPLE_MEMBERS = [
  { label: "김민지 27분", lat: 37.5126, lng: 127.1025, isMe: true },
  { label: "박서준 29분", lat: 37.5559, lng: 126.9105, isMe: false },
  { label: "이하은 22분", lat: 37.5928, lng: 127.0167, isMe: false },
  { label: "최지호 31분", lat: 37.4812, lng: 126.9526, isMe: false },
];
const SAMPLE_STATION = { lat: 37.5543, lng: 127.0106 };
const FIT_POINTS = [...SAMPLE_MEMBERS, SAMPLE_STATION];

// 핀 묶음을 패널을 뺀 나머지 영역 가운데에 맞춘다.
// 넓은 화면: 왼쪽 패널(32px + 452px) 오른쪽 영역 / 좁은 화면: 패널이 시작하는 36vh 위쪽 영역
function getPadding(width: number, height: number) {
  const vh = window.innerHeight;
  return width >= 760
    ? { top: 70, right: 168, bottom: height - vh + 94, left: 546 }
    : { top: 69, right: 142, bottom: height - (vh * 0.36 - 1) + 64, left: 36 };
}

export default function AuthMap() {
  return (
    <KakaoMapCanvas
      fitPoints={FIT_POINTS}
      getPadding={getPadding}
      interactive={false}
      className="pointer-events-none absolute inset-0"
    >
      {(project) => {
        const station = project(SAMPLE_STATION);
        const pins = SAMPLE_MEMBERS.map((m) => ({ ...m, ...project(m) }));
        return (
          <>
            <RouteLines
              lines={pins.map((p) => ({ from: p, to: station, isMe: p.isMe }))}
            />
            {pins.map((p) => (
              <MemberPin
                key={p.label}
                x={p.x}
                y={p.y}
                label={p.label}
                isMe={p.isMe}
              />
            ))}
            <div
              className="absolute size-0"
              style={{ left: station.x, top: station.y }}
            >
              <div
                className="absolute -top-2.5 -left-2.5 size-5 rounded-full bg-accent"
                style={{
                  boxShadow: "0 0 0 4px var(--paper), 0 0 0 5px var(--ink)",
                }}
              />
              <div className="absolute top-5.5 left-0 -translate-x-1/2 bg-ink px-3.5 py-2.25 whitespace-nowrap text-paper">
                <div className="text-base font-semibold">약수역</div>
                <div className="mt-0.5 font-mono text-xs text-disabled">
                  10월 17일 (토)
                </div>
              </div>
            </div>
          </>
        );
      }}
    </KakaoMapCanvas>
  );
}
