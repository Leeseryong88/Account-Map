"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { loadKakao } from "@/lib/kakao";
import { Button, Field, TextInput } from "./ui";

export function LocationPicker({
  appKey,
  lat,
  lng,
  onPick,
}: {
  appKey: string;
  lat: number | null;
  lng: number | null;
  onPick: (value: { lat: number; lng: number; address?: string; name?: string }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMap = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Array<{ label: string; address: string; lat: number; lng: number; name?: string }>>([]);
  const [status, setStatus] = useState(appKey ? "" : "지도 키가 없어 좌표를 직접 입력합니다.");

  useEffect(() => {
    if (!appKey || !mapRef.current) return;
    let cancelled = false;
    loadKakao(appKey).then(() => {
      if (cancelled || !mapRef.current || kakaoMap.current) return;
      const center = new window.kakao.maps.LatLng(lat ?? 37.5665, lng ?? 126.978);
      const map = new window.kakao.maps.Map(mapRef.current, { center, level: lat == null ? 8 : 4 });
      kakaoMap.current = map;
      window.kakao.maps.event.addListener(map, "click", (event: any) => {
        const nextLat = event.latLng.getLat();
        const nextLng = event.latLng.getLng();
        moveMarker(nextLat, nextLng, true);
      });
      if (lat != null && lng != null) moveMarker(lat, lng, false);
    }).catch(() => setStatus("지도를 불러오지 못했습니다. 위도와 경도를 직접 입력하면 등록할 수 있습니다."));
    return () => { cancelled = true; };
  }, [appKey, lat, lng]);

  function moveMarker(nextLat: number, nextLng: number, reverse: boolean) {
    const map = kakaoMap.current;
    if (!map) {
      onPick({ lat: nextLat, lng: nextLng });
      return;
    }
    const position = new window.kakao.maps.LatLng(nextLat, nextLng);
    if (!markerRef.current) {
      markerRef.current = new window.kakao.maps.Marker({ position, draggable: true });
      markerRef.current.setMap(map);
      window.kakao.maps.event.addListener(markerRef.current, "dragend", () => {
        const next = markerRef.current.getPosition();
        moveMarker(next.getLat(), next.getLng(), true);
      });
    } else markerRef.current.setPosition(position);
    map.panTo(position);
    if (!reverse) {
      onPick({ lat: nextLat, lng: nextLng });
      return;
    }
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.coord2Address(nextLng, nextLat, (result: any[], resultStatus: string) => {
      const address = resultStatus === window.kakao.maps.services.Status.OK ? result?.[0]?.address?.address_name : undefined;
      onPick({ lat: nextLat, lng: nextLng, address });
      if (!address) setStatus("주소 변환에 실패했습니다. 좌표만으로 등록할 수 있습니다.");
    });
  }

  function search() {
    if (!appKey || !window.kakao?.maps) {
      setStatus("장소 검색을 쓰려면 Kakao Maps 키가 필요합니다.");
      return;
    }
    const keyword = query.trim();
    if (!keyword) return;
    const found: Array<{ label: string; address: string; lat: number; lng: number; name?: string }> = [];
    const placesService = new window.kakao.maps.services.Places();
    const geocoder = new window.kakao.maps.services.Geocoder();
    placesService.keywordSearch(keyword, (data: any[], resultStatus: string) => {
      if (resultStatus === window.kakao.maps.services.Status.OK) {
        data.slice(0, 5).forEach((item) => found.push({
          label: item.place_name,
          address: item.road_address_name || item.address_name,
          lat: Number(item.y),
          lng: Number(item.x),
          name: item.place_name,
        }));
      }
      geocoder.addressSearch(keyword, (addresses: any[], addressStatus: string) => {
        if (addressStatus === window.kakao.maps.services.Status.OK) {
          addresses.slice(0, 5).forEach((item) => found.push({
            label: item.address_name,
            address: item.address_name,
            lat: Number(item.y),
            lng: Number(item.x),
          }));
        }
        setPlaces(found);
        if (found.length === 0) setStatus("검색 결과가 없습니다. 지도를 누르거나 좌표를 직접 입력하세요.");
      });
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">상호 또는 주소 검색</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
          <TextInput className="pl-10" value={query} placeholder="상호 또는 주소로 찾기" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); search(); } }} />
        </label>
        <Button type="button" variant="primary" onClick={search}>검색</Button>
      </div>
      {places.length > 0 ? (
        <ul className="max-h-56 divide-y divide-line overflow-auto rounded-xl border border-line bg-white shadow-panel">
          {places.map((place) => (
            <li key={`${place.lat}-${place.lng}-${place.label}`}>
              <button type="button" className="flex min-h-12 w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-primary-soft" onClick={() => { onPick(place); moveMarker(place.lat, place.lng, false); setPlaces([]); setStatus(""); }}>
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold">{place.label}</span>
                  <span className="block text-[13px] text-subtle">{place.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={mapRef} className={`h-60 overflow-hidden rounded-xl border border-line bg-[#e7ebf0] lg:h-72 ${appKey ? "" : "hidden"}`} />
      <p className="text-[13px] text-subtle">{status || "검색 결과를 고르거나 지도를 눌러 위치를 정합니다. 핀을 끌어 옮길 수도 있습니다."}</p>
      <details className="group" open={!appKey}>
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[13px] font-semibold text-subtle hover:text-ink">
          <ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" aria-hidden="true" />
          좌표 직접 입력
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field id="lat" label="위도">
            {(aria) => <TextInput {...aria} inputMode="decimal" placeholder="37.5665" value={lat ?? ""} onChange={(event) => onPick({ lat: Number(event.target.value), lng: lng ?? 0 })} />}
          </Field>
          <Field id="lng" label="경도">
            {(aria) => <TextInput {...aria} inputMode="decimal" placeholder="126.9780" value={lng ?? ""} onChange={(event) => onPick({ lat: lat ?? 0, lng: Number(event.target.value) })} />}
          </Field>
        </div>
      </details>
    </div>
  );
}
