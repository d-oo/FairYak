"use client";

import { useEffect, useRef } from "react";

export interface MapLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface MemberMapLocation {
  name: string;
  lat: number;
  lng: number;
  isMe: boolean;
}

interface Props {
  locations: MapLocation[];
  memberLocations?: MemberMapLocation[];
}

function markerImageUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="13" fill="${color}" stroke="white" stroke-width="2"/>
    <text x="14" y="19" text-anchor="middle" fill="white" font-size="14">★</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function KakaoMap({ locations, memberLocations = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function initMap() {
      if (cancelled || !containerRef.current) return;

      window.kakao.maps.load(() => {
        if (cancelled || !containerRef.current) return;

        const center = new window.kakao.maps.LatLng(
          locations[0].lat,
          locations[0].lng,
        );
        const map = new window.kakao.maps.Map(containerRef.current, {
          center,
          level: 5,
        });

        const bounds = new window.kakao.maps.LatLngBounds();
        let openInfoWindow: KakaoInfoWindow | null = null;

        function closeOpenInfoWindow() {
          if (openInfoWindow) {
            openInfoWindow.close();
            openInfoWindow = null;
          }
        }

        // 지도 클릭 시 인포윈도우 닫기
        window.kakao.maps.event.addListener(map, "click", closeOpenInfoWindow);

        // 추천 장소 마커 (기본 빨간 마커)
        locations.forEach((loc) => {
          const position = new window.kakao.maps.LatLng(loc.lat, loc.lng);
          const marker = new window.kakao.maps.Marker({ map, position });
          bounds.extend(position);

          const infoWindow = new window.kakao.maps.InfoWindow({
            content: `<div style="padding:6px 10px;font-size:13px;font-weight:600;color:#0d1f2d">${loc.name}</div>`,
          });

          window.kakao.maps.event.addListener(marker, "click", () => {
            closeOpenInfoWindow();
            infoWindow.open(map, marker);
            openInfoWindow = infoWindow;
          });
        });

        // 멤버 출발지 마커
        memberLocations.forEach((loc) => {
          const position = new window.kakao.maps.LatLng(loc.lat, loc.lng);
          const color = loc.isMe ? "#0d1f2d" : "#4ecdc4";
          const marker = new window.kakao.maps.Marker({
            map,
            position,
            image: new window.kakao.maps.MarkerImage(
              markerImageUrl(color),
              new window.kakao.maps.Size(28, 28),
            ),
          });
          bounds.extend(position);

          const label = loc.isMe ? "내 위치" : loc.name;
          const infoWindow = new window.kakao.maps.InfoWindow({
            content: `<div style="padding:6px 10px;font-size:13px;font-weight:600;color:${color}">${label}</div>`,
          });

          window.kakao.maps.event.addListener(marker, "click", () => {
            closeOpenInfoWindow();
            infoWindow.open(map, marker);
            openInfoWindow = infoWindow;
          });
        });

        const allLocations = [...locations, ...memberLocations];
        if (allLocations.length > 1) map.setBounds(bounds);
      });
    }

    function waitForKakao() {
      if (cancelled) return;
      if (window.kakao) initMap();
      else setTimeout(waitForKakao, 100);
    }

    waitForKakao();
    return () => {
      cancelled = true;
    };
  }, [locations, memberLocations]);

  return (
    <div
      ref={containerRef}
      className="w-full h-64 rounded-xl overflow-hidden border border-[#e9ebee]"
    />
  );
}
