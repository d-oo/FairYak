"use client";

import dynamic from "next/dynamic";
import { type MapLocation } from "./KakaoMap";

const KakaoMap = dynamic(() => import("./KakaoMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 rounded-xl bg-[#f0f2f5] border border-[#e9ebee] animate-pulse" />
  ),
});

// TODO: 실제 중간 장소 계산 알고리즘으로 교체
const MOCK_LOCATIONS: MapLocation[] = [
  {
    name: "잠실 롯데타워",
    address: "서울 송파구 올림픽로 300",
    lat: 37.5125,
    lng: 127.1025,
  },
  {
    name: "잠실종합운동장",
    address: "서울 송파구 올림픽로 25",
    lat: 37.5192,
    lng: 127.0733,
  },
];

export default function MeetingLocationResult() {
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
      <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">추천 장소</h2>

      <div className="space-y-4">
        <KakaoMap locations={MOCK_LOCATIONS} />

        <ul className="space-y-2">
          {MOCK_LOCATIONS.map((loc, i) => (
            <li
              key={loc.name}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f8f9fa] border border-[#e9ebee]"
            >
              <span className="w-6 h-6 rounded-full bg-[#0d1f2d] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#374151] truncate">
                  {loc.name}
                </p>
                <p className="text-xs text-[#9ca3af] mt-0.5 truncate">
                  {loc.address}
                </p>
              </div>
              <span className="text-base shrink-0 ml-auto">📍</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
