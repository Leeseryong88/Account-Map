import type { AutoFillSource, FieldType, SalesStatus, TaskStatus, TimeStatus, VisitTone } from "./types";

export const SALES_STATUS_LABEL: Record<SalesStatus, string> = {
  prospect: "잠재 고객",
  contacting: "접촉 중",
  active: "거래 중",
  hold: "보류",
  closed: "종료",
};

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "짧은 글",
  textarea: "긴 글(메모)",
  number: "숫자",
  single: "하나 고르기",
  multi: "여러 개 고르기",
  boolean: "예 / 아니오",
  date: "날짜",
  datetime: "날짜와 시간",
  checklist: "체크리스트",
};

export const FIELD_TYPE_HINT: Record<FieldType, string> = {
  text: "이름, 제품명처럼 한 줄",
  textarea: "상담 내용 등 길게",
  number: "수량, 금액",
  single: "보기 중 하나",
  multi: "보기 중 여러 개",
  boolean: "했다 / 안 했다",
  date: "연락일, 납기일",
  datetime: "약속 시각",
  checklist: "할 일 점검",
};

export const AUTO_FILL_LABEL: Record<AutoFillSource, string> = {
  accountName: "거래처명",
  lastVisitDate: "전 방문일자",
};

export const TIME_STATUS_LABEL: Record<TimeStatus, string> = {
  scheduled: "예정",
  soon: "임박",
  today: "오늘",
  overdue: "지연",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "미완료",
  done: "완료",
  cancelled: "취소",
};

export const VISIT_TONE_LABEL: Record<VisitTone, string> = {
  none: "미방문",
  recent: "최근 방문",
  normal: "보통",
  warning: "방문 필요",
  old: "장기 미방문",
};

export function visitLabel(days: number | null): string {
  if (days == null) return "미방문";
  if (days <= 0) return "오늘 방문";
  if (days === 1) return "어제 방문";
  return `${days}일 전 방문`;
}
