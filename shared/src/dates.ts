export const SEOUL = "Asia/Seoul";

export function formatDateInSeoul(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function seoulDayNumber(date: Date): number {
  const [year, month, day] = formatDateInSeoul(date).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function seoulStartOfDay(date: Date): Date {
  return new Date(`${formatDateInSeoul(date)}T00:00:00+09:00`);
}

export function seoulEndOfDay(date: Date): Date {
  return new Date(`${formatDateInSeoul(date)}T23:59:59.999+09:00`);
}

export function seoulDayStartIsoFromYmd(ymd: string): string {
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}

export function addSeoulDays(iso: string, days: number): string {
  const [year, month, day] = formatDateInSeoul(new Date(iso)).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function seoulDateTimeToIso(localValue: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(localValue)) {
    return seoulDayStartIsoFromYmd(localValue);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) {
    return new Date(`${localValue}:00+09:00`).toISOString();
  }
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("날짜를 확인해 주세요.");
  }
  return parsed.toISOString();
}

export function isoToSeoulInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

export function formatYmdKorean(ymd: string): string {
  const [year, month, day] = ymd.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function formatKoreanDayFromIso(iso: string): string {
  return formatYmdKorean(formatDateInSeoul(new Date(iso)));
}

export function formatKoreanDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return parts;
}

export function assertVisitedAt(iso: string, now = new Date()): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("방문 일시를 확인해 주세요.");
  }
  const max = seoulEndOfDay(now).getTime() + 10 * 60 * 1000;
  const min = now.getTime() - 20 * 365 * 24 * 60 * 60 * 1000;
  if (date.getTime() > max) {
    throw new Error("방문 일시는 오늘을 넘길 수 없습니다.");
  }
  if (date.getTime() < min) {
    throw new Error("방문 일시가 너무 오래되었습니다.");
  }
  return date;
}

export function assertReminderDue(iso: string, now = new Date()): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("알림 날짜를 확인해 주세요.");
  }
  const min = now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000;
  const max = now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000;
  if (date.getTime() < min || date.getTime() > max) {
    throw new Error("알림 날짜가 허용 범위를 벗어났습니다.");
  }
  return date;
}
