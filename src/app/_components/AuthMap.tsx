"use client";

import KakaoMapCanvas from "@/app/_components/KakaoMapCanvas";
import { MemberPin, RouteLines } from "@/app/_components/MapMarks";

// 랜딩·인증 화면 배경의 예시 모임 (장식용 고정 데이터). 라벨 없이 핀과 점선만 그린다
const SAMPLE_MEMBERS = [
  { lat: 37.5126, lng: 127.1025, isMe: true },
  { lat: 37.5559, lng: 126.9105, isMe: false },
  { lat: 37.5928, lng: 127.0167, isMe: false },
  { lat: 37.4812, lng: 126.9526, isMe: false },
];
const SAMPLE_STATION = { lat: 37.5543, lng: 127.0106 };
const FIT_POINTS = [...SAMPLE_MEMBERS, SAMPLE_STATION];

// 핀 묶음을 패널을 뺀 나머지 영역 가운데에 맞춘다. 라벨이 없으므로 여백은 상하좌우 같게 둔다.
// 넓은 화면: 왼쪽 패널(32px + 452px) 오른쪽 영역 / 좁은 화면: 패널이 시작하는 36vh 위쪽 영역
function getPadding(width: number, height: number) {
  const vh = window.innerHeight;
  return width >= 760
    ? { top: 70, right: 70, bottom: height - vh + 70, left: 546 }
    : { top: 69, right: 36, bottom: height - (vh * 0.36 - 1) + 36, left: 36 };
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
            {pins.map((p, i) => (
              <MemberPin key={i} x={p.x} y={p.y} isMe={p.isMe} />
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
            </div>
          </>
        );
      }}
    </KakaoMapCanvas>
  );
}
