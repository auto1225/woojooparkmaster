import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useSystemConfig } from "@/hooks/useSystemConfig";

declare global {
  interface Window {
    naver: any;
  }
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  color?: "blue" | "green" | "orange" | "red" | "gray";
  label?: string;
  size?: "small" | "normal" | "large";
  onClick?: (id: string) => void;
}

interface NaverMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  infoWindow?: { id: string; content: ReactNode };
  width?: string;
  height?: string;
  onClick?: (lat: number, lng: number) => void;
  enableCluster?: boolean;
  className?: string;
}

type SdkStatus = "idle" | "loading" | "ready" | "error";

const NAVER_SCRIPT_SELECTOR = 'script[data-naver-maps-sdk="true"]';

const MARKER_COLORS: Record<string, string> = {
  blue: "hsl(211,65%,45%)",
  green: "hsl(152,55%,38%)",
  orange: "hsl(38,92%,50%)",
  red: "hsl(0,72%,51%)",
  gray: "hsl(220,10%,60%)",
};

function createMarkerSVG(color: string, label?: string, size: "small" | "normal" | "large" = "normal"): string {
  const sizes = { small: { w: 24, h: 30, r: 8 }, normal: { w: 32, h: 40, r: 11 }, large: { w: 40, h: 50, r: 14 } };
  const s = sizes[size];
  const labelText = label
    ? `<text x="${s.w / 2}" y="${s.r + 4}" text-anchor="middle" font-size="${size === "small" ? 8 : 10}" fill="white" font-weight="bold">${label}</text>`
    : "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">
      <path d="M${s.w / 2} ${s.h} C${s.w / 2} ${s.h} 0 ${s.h * 0.55} 0 ${s.r + 2} A${s.r + 2} ${s.r + 2} 0 0 1 ${s.w} ${s.r + 2} C${s.w} ${s.h * 0.55} ${s.w / 2} ${s.h} ${s.w / 2} ${s.h}Z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="${s.w / 2}" cy="${s.r + 2}" r="${s.r - 2}" fill="rgba(255,255,255,0.25)"/>
      ${labelText}
    </svg>`
  )}`;
}

export function NaverMap({
  center,
  zoom,
  markers = [],
  infoWindow,
  width = "100%",
  height = "400px",
  onClick,
  enableCluster = false,
  className,
}: NaverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const { data: config } = useSystemConfig();
  const [sdkStatus, setSdkStatus] = useState<SdkStatus>(window.naver?.maps ? "ready" : "idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const sdkLoaded = sdkStatus === "ready";
  const clientId = config?.naver_map_client_id?.trim() || import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim();
  const isConfigLoading = !config;

  const defaultCenter = {
    lat: parseFloat(config?.map_center_lat || "35.1796"),
    lng: parseFloat(config?.map_center_lng || "129.0756"),
  };
  const defaultZoom = parseInt(config?.map_default_zoom || "13", 10);

  // Load SDK
  useEffect(() => {
    if (window.naver?.maps) {
      setSdkStatus("ready");
      setLoadError(null);
      return;
    }
    if (!clientId) return;

    setSdkStatus("loading");
    setLoadError(null);

    const handleError = () => {
      setSdkStatus("error");
      setLoadError("지도를 불러오지 못했습니다. Client ID와 허용 도메인 설정을 확인해주세요.");
    };

    const handleLoad = () => {
      if (!window.naver?.maps) {
        handleError();
        return;
      }
      setSdkStatus("ready");
      setLoadError(null);
    };

    const timeoutId = window.setTimeout(() => {
      if (!window.naver?.maps) handleError();
    }, 10000);

    const existingScript = document.querySelector<HTMLScriptElement>(NAVER_SCRIPT_SELECTOR);
    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        handleLoad();
      } else {
        existingScript.addEventListener("load", handleLoad);
        existingScript.addEventListener("error", handleError);
      }
      return () => {
        window.clearTimeout(timeoutId);
        existingScript.removeEventListener("load", handleLoad);
        existingScript.removeEventListener("error", handleError);
      };
    }

    const script = document.createElement("script");
    const handleScriptLoad = () => {
      script.dataset.loaded = "true";
      handleLoad();
    };

    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.defer = true;
    script.dataset.naverMapsSdk = "true";
    script.addEventListener("load", handleScriptLoad);
    script.addEventListener("error", handleError);
    document.head.appendChild(script);

    return () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleScriptLoad);
      script.removeEventListener("error", handleError);
    };
  }, [clientId]);

  // Init map
  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || !window.naver?.maps) return;

    try {
      const c = center || defaultCenter;
      const map = new window.naver.maps.Map(containerRef.current, {
        center: new window.naver.maps.LatLng(c.lat, c.lng),
        zoom: zoom ?? defaultZoom,
        zoomControl: true,
        zoomControlOptions: {
          position: window.naver.maps.Position.TOP_RIGHT,
        },
      });

      mapRef.current = map;

      if (onClick) {
        window.naver.maps.Event.addListener(map, "click", (e: any) => {
          onClick(e.coord.lat(), e.coord.lng());
        });
      }

      return () => {
        try {
          markersRef.current.forEach((m) => { try { m.setMap(null); } catch {} });
          markersRef.current = [];
          if (infoWindowRef.current) { try { infoWindowRef.current.close(); } catch {} }
          if (clusterRef.current) { try { clusterRef.current.setMap(null); } catch {} }
        } catch {}
        mapRef.current = null;
      };
    } catch {
      setSdkStatus("error");
      setLoadError("지도 초기화에 실패했습니다. 설정을 다시 확인해주세요.");
    }
  }, [sdkLoaded]);

  // Markers
  useEffect(() => {
    if (!mapRef.current || !sdkLoaded) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const naverMarkers = markers.map((m) => {
      const colorHex = MARKER_COLORS[m.color || "blue"];
      const imgSrc = createMarkerSVG(colorHex, m.label, m.size || "normal");
      const sizes = { small: [24, 30], normal: [32, 40], large: [40, 50] };
      const [w, h] = sizes[m.size || "normal"];

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(m.lat, m.lng),
        map: mapRef.current,
        title: m.name,
        icon: {
          url: imgSrc,
          size: new window.naver.maps.Size(w, h),
          anchor: new window.naver.maps.Point(w / 2, h),
        },
      });

      if (m.onClick) {
        window.naver.maps.Event.addListener(marker, "click", () => m.onClick?.(m.id));
      }

      return marker;
    });

    markersRef.current = naverMarkers;
  }, [markers, sdkLoaded]);

  // InfoWindow
  useEffect(() => {
    if (!mapRef.current || !sdkLoaded) return;
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }
    if (!infoWindow) return;

    const marker = markers.find((m) => m.id === infoWindow.id);
    if (!marker) return;

    const iw = new window.naver.maps.InfoWindow({
      content: typeof infoWindow.content === "string"
        ? `<div style="background:white;border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:180px;font-size:12px;">${infoWindow.content}</div>`
        : `<div style="background:white;border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:180px;font-size:12px;">${marker.name}</div>`,
      borderWidth: 0,
      backgroundColor: "transparent",
      disableAnchor: true,
    });

    iw.open(mapRef.current, new window.naver.maps.LatLng(marker.lat, marker.lng));
    infoWindowRef.current = iw;
  }, [infoWindow, markers, sdkLoaded]);

  // Pan to center
  useEffect(() => {
    if (!mapRef.current || !center || !sdkLoaded) return;
    mapRef.current.panTo(new window.naver.maps.LatLng(center.lat, center.lng));
  }, [center?.lat, center?.lng, sdkLoaded]);

  if (!clientId) {
    return (
      <div className={`bg-muted rounded-md flex items-center justify-center ${className || ""}`} style={{ width, height }}>
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">지도 영역</p>
          <p className="text-xs mt-1">{isConfigLoading ? "지도 설정을 불러오는 중입니다" : "네이버 지도 API 키를 설정해주세요"}</p>
          {!isConfigLoading && (
            <p className="text-[10px] font-mono mt-2 text-muted-foreground/60">시스템 설정 → naver_map_client_id</p>
          )}
        </div>
      </div>
    );
  }

  if (sdkStatus === "error") {
    return (
      <div className={`bg-muted rounded-md flex items-center justify-center ${className || ""}`} style={{ width, height }}>
        <div className="text-center text-muted-foreground px-4">
          <p className="text-sm font-medium">지도를 불러오지 못했습니다</p>
          <p className="text-xs mt-1">{loadError}</p>
          <p className="text-[10px] font-mono mt-2 text-muted-foreground/60">현재 도메인: {window.location.origin}</p>
        </div>
      </div>
    );
  }

  if (!sdkLoaded) {
    return (
      <div className={`bg-muted rounded-md flex items-center justify-center ${className || ""}`} style={{ width, height }}>
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">지도를 불러오는 중입니다</p>
          <p className="text-xs mt-1">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={`rounded-md ${className || ""}`} style={{ width, height }} />;
}

export function useGeocode() {
  const geocode = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!window.naver?.maps?.Service) return null;
    return new Promise((resolve) => {
      window.naver.maps.Service.geocode({ query: address }, (status: number, response: any) => {
        if (status === 200 && response?.v2?.addresses?.length > 0) {
          const item = response.v2.addresses[0];
          resolve({ lat: parseFloat(item.y), lng: parseFloat(item.x) });
        } else {
          resolve(null);
        }
      });
    });
  }, []);

  return { geocode };
}
