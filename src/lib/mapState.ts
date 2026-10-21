import { EMPTY_FILTERS, filtersToParams, parseFilters, type FilterState } from "@shared/filters";

export interface MapView {
  lat: number;
  lng: number;
  level: number;
}

export interface MapUiState {
  filters: FilterState;
  accountId: string | null;
  view: MapView;
  restored: boolean;
}

export const DEFAULT_VIEW: MapView = { lat: 37.5665, lng: 126.978, level: 8 };

function numberOr(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sanitizeView(view: Partial<MapView> | null | undefined): MapView {
  const lat = Number(view?.lat);
  const lng = Number(view?.lng);
  const level = Number(view?.level);
  if (!Number.isFinite(lat) || lat < -85 || lat > 85 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return DEFAULT_VIEW;
  }
  if (!Number.isInteger(level) || level < 1 || level > 14) {
    return { lat, lng, level: DEFAULT_VIEW.level };
  }
  return { lat, lng, level };
}

export function loadMapUi(uid: string): MapUiState {
  const url = new URL(window.location.href);
  const storedRaw = sessionStorage.getItem(`salesmap:map:${uid}`);
  const stored = storedRaw ? JSON.parse(storedRaw) as Partial<MapUiState> : null;
  const source = url.searchParams.toString() ? url.searchParams : null;
  const filters = source ? parseFilters(source) : { ...EMPTY_FILTERS, ...(stored?.filters ?? {}) };
  const hasView = Boolean(source?.get("lat") || stored?.view);
  return {
    filters,
    accountId: source?.get("account") ?? stored?.accountId ?? null,
    view: sanitizeView({
      lat: numberOr(source?.get("lat") ?? null, stored?.view?.lat ?? DEFAULT_VIEW.lat),
      lng: numberOr(source?.get("lng") ?? null, stored?.view?.lng ?? DEFAULT_VIEW.lng),
      level: numberOr(source?.get("level") ?? null, stored?.view?.level ?? DEFAULT_VIEW.level),
    }),
    restored: hasView,
  };
}

export function persistMapUi(uid: string, state: Omit<MapUiState, "restored">) {
  const view = sanitizeView(state.view);
  const params = filtersToParams(state.filters);
  if (state.accountId) params.set("account", state.accountId);
  params.set("lat", view.lat.toFixed(5));
  params.set("lng", view.lng.toFixed(5));
  params.set("level", String(view.level));
  const next = params.toString();
  const current = window.location.pathname + window.location.search;
  const target = `${window.location.pathname}?${next}`;
  if (target !== current) {
    window.history.replaceState(window.history.state, "", target);
  }
  sessionStorage.setItem(`salesmap:map:${uid}`, JSON.stringify({ ...state, view }));
}
