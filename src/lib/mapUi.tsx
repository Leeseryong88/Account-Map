"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EMPTY_FILTERS, type FilterState, type GeoBounds } from "@shared/filters";
import type { MapPlace } from "./kakao";
import { DEFAULT_VIEW, loadMapUi, persistMapUi, type MapView } from "./mapState";

export type MapSearchMode = "accounts" | "places";

export interface MapFocus {
  lat: number;
  lng: number;
  level: number;
  token: number;
}

interface MapUiContextValue {
  hydrated: boolean;
  restored: boolean;
  filters: FilterState;
  setFilters: (filters: FilterState | ((current: FilterState) => FilterState)) => void;
  accountId: string | null;
  setAccountId: (accountId: string | null) => void;
  view: MapView;
  setView: (view: MapView) => void;
  bounds: GeoBounds | null;
  setBounds: (bounds: GeoBounds | null) => void;
  searchMode: MapSearchMode;
  setSearchMode: (mode: MapSearchMode) => void;
  pickedPlace: MapPlace | null;
  focus: MapFocus | null;
  pickPlace: (place: MapPlace | null) => void;
}

const MapUiContext = createContext<MapUiContextValue | null>(null);

export function useMapUi() {
  const value = useContext(MapUiContext);
  if (!value) throw new Error("지도 상태가 없습니다.");
  return value;
}

export function MapUiProvider({ uid, children }: { uid: string; children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [view, setView] = useState<MapView>(DEFAULT_VIEW);
  const [bounds, setBounds] = useState<GeoBounds | null>(null);
  const [searchMode, setSearchMode] = useState<MapSearchMode>("accounts");
  const [pickedPlace, setPickedPlace] = useState<MapPlace | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const pickPlace = useCallback((place: MapPlace | null) => {
    setPickedPlace(place);
    if (!place) return;
    setFocus((current) => ({ lat: place.lat, lng: place.lng, level: 4, token: (current?.token ?? 0) + 1 }));
    setView({ lat: place.lat, lng: place.lng, level: 4 });
  }, []);

  useEffect(() => {
    const loaded = loadMapUi(uid);
    setFilters(loaded.filters);
    setAccountId(loaded.accountId);
    setView(loaded.view);
    setRestored(loaded.restored);
    setHydrated(true);
  }, [uid]);

  useEffect(() => {
    if (!hydrated) return;
    persistMapUi(uid, { filters, accountId, view });
  }, [hydrated, uid, filters, accountId, view]);

  const value = useMemo(() => ({
    hydrated,
    restored,
    filters,
    setFilters,
    accountId,
    setAccountId,
    view,
    setView,
    bounds,
    setBounds,
    searchMode,
    setSearchMode,
    pickedPlace,
    focus,
    pickPlace,
  }), [hydrated, restored, filters, accountId, view, bounds, searchMode, pickedPlace, focus]);

  return <MapUiContext.Provider value={value}>{children}</MapUiContext.Provider>;
}
