import { seoulDayNumber } from "./dates";
import type { VisitBands, VisitTone } from "./types";

export function validateBands(bands: VisitBands): string | null {
  const { recentDays, normalDays, warningDays } = bands;
  if (![recentDays, normalDays, warningDays].every((value) => Number.isInteger(value))) {
    return "기간은 정수로 입력해 주세요.";
  }
  if (recentDays < 0 || normalDays < 0 || warningDays < 0) return "기간은 0 이상이어야 합니다.";
  if (recentDays > 3650 || normalDays > 3650 || warningDays > 3650) return "기간은 3650일 이하로 입력해 주세요.";
  if (!(recentDays < normalDays && normalDays < warningDays)) {
    return "기간은 최근, 보통, 장기 순서로 겹치거나 비지 않게 입력해 주세요.";
  }
  return null;
}

export function visitTone(lastVisitAt: string | null, bands: VisitBands, now: Date): { tone: VisitTone; days: number | null } {
  if (!lastVisitAt) return { tone: "none", days: null };
  const days = seoulDayNumber(now) - seoulDayNumber(new Date(lastVisitAt));
  if (!Number.isFinite(days)) return { tone: "none", days: null };
  const safeDays = Math.max(0, days);
  if (safeDays <= bands.recentDays) return { tone: "recent", days: safeDays };
  if (safeDays <= bands.normalDays) return { tone: "normal", days: safeDays };
  if (safeDays <= bands.warningDays) return { tone: "warning", days: safeDays };
  return { tone: "old", days: safeDays };
}

export function bandCaption(bands: VisitBands): Array<{ tone: VisitTone; label: string }> {
  return [
    { tone: "none", label: "방문 기록 없음" },
    { tone: "recent", label: `${bands.recentDays}일 이내` },
    { tone: "normal", label: `${bands.recentDays + 1}–${bands.normalDays}일` },
    { tone: "warning", label: `${bands.normalDays + 1}–${bands.warningDays}일` },
    { tone: "old", label: `${bands.warningDays + 1}일 이상` },
  ];
}
