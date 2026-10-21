"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import { kakaoAppKey } from "@/lib/firebase";
import { useDebounced } from "@/lib/hooks";
import { accountDraftHref, loadKakao, searchMapPlaces, type MapPlace } from "@/lib/kakao";
import { useMapUi, type MapSearchMode } from "@/lib/mapUi";
import { confirmLeave } from "@/lib/unsaved";

export function MapSearch() {
  const mapUi = useMapUi();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const mode = mapUi.searchMode;
  const accountQuery = mapUi.filters.query;
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(placeQuery, 300);
  const query = mode === "accounts" ? accountQuery : placeQuery;
  const showResults = mode === "places" && open && (places.length > 0 || status.length > 0);

  useEffect(() => {
    if (mode !== "places") return;
    const keyword = debounced.trim();
    const appKey = kakaoAppKey();
    if (!keyword) {
      setPlaces([]);
      setStatus("");
      return;
    }
    if (!appKey) {
      setPlaces([]);
      setStatus("카카오 지도 키가 없어 장소 검색을 할 수 없습니다.");
      setOpen(true);
      return;
    }
    let cancelled = false;
    setStatus("검색 중");
    setOpen(true);
    loadKakao(appKey)
      .then(() => searchMapPlaces(keyword))
      .then((found) => {
        if (cancelled) return;
        setPlaces(found);
        setStatus(found.length ? "" : "검색 결과가 없습니다.");
      })
      .catch(() => {
        if (cancelled) return;
        setPlaces([]);
        setStatus("지도 검색을 사용할 수 없습니다.");
      });
    return () => { cancelled = true; };
  }, [debounced, mode]);

  useEffect(() => {
    if (!showResults) return;
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showResults]);

  function setMode(next: MapSearchMode) {
    mapUi.setSearchMode(next);
    setOpen(next === "places" && placeQuery.trim().length > 0);
  }

  function clear() {
    if (mode === "accounts") mapUi.setFilters({ ...mapUi.filters, query: "" });
    else {
      setPlaceQuery("");
      setPlaces([]);
      setStatus("");
      setOpen(false);
    }
  }

  function choose(place: MapPlace) {
    mapUi.pickPlace(place);
    setOpen(false);
  }

  function register(place: MapPlace) {
    if (!confirmLeave()) return;
    setOpen(false);
    router.push(accountDraftHref(place));
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 lg:max-w-xl">
      <div className="flex h-10 items-center gap-1 rounded-full bg-[#f1f3f7] pl-1 pr-1">
        <select
          className="h-8 shrink-0 rounded-full border-0 bg-white px-2.5 text-base font-bold text-ink"
          aria-label="검색 대상"
          value={mode}
          onChange={(event) => setMode(event.target.value as MapSearchMode)}
        >
          <option value="accounts">내 거래처</option>
          <option value="places">지도 검색</option>
        </select>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{mode === "accounts" ? "거래처명, 주소, 담당자 검색" : "장소 또는 주소 검색"}</span>
          <Search className="pointer-events-none absolute left-1.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            className="h-9 w-full bg-transparent pl-8 pr-8 text-base outline-none placeholder:text-[#9aa3b0]"
            value={query}
            placeholder={mode === "accounts" ? "이름, 주소, 담당자" : "장소, 주소 검색"}
            role={mode === "places" ? "combobox" : undefined}
            aria-expanded={mode === "places" ? showResults : undefined}
            aria-controls={mode === "places" ? "map-place-results" : undefined}
            onFocus={() => { if (mode === "places" && (places.length > 0 || status)) setOpen(true); }}
            onChange={(event) => {
              const value = event.target.value;
              if (mode === "accounts") mapUi.setFilters({ ...mapUi.filters, query: value });
              else setPlaceQuery(value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing || mode !== "places") return;
              event.preventDefault();
              if (places[0]) choose(places[0]);
            }}
          />
          {query ? (
            <button type="button" className="absolute right-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-subtle hover:bg-white" aria-label="검색어 지우기" onClick={clear}>
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>
      {showResults ? (
        <div id="map-place-results" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-auto rounded-2xl border border-line bg-white p-1 shadow-float">
          {status && places.length === 0 ? <p className="px-3 py-3 text-sm text-subtle">{status}</p> : null}
          <ul>
            {places.map((place) => (
              <li key={`${place.lat}-${place.lng}-${place.name}`} className="flex items-stretch gap-1">
                <button type="button" className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-primary-soft" onClick={() => choose(place)}>
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-5">{place.name}</span>
                    {place.address && place.address !== place.name ? <span className="block text-[13px] leading-5 text-subtle">{place.address}</span> : null}
                  </span>
                </button>
                <button type="button" className="shrink-0 self-center rounded-lg px-2.5 py-2 text-sm font-bold text-primary hover:bg-primary-soft" onClick={() => register(place)}>등록</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
