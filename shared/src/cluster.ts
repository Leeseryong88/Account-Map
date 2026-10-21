export function clusterByGrid<T extends { id: string; x: number; y: number }>(items: T[], cell: number): T[][] {
  if (cell <= 0) return items.map((item) => [item]);
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.x / cell)}:${Math.floor(item.y / cell)}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

export function centroid(items: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  const lat = items.reduce((sum, item) => sum + item.lat, 0) / items.length;
  const lng = items.reduce((sum, item) => sum + item.lng, 0) / items.length;
  return { lat, lng };
}

const BADGE_ORDER = ["overdue", "today", "soon", "old", "warning", "none", "normal", "recent"];

export interface BadgeSummary {
  key: string;
  label: string;
  color: string;
  count: number;
}

export function summarizeBadges(items: Array<{ key: string; label: string; color: string; count?: number }>): BadgeSummary[] {
  const grouped = new Map<string, BadgeSummary>();
  for (const item of items) {
    const count = item.count ?? 1;
    const current = grouped.get(item.key);
    if (current) current.count += count;
    else grouped.set(item.key, { key: item.key, label: item.label, color: item.color, count });
  }
  return [...grouped.values()].sort((a, b) => {
    const left = BADGE_ORDER.indexOf(a.key);
    const right = BADGE_ORDER.indexOf(b.key);
    return (left < 0 ? BADGE_ORDER.length : left) - (right < 0 ? BADGE_ORDER.length : right);
  });
}

export function clusterCellSize(level: number): number {
  if (level <= 2) return 0;
  if (level <= 4) return 110;
  if (level <= 7) return 150;
  return 190;
}

export function pointsAreTight(items: Array<{ lat: number; lng: number }>): boolean {
  if (items.length < 2) return true;
  const lats = items.map((item) => item.lat);
  const lngs = items.map((item) => item.lng);
  return Math.max(...lats) - Math.min(...lats) < 0.0008 && Math.max(...lngs) - Math.min(...lngs) < 0.0008;
}
