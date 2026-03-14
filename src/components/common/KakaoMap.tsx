import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useSystemConfig } from "@/hooks/useSystemConfig";

declare global {
  interface Window {
    kakao: any;
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

interface KakaoMapProps {
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
  const hex = color;
  const labelText = label ? `<text x="${s.w / 2}" y="${s.r + 4}" text-anchor="middle" font-size="${size === 'small' ? 8 : 10}" fill="white" font-weight="bold">${label}</text>` : "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">
      <path d="M${s.w / 2} ${s.h} C${s.w / 2} ${s.h} 0 ${s.h * 0.55} 0 ${s.r + 2} A${s.r + 2} ${s.r + 2} 0 0 1 ${s.w} ${s.r + 2} C${s.w} ${s.h * 0.55} ${s.w / 2} ${s.h} ${s.w / 2} ${s.h}Z" fill="${hex}" stroke="white" stroke-width="1.5"/>
      <circle cx="${s.w / 2}" cy="${s.r + 2}" r="${s.r - 2}" fill="rgba(255,255,255,0.25)"/>
      ${labelText}
    </svg>`
  )}`;
}

export function KakaoMap({
  center,
  zoom,
  markers = [],
  infoWindow,
  width = "100%",
  height = "400px",
  onClick,
  enableCluster = false,
  className,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlayRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const { data: config } = useSystemConfig();
  const [sdkLoaded, setSdkLoaded] = useState(!!window.kakao?.maps);

  const defaultCenter = {
    lat: parseFloat(config?.map_center_lat || "35.1796"),
    lng: parseFloat(config?.map_center_lng || "129.0756"),
  };
  const defaultZoom = parseInt(config?.map_default_zoom || "7", 10);

  // Load SDK
  useEffect(() => {
    if (window.kakao?.maps) { setSdkLoaded(true); return; }
    const appKey = config?.kakao_map_appkey || import.meta.env.VITE_KAKAO_MAP_KEY;
    if (!appKey) return;
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services,clusterer&autoload=false`;
    script.onload = () => {
      window.kakao.maps.load(() => setSdkLoaded(true));
    };
    document.head.appendChild(script);
  }, [config]);

  // Init map
  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || !window.kakao?.maps) return;
    const c = center || defaultCenter;
    const map = new window.kakao.maps.Map(containerRef.current, {
      center: new window.kakao.maps.LatLng(c.lat, c.lng),
      level: zoom ?? defaultZoom,
    });
    mapRef.current = map;

    if (onClick) {
      window.kakao.maps.event.addListener(map, "click", (e: any) => {
        onClick(e.latLng.getLat(), e.latLng.getLng());
      });
    }

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      if (overlayRef.current) overlayRef.current.setMap(null);
      if (clusterRef.current) clusterRef.current.clear();
    };
  }, [sdkLoaded]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !sdkLoaded) return;
    // Clear existing
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (clusterRef.current) clusterRef.current.clear();

    const kakaoMarkers = markers.map((m) => {
      const colorHex = MARKER_COLORS[m.color || "blue"];
      const imgSrc = createMarkerSVG(colorHex, m.label, m.size || "normal");
      const sizes = { small: [24, 30], normal: [32, 40], large: [40, 50] };
      const [w, h] = sizes[m.size || "normal"];
      const imageSize = new window.kakao.maps.Size(w, h);
      const imageOption = { offset: new window.kakao.maps.Point(w / 2, h) };
      const markerImage = new window.kakao.maps.MarkerImage(imgSrc, imageSize, imageOption);
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(m.lat, m.lng),
        image: markerImage,
        title: m.name,
      });

      if (m.onClick) {
        window.kakao.maps.event.addListener(marker, "click", () => m.onClick!(m.id));
      }

      if (!enableCluster) marker.setMap(mapRef.current);
      return marker;
    });

    markersRef.current = kakaoMarkers;

    if (enableCluster && kakaoMarkers.length > 0) {
      clusterRef.current = new window.kakao.maps.MarkerClusterer({
        map: mapRef.current,
        averageCenter: true,
        minLevel: 5,
        markers: kakaoMarkers,
        styles: [{
          width: "36px", height: "36px", background: "hsl(211,65%,45%)", borderRadius: "50%",
          color: "white", textAlign: "center", lineHeight: "36px", fontSize: "13px", fontWeight: "bold",
        }],
      });
    }
  }, [markers, sdkLoaded, enableCluster]);

  // InfoWindow
  useEffect(() => {
    if (!mapRef.current || !sdkLoaded) return;
    if (overlayRef.current) { overlayRef.current.setMap(null); overlayRef.current = null; }
    if (!infoWindow) return;

    const marker = markers.find((m) => m.id === infoWindow.id);
    if (!marker) return;

    const content = document.createElement("div");
    content.className = "kakao-infowindow";
    content.style.cssText = "background:white;border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:180px;font-size:12px;position:relative;transform:translateY(-8px);";

    // We render a simple version since we can't use React portals easily
    const overlay = new window.kakao.maps.CustomOverlay({
      content,
      position: new window.kakao.maps.LatLng(marker.lat, marker.lng),
      yAnchor: 1.2,
    });
    overlay.setMap(mapRef.current);
    overlayRef.current = overlay;

    // Set innerHTML for the info content
    if (typeof infoWindow.content === "string") {
      content.innerHTML = infoWindow.content as string;
    }
  }, [infoWindow, sdkLoaded]);

  // Pan to center when center changes
  useEffect(() => {
    if (!mapRef.current || !center || !sdkLoaded) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [center?.lat, center?.lng, sdkLoaded]);

  if (!config?.kakao_map_appkey && !import.meta.env.VITE_KAKAO_MAP_KEY) {
    return (
      <div className={`bg-muted rounded-md flex items-center justify-center ${className || ""}`} style={{ width, height }}>
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">지도 영역</p>
          <p className="text-xs mt-1">Kakao Maps API 키를 설정해주세요</p>
          <p className="text-[10px] font-mono mt-2 text-muted-foreground/60">시스템 설정 → kakao_map_appkey</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={`rounded-md ${className || ""}`} style={{ width, height }} />;
}

// Geocoder utility
export function useGeocode() {
  const geocode = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!window.kakao?.maps?.services) return null;
    return new Promise((resolve) => {
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.addressSearch(address, (result: any[], status: string) => {
        if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
          resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
        } else {
          resolve(null);
        }
      });
    });
  }, []);
  return { geocode };
}
