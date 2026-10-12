declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (
          container: HTMLElement,
          options: {
            center: KakaoLatLng;
            level?: number;
            draggable?: boolean;
            scrollwheel?: boolean;
            disableDoubleClickZoom?: boolean;
            keyboardShortcuts?: boolean;
          },
        ) => KakaoMapInstance;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        LatLngBounds: new () => KakaoLatLngBounds;
        // 개발용 추천 테스트 페이지(dashboard/dev/recommend)가 쓴다
        Marker: new (options: {
          map?: KakaoMapInstance;
          position: KakaoLatLng;
          image?: KakaoMarkerImage;
          title?: string;
          zIndex?: number;
        }) => KakaoMarker;
        MarkerImage: new (src: string, size: KakaoSize) => KakaoMarkerImage;
        Size: new (width: number, height: number) => KakaoSize;
        CustomOverlay: new (options: {
          map?: KakaoMapInstance;
          position: KakaoLatLng;
          content: HTMLElement | string;
          xAnchor?: number;
          yAnchor?: number;
          zIndex?: number;
          clickable?: boolean;
        }) => KakaoCustomOverlay;
        event: {
          addListener: (
            target: unknown,
            type: string,
            handler: (mouseEvent: KakaoMouseEvent) => void,
          ) => void;
          removeListener: (
            target: unknown,
            type: string,
            handler: (mouseEvent: KakaoMouseEvent) => void,
          ) => void;
        };
      };
    };
  }

  interface KakaoMapInstance {
    // padding은 지도 영역 가장자리에서 띄울 화면 픽셀 (위, 오른쪽, 아래, 왼쪽)
    setBounds: (
      bounds: KakaoLatLngBounds,
      paddingTop?: number,
      paddingRight?: number,
      paddingBottom?: number,
      paddingLeft?: number,
    ) => void;
    setCenter: (latlng: KakaoLatLng) => void;
    getCenter: () => KakaoLatLng;
    getLevel: () => number;
    setLevel: (level: number) => void;
    relayout: () => void;
    getProjection: () => KakaoMapProjection;
  }

  interface KakaoMapProjection {
    // 지도 영역 왼쪽 위 기준 화면 좌표
    containerPointFromCoords: (latlng: KakaoLatLng) => KakaoPoint;
  }

  interface KakaoPoint {
    x: number;
    y: number;
  }

  interface KakaoLatLng {
    getLat: () => number;
    getLng: () => number;
  }

  interface KakaoLatLngBounds {
    extend: (latlng: KakaoLatLng) => void;
  }

  // 지도 click 등 마우스 이벤트 핸들러가 받는 인자
  interface KakaoMouseEvent {
    latLng: KakaoLatLng;
  }

  interface KakaoMarker {
    setMap: (map: KakaoMapInstance | null) => void;
  }

  // 내용을 쓰지 않는 카카오 객체. 서로 섞이지 않도록 이름표 필드만 둔다
  interface KakaoMarkerImage {
    readonly __kakaoMarkerImage: never;
  }

  interface KakaoSize {
    readonly __kakaoSize: never;
  }

  interface KakaoCustomOverlay {
    setMap: (map: KakaoMapInstance | null) => void;
    setPosition: (position: KakaoLatLng) => void;
  }
}

export {};
