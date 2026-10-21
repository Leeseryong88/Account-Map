export interface VisitAnchor {
  id: string;
  visitedAt: string;
}

export function selectVisitAnchors(visits: Array<{ id: string; visitedAt: string; deleted?: boolean }>): {
  latest: VisitAnchor | null;
  previous: VisitAnchor | null;
} {
  const active = visits
    .filter((visit) => !visit.deleted && !Number.isNaN(Date.parse(visit.visitedAt)))
    .sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt) || b.id.localeCompare(a.id));
  return {
    latest: active[0] ? { id: active[0].id, visitedAt: new Date(active[0].visitedAt).toISOString() } : null,
    previous: active[1] ? { id: active[1].id, visitedAt: new Date(active[1].visitedAt).toISOString() } : null,
  };
}

export function previewLatest(input: {
  thisVisitId: string | null;
  thisVisitedAt: string;
  latestVisitId: string | null;
  latestVisitAt: string | null;
  previousVisitId: string | null;
  previousVisitAt: string | null;
}): VisitAnchor | null {
  const rows: Array<{ id: string; visitedAt: string }> = [];
  if (input.latestVisitId && input.latestVisitAt && input.latestVisitId !== input.thisVisitId) {
    rows.push({ id: input.latestVisitId, visitedAt: input.latestVisitAt });
  }
  if (input.previousVisitId && input.previousVisitAt && input.previousVisitId !== input.thisVisitId) {
    rows.push({ id: input.previousVisitId, visitedAt: input.previousVisitAt });
  }
  rows.push({ id: input.thisVisitId ?? "new", visitedAt: input.thisVisitedAt });
  return selectVisitAnchors(rows).latest;
}

export function applyVisitCount(count: number, change: "create" | "delete"): number {
  if (change === "create") return count + 1;
  return Math.max(0, count - 1);
}
