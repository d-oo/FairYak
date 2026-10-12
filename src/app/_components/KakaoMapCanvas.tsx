"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { LatLng } from "@/utils/geo";

// 지도 위 그림(핀·라벨·점선)의 화면 좌표. 오버레이 기준점(anchor)에서의 픽셀 차이다.
export type Project = (p: LatLng) => { x: number; y: number };

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  // 지도를 맞출 때 화면 안에 들어와야 하는 좌표들
  fitPoints: LatLng[];
  // 맞출 때 지도 가장자리에서 띄울 여백. 라벨·오버레이 패널 자리를 비워 둔다
  getPadding: (width: number, height: number) => MapPadding;
  // false면 끌기·확대를 막은 배경용 지도
  interactive?: boolean;
  className?: string;
  // 핀·점선 등은 카카오 마커 대신 하나의 CustomOverlay 안에 React로 그린다
  // (시안의 점선 1.5px·dash 5 4, 라벨 모양을 그대로 재현하기 위해)
  children: (project: Project) => ReactNode;
}

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 }; // 서울시청
const DEFAULT_LEVEL = 8;
// 이보다 더 확대하지 않는다 (출발지가 한 곳이거나 서로 가까울 때)
const MIN_LEVEL = 7;

// 기준점을 지도 중심으로 다시 맞추는 지도 이벤트
const ANCHOR_EVENTS = ["center_changed", "zoom_changed", "idle"];

function toLatLng(p: LatLng) {
  return new window.kakao.maps.LatLng(p.lat, p.lng);
}

export default function KakaoMapCanvas({
  fitPoints,
  getPadding,
  interactive = true,
  className = "",
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<KakaoCustomOverlay | null>(null);
  const [map, setMap] = useState<KakaoMapInstance | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  // 오버레이 기준점. 지도 중심을 따라다니게 한다 — 카카오는 기준점이 화면 밖으로 나간
  // CustomOverlay를 숨기므로, 한 점에 고정하면 확대했을 때 핀이 통째로 사라진다.
  // 지도가 움직이거나 확대 수준이 바뀔 때마다 갱신되어 화면 좌표도 다시 계산된다.
  const [anchor, setAnchor] = useState<LatLng>(DEFAULT_CENTER);
  const fitKey = fitPoints.map((p) => `${p.lat},${p.lng}`).join("|");

  // 최신 값을 이벤트 핸들러에서 쓰기 위한 ref
  const fitRef = useRef({ fitPoints, getPadding });
  useEffect(() => {
    fitRef.current = { fitPoints, getPadding };
  });

  useEffect(() => {
    let cancelled = false;
    let createdMap: KakaoMapInstance | null = null;
    const container = containerRef.current;
    let frame = 0;
    function syncAnchor() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cancelled || !createdMap) return;
        const center = createdMap.getCenter();
        setAnchor({ lat: center.getLat(), lng: center.getLng() });
      });
    }

    function init() {
      window.kakao.maps.load(() => {
        if (cancelled || !container) return;

        createdMap = new window.kakao.maps.Map(container, {
          center: toLatLng(DEFAULT_CENTER),
          level: DEFAULT_LEVEL,
          draggable: interactive,
          scrollwheel: interactive,
          disableDoubleClickZoom: !interactive,
          keyboardShortcuts: interactive,
        });

        const el = document.createElement("div");
        el.style.position = "relative";
        overlayRef.current = new window.kakao.maps.CustomOverlay({
          map: createdMap,
          position: toLatLng(DEFAULT_CENTER),
          content: el,
          xAnchor: 0,
          yAnchor: 0,
          clickable: true,
        });

        ANCHOR_EVENTS.forEach((type) =>
          window.kakao.maps.event.addListener(createdMap, type, syncAnchor),
        );
        syncAnchor();
        setLayer(el);
        setMap(createdMap);
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
      cancelAnimationFrame(frame);
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      const mapToClean = createdMap;
      if (mapToClean) {
        ANCHOR_EVENTS.forEach((type) =>
          window.kakao.maps.event.removeListener(mapToClean, type, syncAnchor),
        );
      }
      if (container) container.innerHTML = "";
    };
  }, [interactive]);

  // 좌표가 바뀌거나 화면 크기가 바뀌면 모든 점이 보이도록 다시 맞춘다
  useEffect(() => {
    if (!map) return;

    function fit() {
      const container = containerRef.current;
      if (!map || !container) return;
      const { fitPoints: points, getPadding: padding } = fitRef.current;
      map.relayout();

      if (points.length === 0) {
        map.setLevel(DEFAULT_LEVEL);
        map.setCenter(toLatLng(DEFAULT_CENTER));
      } else if (points.length === 1) {
        map.setLevel(MIN_LEVEL);
        map.setCenter(toLatLng(points[0]));
      } else {
        const bounds = new window.kakao.maps.LatLngBounds();
        points.forEach((p) => bounds.extend(toLatLng(p)));
        const pad = padding(container.clientWidth, container.clientHeight);
        map.setBounds(bounds, pad.top, pad.right, pad.bottom, pad.left);
        if (map.getLevel() < MIN_LEVEL) map.setLevel(MIN_LEVEL);
      }
    }

    fit();
    let frame = 0;
    function handleResize() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [map, fitKey]);

  // 새 기준점으로 다시 그린 뒤 화면에 칠해지기 전에 오버레이를 옮겨야 핀이 튀지 않는다
  useLayoutEffect(() => {
    if (!map) return;
    overlayRef.current?.setPosition(toLatLng(anchor));
  }, [map, anchor]);

  const project: Project = (p) => {
    if (!map) return { x: 0, y: 0 };
    const projection = map.getProjection();
    const a = projection.containerPointFromCoords(toLatLng(anchor));
    const b = projection.containerPointFromCoords(toLatLng(p));
    return { x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) };
  };

  return (
    <>
      <div
        ref={containerRef}
        // 지도 타일만 회색조로 (오버레이에는 img가 없어서 주홍 핀은 그대로 남는다)
        className={`bg-map-bg [&_img]:filter-[grayscale(1)_sepia(0.22)_contrast(0.9)_brightness(1.03)] ${className}`}
      />
      {map && layer && createPortal(children(project), layer)}
    </>
  );
}
