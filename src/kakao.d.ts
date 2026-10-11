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
          },
        ) => KakaoMapInstance;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        LatLngBounds: new () => KakaoLatLngBounds;
        Marker: new (options: {
          map?: KakaoMapInstance;
          position: KakaoLatLng;
          image?: KakaoMarkerImage;
          title?: string;
          zIndex?: number;
        }) => KakaoMarker;
        MarkerImage: new (src: string, size: KakaoSize) => KakaoMarkerImage;
        Size: new (width: number, height: number) => KakaoSize;
        InfoWindow: new (options: {
          content: string;
          removable?: boolean;
        }) => KakaoInfoWindow;
        event: {
          addListener: (
            target: unknown,
            type: string,
            handler: (mouseEvent: KakaoMouseEvent) => void,
          ) => void;
        };
      };
    };
  }

  interface KakaoMapInstance {
    setBounds: (bounds: KakaoLatLngBounds) => void;
    setCenter: (latlng: KakaoLatLng) => void;
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

  interface KakaoMarkerImage {}

  interface KakaoSize {}

  interface KakaoInfoWindow {
    open: (map: KakaoMapInstance, marker: KakaoMarker) => void;
    close: () => void;
  }
}

export {};
