let loading: Promise<void> | null = null;

export function loadKakao(appKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("browser"));
  if (window.kakao?.maps) {
    return new Promise<void>((resolve) => window.kakao.maps.load(() => resolve()));
  }
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.dataset.kakaoSdk = "true";
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`;
      script.onload = () => window.kakao.maps.load(() => resolve());
      script.onerror = () => {
        loading = null;
        reject(new Error("지도를 불러오지 못했습니다."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export interface MapPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function asPlace(item: { place_name?: string; address_name?: string; road_address_name?: string; y?: string; x?: string }, fallbackName?: string): MapPlace | null {
  const lat = Number(item.y);
  const lng = Number(item.x);
  const address = item.road_address_name || item.address_name || "";
  const name = (item.place_name || fallbackName || address).trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name, address, lat, lng };
}

function searchOnce(kind: "keyword" | "address", keyword: string): Promise<MapPlace[]> {
  return new Promise((resolve) => {
    const done = (data: unknown, status: string) => {
      if (status !== window.kakao.maps.services.Status.OK || !Array.isArray(data)) {
        resolve([]);
        return;
      }
      resolve(data.flatMap((item) => {
        const place = asPlace(item);
        return place ? [place] : [];
      }));
    };
    if (kind === "keyword") new window.kakao.maps.services.Places().keywordSearch(keyword, done);
    else new window.kakao.maps.services.Geocoder().addressSearch(keyword, done);
  });
}

export async function searchMapPlaces(keyword: string): Promise<MapPlace[]> {
  const query = keyword.trim();
  if (!query) return [];
  if (!window.kakao?.maps?.services) throw new Error("지도 검색을 사용할 수 없습니다.");
  const [places, addresses] = await Promise.all([searchOnce("keyword", query), searchOnce("address", query)]);
  const seen = new Set<string>();
  const merged: MapPlace[] = [];
  for (const place of [...places, ...addresses]) {
    const key = `${place.lat.toFixed(5)}:${place.lng.toFixed(5)}:${place.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
    if (merged.length >= 8) break;
  }
  return merged;
}

export function accountDraftHref(place: MapPlace) {
  const params = new URLSearchParams();
  params.set("name", place.name);
  params.set("address", place.address);
  params.set("lat", String(place.lat));
  params.set("lng", String(place.lng));
  return `/accounts/new?${params.toString()}`;
}
