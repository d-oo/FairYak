"use client";

import { useEffect, useRef } from "react";

export interface MapLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  locations: MapLocation[];
}

export default function KakaoMap({ locations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;

    function initMap() {
      console.log(
        "[KakaoMap] initMap called, containerRef:",
        containerRef.current,
      );
      if (cancelled || !containerRef.current) {
        console.log(
          "[KakaoMap] initMap aborted - cancelled:",
          cancelled,
          "containerRef:",
          containerRef.current,
        );
        return;
      }

      console.log("[KakaoMap] calling kakao.maps.load...");
      window.kakao.maps.load(() => {
        console.log(
          "[KakaoMap] kakao.maps.load callback, cancelled:",
          cancelled,
          "containerRef:",
          containerRef.current,
        );
        if (cancelled || !containerRef.current) return;

        const center = new window.kakao.maps.LatLng(
          locations[0].lat,
          locations[0].lng,
        );
        const map = new window.kakao.maps.Map(containerRef.current, {
          center,
          level: 5,
        });
        console.log("[KakaoMap] Map created:", map);
        mapRef.current = map as unknown as KakaoMapInstance;

        const bounds = new window.kakao.maps.LatLngBounds();
        let openInfoWindow: KakaoInfoWindow | null = null;

        locations.forEach((loc) => {
          const position = new window.kakao.maps.LatLng(loc.lat, loc.lng);
          const marker = new window.kakao.maps.Marker({ map, position });
          bounds.extend(position);

          const infoWindow = new window.kakao.maps.InfoWindow({
            content: `<div style="padding:6px 10px;font-size:13px;font-weight:600;color:#0d1f2d">${loc.name}</div>`,
          });

          window.kakao.maps.event.addListener(marker, "click", () => {
            if (openInfoWindow) openInfoWindow.close();
            infoWindow.open(map, marker);
            openInfoWindow = infoWindow;
          });
        });

        if (locations.length > 1) map.setBounds(bounds);
        console.log("[KakaoMap] Map init complete ✅");
      });
    }

    function waitForKakao() {
      if (cancelled) {
        console.log("[KakaoMap] polling cancelled at count:", pollCount);
        return;
      }
      pollCount++;
      if (window.kakao) {
        console.log("[KakaoMap] kakao found after", pollCount, "polls");
        initMap();
      } else {
        if (pollCount <= 3)
          console.log("[KakaoMap] kakao not ready, poll #", pollCount);
        setTimeout(waitForKakao, 100);
      }
    }

    console.log("[KakaoMap] useEffect start");
    waitForKakao();
    return () => {
      console.log("[KakaoMap] cleanup, cancelled=true");
      cancelled = true;
    };
  }, [locations]);

  return (
    <div
      ref={containerRef}
      className="w-full h-64 rounded-xl overflow-hidden border border-[#e9ebee]"
    />
  );
}
