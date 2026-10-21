"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPinOff as MapOff, Minus, Plus } from "lucide-react";
import { centroid, clusterByGrid, clusterCellSize, pointsAreTight, summarizeBadges } from "@shared/cluster";
import { loadKakao, type MapPlace } from "@/lib/kakao";
import type { MapFocus } from "@/lib/mapUi";
import { IconButton } from "./ui";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  badgeKey: string;
  badgeLabel: string;
  alertKey: string | null;
  alertLabel: string | null;
  alertCount: number;
  alertColor: string | null;
  label: string;
}

function pill(label: string, color: string, count?: number) {
  const node = document.createElement("span");
  node.className = "map-marker-pill";
  node.style.background = color;
  node.append(document.createTextNode(label));
  if (count != null) {
    const num = document.createElement("span");
    num.className = "map-marker-count";
    num.textContent = String(count);
    node.append(num);
  }
  return node;
}

function markerStem() {
  const stem = document.createElement("span");
  stem.className = "map-marker-stem";
  stem.setAttribute("aria-hidden", "true");
  return stem;
}

export function KakaoMap({
  appKey,
  markers,
  selectedId,
  initialView,
  fitToken,
  onSelect,
  onView,
  onUserMove,
  onReady,
  padding = { top: 72, right: 24, bottom: 24, left: 24 },
  controlsRight = 12,
  onCluster,
  onError,
  place = null,
  focus = null,
}: {
  controlsRight?: number;
  appKey: string;
  markers: MapMarker[];
  place?: MapPlace | null;
  focus?: MapFocus | null;
  selectedId: string | null;
  initialView: { lat: number; lng: number; level: number };
  fitToken: number;
  onSelect: (id: string) => void;
  onView: (view: { lat: number; lng: number; level: number; bounds: { swLat: number; swLng: number; neLat: number; neLng: number } | null }) => void;
  onUserMove: () => void;
  onReady: () => void;
  onCluster: (ids: string[]) => void;
  onError: (message: string) => void;
  padding?: { top: number; right: number; bottom: number; left: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const onSelectRef = useRef(onSelect);
  const onViewRef = useRef(onView);
  const onUserMoveRef = useRef(onUserMove);
  const onClusterRef = useRef(onCluster);
  const onReadyRef = useRef(onReady);
  const markersRef = useRef(markers);
  const paddingRef = useRef(padding);
  paddingRef.current = padding;
  const lastFit = useRef(0);
  const lastFocus = useRef(0);
  markersRef.current = markers;
  const [mapReady, setMapReady] = useState(false);
  const [level, setLevel] = useState(initialView.level);
  const [failed, setFailed] = useState("");
  onSelectRef.current = onSelect;
  onViewRef.current = onView;
  onUserMoveRef.current = onUserMove;
  onClusterRef.current = onCluster;
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    if (!appKey) {
      setFailed("카카오 지도 키가 없어 지도를 표시하지 못했습니다. 목록에서 거래처를 계속 관리할 수 있습니다.");
      return;
    }
    loadKakao(appKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(initialView.lat, initialView.lng),
        level: initialView.level,
      });
      mapRef.current = map;
      window.kakao.maps.event.addListener(map, "dragstart", () => onUserMoveRef.current());
      window.kakao.maps.event.addListener(map, "idle", () => {
        const center = map.getCenter();
        const lat = center.getLat();
        const lng = center.getLng();
        const level = map.getLevel();
        if (!(lat >= -85 && lat <= 85 && lng >= -180 && lng <= 180 && level >= 1 && level <= 14)) {
          map.setCenter(new window.kakao.maps.LatLng(37.5665, 126.978));
          map.setLevel(8);
          return;
        }
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        setLevel(level);
        onViewRef.current({
          lat,
          lng,
          level,
          bounds: { swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() },
        });
      });
      containerRef.current.addEventListener("wheel", () => onUserMoveRef.current(), { passive: true });
      const observer = new ResizeObserver(() => map.relayout());
      observer.observe(containerRef.current);
      setMapReady(true);
      onReadyRef.current();
    }).catch(() => setFailed("지도를 불러오지 못했습니다. 목록에서 거래처를 계속 관리할 수 있습니다."));
    return () => { cancelled = true; };
  }, [appKey, initialView.lat, initialView.lng, initialView.level]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    const projection = map.getProjection();
    const projected = markers.map((marker) => {
      const point = projection?.containerPointFromCoords?.(new window.kakao.maps.LatLng(marker.lat, marker.lng));
      return { ...marker, x: point?.x ?? marker.lng * 1000, y: point?.y ?? marker.lat * 1000 };
    });
    const groups = clusterByGrid(projected, projection ? clusterCellSize(level) : 0);
    for (const group of groups) {
      if (group.length === 1) {
        const marker = group[0];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "map-marker";
        button.dataset.selected = marker.id === selectedId ? "true" : "false";
        button.setAttribute("aria-label", marker.label);
        const badges = document.createElement("span");
        badges.className = "map-marker-badges";
        badges.append(pill(marker.badgeLabel, marker.color));
        if (marker.alertLabel && marker.alertColor) badges.append(pill(marker.alertLabel, marker.alertColor, marker.alertCount));
        button.append(badges, markerStem());
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current(marker.id);
        });
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(marker.lat, marker.lng),
          content: button,
          yAnchor: 1,
          xAnchor: 0.5,
          zIndex: marker.id === selectedId ? 5 : 1,
          clickable: true,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      } else {
        const center = centroid(group);
        const rows = summarizeBadges([
          ...group.map((marker) => ({ key: marker.badgeKey, label: marker.badgeLabel, color: marker.color })),
          ...group.flatMap((marker) => marker.alertKey && marker.alertLabel && marker.alertColor
            ? [{ key: marker.alertKey, label: marker.alertLabel, color: marker.alertColor, count: marker.alertCount }]
            : []),
        ]);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "map-cluster-card";
        button.setAttribute("aria-label", `${rows.map((row) => `${row.label} ${row.count}`).join(", ")}. 누르면 이 구간이 확대됩니다`);
        const badges = document.createElement("span");
        badges.className = "map-marker-badges";
        rows.forEach((row) => badges.append(pill(row.label, row.color, row.count)));
        button.append(badges, markerStem());
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onUserMoveRef.current();
          const before = map.getLevel();
          if (pointsAreTight(group) && before <= 2) {
            onClusterRef.current(group.map((item) => item.id));
            return;
          }
          const bounds = new window.kakao.maps.LatLngBounds();
          group.forEach((item) => bounds.extend(new window.kakao.maps.LatLng(item.lat, item.lng)));
          map.setBounds(bounds, 80);
          if (map.getLevel() >= before) {
            map.setLevel(Math.max(1, before - 2));
            map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
          }
        });
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(center.lat, center.lng),
          content: button,
          yAnchor: 1,
          xAnchor: 0.5,
          zIndex: 3,
          clickable: true,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      }
    }
    if (place) {
      const pin = document.createElement("div");
      pin.className = "map-search-pin";
      const label = document.createElement("span");
      label.className = "map-search-label";
      label.textContent = place.name;
      const dot = document.createElement("span");
      dot.className = "map-search-dot";
      dot.setAttribute("aria-hidden", "true");
      pin.append(label, dot);
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(place.lat, place.lng),
        content: pin,
        yAnchor: 1,
        xAnchor: 0.5,
        zIndex: 6,
        clickable: false,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }
  }, [markers, selectedId, level, mapReady, place]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focus || focus.token === lastFocus.current) return;
    lastFocus.current = focus.token;
    onUserMoveRef.current();
    map.setLevel(focus.level);
    map.panTo(new window.kakao.maps.LatLng(focus.lat, focus.lng));
  }, [focus, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || fitToken === lastFit.current) return;
    lastFit.current = fitToken;
    const current = markersRef.current;
    if (current.length === 0 || fitToken === 0) return;
    if (current.length === 1) {
      map.setLevel(5);
      map.setCenter(new window.kakao.maps.LatLng(current[0].lat, current[0].lng));
      return;
    }
    const bounds = new window.kakao.maps.LatLngBounds();
    current.forEach((marker) => bounds.extend(new window.kakao.maps.LatLng(marker.lat, marker.lng)));
    map.setBounds(bounds, 48);
  }, [fitToken, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markersRef.current.find((item) => item.id === selectedId);
    if (!map || !marker || !containerRef.current) return;
    try {
      const projection = map.getProjection();
      const latlng = new window.kakao.maps.LatLng(marker.lat, marker.lng);
      const point = projection.containerPointFromCoords(latlng);
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const pad = paddingRef.current;
      if (![point?.x, point?.y, width, height].every((value) => Number.isFinite(value) && Math.abs(value) < 100000)) {
        map.panTo(latlng);
        return;
      }
      let dx = 0;
      let dy = 0;
      if (point.x < pad.left) dx = point.x - pad.left;
      if (point.x > width - pad.right) dx = point.x - (width - pad.right);
      if (point.y < pad.top) dy = point.y - pad.top;
      if (point.y > height - pad.bottom) dy = point.y - (height - pad.bottom);
      if (!dx && !dy) return;
      const center = projection.containerPointFromCoords(map.getCenter());
      if (![center?.x, center?.y].every((value) => Number.isFinite(value) && Math.abs(value) < 100000)) {
        map.panTo(latlng);
        return;
      }
      map.panTo(projection.coordsFromContainerPoint(new window.kakao.maps.Point(center.x + dx, center.y + dy)));
    } catch {
      map.panTo(new window.kakao.maps.LatLng(marker.lat, marker.lng));
    }
  }, [selectedId, mapReady]);

  function zoom(direction: number) {
    const map = mapRef.current;
    if (!map) return;
    onUserMove();
    map.setLevel(map.getLevel() + direction);
  }

  function locate() {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) {
      onError("이 브라우저에서 위치를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onUserMove();
        map.setLevel(4);
        map.panTo(new window.kakao.maps.LatLng(position.coords.latitude, position.coords.longitude));
      },
      () => onError("위치 권한이 없거나 현재 위치를 가져오지 못했습니다. 다른 기능은 계속 사용할 수 있습니다."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  }

  return (
    <div className="relative h-full min-h-0 bg-[#e7ebf0]">
      <div ref={containerRef} className="h-full" />
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,#eef2f8,#e2e7ef)] p-6">
          <div className="grid max-w-sm justify-items-center gap-2 rounded-2xl bg-white p-5 text-center shadow-float">
            <MapOff className="size-7 text-subtle" aria-hidden="true" />
            <p className="text-sm text-muted">{failed}</p>
          </div>
        </div>
      ) : null}
      <div className="absolute top-3 z-10 grid gap-2 transition-[right]" style={{ right: controlsRight }}>
        <div className="grid overflow-hidden rounded-xl border border-line-strong bg-white shadow-float">
          <IconButton label="확대" variant="ghost" className="rounded-none" onClick={() => zoom(-1)}><Plus aria-hidden="true" /></IconButton>
          <span className="h-px bg-line" aria-hidden="true" />
          <IconButton label="축소" variant="ghost" className="rounded-none" onClick={() => zoom(1)}><Minus aria-hidden="true" /></IconButton>
        </div>
        <IconButton label="내 위치" className="shadow-float" onClick={locate}><LocateFixed aria-hidden="true" /></IconButton>
      </div>
    </div>
  );
}
