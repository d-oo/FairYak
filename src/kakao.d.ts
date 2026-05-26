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
        }) => KakaoMarker;
        InfoWindow: new (options: {
          content: string;
          removable?: boolean;
        }) => KakaoInfoWindow;
        event: {
          addListener: (
            target: unknown,
            type: string,
            handler: () => void,
          ) => void;
        };
      };
    };
  }

  interface KakaoMapInstance {
    setBounds: (bounds: KakaoLatLngBounds) => void;
    setCenter: (latlng: KakaoLatLng) => void;
  }

  interface KakaoLatLng {}

  interface KakaoLatLngBounds {
    extend: (latlng: KakaoLatLng) => void;
  }

  interface KakaoMarker {}

  interface KakaoInfoWindow {
    open: (map: KakaoMapInstance, marker: KakaoMarker) => void;
    close: () => void;
  }
}

export {};
