import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { runtimeConfig } from "@/config/runtime-config";

declare global {
  interface Window {
    naver: any;
    __parkmasterNaverMapsReady?: () => void;
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
let naverSdkPromise: Promise<void> | null = null;
let naverSdkClientId: string | null = null;

const MARKER_COLORS: Record<string, string> = {
  blue: "hsl(211,65%,45%)",
  green: "hsl(152,55%,38%)",
  orange: "hsl(38,92%,50%)",
  red: "hsl(0,72%,51%)",
  gray: "hsl(220,10%,60%)",
};

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function getNaverSdkScript() {
  return document.querySelector<HTMLScriptElement>(NAVER_SCRIPT_SELECTOR);
}

function hasCompleteNaverMapsSdk(): boolean {
  const maps = window.naver?.maps;
  return Boolean(
    maps &&
    typeof maps.Map === "function" &&
    typeof maps.LatLng === "function" &&
    typeof maps.Marker === "function" &&
    typeof maps.Point === "function" &&
    maps.Event &&
    typeof maps.Event.addListener === "function" &&
    maps.Position,
  );
}

function loadNaverMapsSdk(clientId: string): Promise<void> {
  if (hasCompleteNaverMapsSdk()) return Promise.resolve();
  if (naverSdkPromise && naverSdkClientId === clientId) return naverSdkPromise;

  const staleScript = getNaverSdkScript();
  if (staleScript && (staleScript.dataset.clientId !== clientId || staleScript.dataset.loaded === "true")) {
    staleScript.remove();
  }

  naverSdkClientId = clientId;
  naverSdkPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let script = getNaverSdkScript();

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      delete window.__parkmasterNaverMapsReady;
    };

    const succeed = () => {
      if (settled || !hasCompleteNaverMapsSdk()) return;
      settled = true;
      if (script) script.dataset.loaded = "true";
      cleanup();
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      script?.remove();
      naverSdkPromise = null;
      reject(new Error(message));
    };

    const handleLoad = () => {
      if (hasCompleteNaverMapsSdk()) succeed();
    };

    const handleError = () => {
      fail("네이버 지도 SDK 요청에 실패했습니다.");
    };

    window.__parkmasterNaverMapsReady = succeed;
    const timeoutId = window.setTimeout(() => {
      fail("네이버 지도 인증 시간이 초과되었습니다.");
    }, 10000);

    if (!script) {
      script = document.createElement("script");
      const params = new URLSearchParams({
        ncpKeyId: clientId,
        submodules: "geocoder",
        callback: "__parkmasterNaverMapsReady",
      });
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.dataset.naverMapsSdk = "true";
      script.dataset.clientId = clientId;
      document.head.appendChild(script);
    }

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
  });

  return naverSdkPromise;
}

function createMarkerSVG(color: string, label?: string, size: "small" | "normal" | "large" = "normal"): string {
  const sizes = { small: { w: 24, h: 30, r: 8 }, normal: { w: 32, h: 40, r: 11 }, large: { w: 40, h: 50, r: 14 } };
  const s = sizes[size];
  const labelText = label
    ? `<text x="${s.w / 2}" y="${s.r + 4}" text-anchor="middle" font-size="${size === "small" ? 8 : 10}" fill="white" font-weight="bold">${escapeHtml(label)}</text>`
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
  const mapClickRef = useRef(onClick);
  mapClickRef.current = onClick;
  const { data: config } = useSystemConfig();
  const [sdkStatus, setSdkStatus] = useState<SdkStatus>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const sdkLoaded = sdkStatus === "ready";
  const clientId = config?.naver_map_client_id?.trim() || runtimeConfig.naverMapClientId;
  const isConfigLoading = !config;

  const defaultCenterLat = parseFloat(config?.map_center_lat || "35.1796");
  const defaultCenterLng = parseFloat(config?.map_center_lng || "129.0756");
  const defaultZoom = parseInt(config?.map_default_zoom || config?.map_zoom || "13", 10);
  const centerLat = center?.lat;
  const centerLng = center?.lng;

  // Load SDK
  useEffect(() => {
    if (!clientId) {
      setSdkStatus("idle");
      setLoadError(null);
      return;
    }

    let active = true;
    setSdkStatus("loading");
    setLoadError(null);

    void loadNaverMapsSdk(clientId)
      .then(() => {
        if (!active) return;
        setSdkStatus("ready");
        setLoadError(null);
      })
      .catch((error: Error) => {
        if (!active) return;
        setSdkStatus("error");
        setLoadError(`${error.message} NCP Maps의 Dynamic Map과 웹 서비스 URL을 확인해주세요.`);
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  // Init map
  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || !hasCompleteNaverMapsSdk()) return;

    try {
      const c = {
        lat: centerLat ?? defaultCenterLat,
        lng: centerLng ?? defaultCenterLng,
      };
      const map = new window.naver.maps.Map(containerRef.current, {
        center: new window.naver.maps.LatLng(c.lat, c.lng),
        zoom: zoom ?? defaultZoom,
        zoomControl: true,
        zoomControlOptions: {
          position: window.naver.maps.Position.TOP_RIGHT,
        },
      });

      mapRef.current = map;

      if (mapClickRef.current) {
        window.naver.maps.Event.addListener(map, "click", (e: any) => {
          mapClickRef.current?.(e.coord.lat(), e.coord.lng());
        });
      }

      return () => {
        try {
          if (infoWindowRef.current) { try { infoWindowRef.current.close(); } catch {} }
        } catch {}
        mapRef.current = null;
      };
    } catch {
      setSdkStatus("error");
      setLoadError("지도 초기화에 실패했습니다. 설정을 다시 확인해주세요.");
    }
  }, [centerLat, centerLng, defaultCenterLat, defaultCenterLng, defaultZoom, sdkLoaded, zoom]);

  // Markers
  useEffect(() => {
    if (!mapRef.current || !sdkLoaded || !hasCompleteNaverMapsSdk()) return;

    markersRef.current.forEach((m) => { try { m.setMap(null); } catch {} });
    markersRef.current = [];

    let naverMarkers: any[] = [];
    try {
      naverMarkers = markers.map((m) => {
        const colorHex = MARKER_COLORS[m.color || "blue"];
        const sizes = { small: [24, 30], normal: [32, 40], large: [40, 50] };
        const [w, h] = sizes[m.size || "normal"];

        const markerHtml = `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <img src="${createMarkerSVG(colorHex, m.label, m.size || "normal")}" width="${w}" height="${h}" />
            <div style="margin-top:2px;padding:1px 6px;background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.15);border-radius:4px;white-space:nowrap;font-size:11px;font-weight:600;color:#222;box-shadow:0 1px 3px rgba(0,0,0,0.12);max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.name)}</div>
          </div>
        `;

        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(m.lat, m.lng),
          map: mapRef.current,
          title: m.name,
          icon: {
            content: markerHtml,
            anchor: new window.naver.maps.Point(w / 2, h),
          },
        });

        if (m.onClick) {
          window.naver.maps.Event.addListener(marker, "click", () => m.onClick?.(m.id));
        }

        return marker;
      });
    } catch {
      naverMarkers.forEach((marker) => { try { marker.setMap(null); } catch {} });
      setSdkStatus("error");
      setLoadError("네이버 지도 객체를 만들지 못했습니다. Dynamic Map 사용 권한과 허용 URL을 확인해주세요.");
      return;
    }

    markersRef.current = naverMarkers;

    return () => {
      naverMarkers.forEach((marker) => {
        try { marker.setMap(null); } catch {}
      });
      if (markersRef.current === naverMarkers) markersRef.current = [];
    };
  }, [markers, sdkLoaded]);

  // InfoWindow
  useEffect(() => {
    if (!mapRef.current || !sdkLoaded || !hasCompleteNaverMapsSdk()) return;
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }
    if (!infoWindow) return;

    const marker = markers.find((m) => m.id === infoWindow.id);
    if (!marker) return;

    if (typeof window.naver.maps.InfoWindow !== "function") return;

    const iw = new window.naver.maps.InfoWindow({
      content: typeof infoWindow.content === "string"
        ? `<div style="background:white;border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:180px;font-size:12px;">${escapeHtml(infoWindow.content)}</div>`
        : `<div style="background:white;border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:180px;font-size:12px;">${escapeHtml(marker.name)}</div>`,
      borderWidth: 0,
      backgroundColor: "transparent",
      disableAnchor: true,
    });

    iw.open(mapRef.current, new window.naver.maps.LatLng(marker.lat, marker.lng));
    infoWindowRef.current = iw;
  }, [infoWindow, markers, sdkLoaded]);

  // Pan to center
  useEffect(() => {
    if (!mapRef.current || centerLat === undefined || centerLng === undefined || !sdkLoaded || !hasCompleteNaverMapsSdk()) return;
    try {
      mapRef.current.panTo(new window.naver.maps.LatLng(centerLat, centerLng));
    } catch {
      setSdkStatus("error");
      setLoadError("지도 위치를 갱신하지 못했습니다. 네이버 지도 설정을 확인해주세요.");
    }
  }, [centerLat, centerLng, sdkLoaded]);

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
