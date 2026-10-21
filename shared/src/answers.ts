import { formatDateInSeoul, seoulDateTimeToIso, seoulDayStartIsoFromYmd } from "./dates";
import { formatKoreanDateTime, formatYmdKorean } from "./dates";
import type { AnswerValue, TemplateField } from "./types";

export interface AnswerValidation {
  errors: Record<string, string>;
  normalized: Record<string, AnswerValue>;
}

function optionLabel(field: TemplateField, id: string): string {
  return field.options.find((option) => option.id === id)?.label ?? id;
}

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return formatDateInSeoul(new Date(`${value}T00:00:00+09:00`)) === value;
}

export function validateAnswers(fields: TemplateField[], answers: Record<string, unknown>): AnswerValidation {
  const errors: Record<string, string> = {};
  const normalized: Record<string, AnswerValue> = {};

  for (const field of fields) {
    const raw = answers[field.id];
    const empty =
      raw == null ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (field.required) errors[field.id] = "필수 항목입니다.";
      normalized[field.id] = null;
      continue;
    }

    switch (field.type) {
      case "text":
      case "textarea": {
        if (typeof raw !== "string") {
          errors[field.id] = "문자를 입력해 주세요.";
          normalized[field.id] = null;
          break;
        }
        const text = raw.trim();
        const max = field.type === "text" ? 500 : 4000;
        if (!text) {
          if (field.required) errors[field.id] = "필수 항목입니다.";
          normalized[field.id] = null;
        } else if (text.length > max) {
          errors[field.id] = `${max}자 이하로 입력해 주세요.`;
          normalized[field.id] = text;
        } else {
          normalized[field.id] = text;
        }
        break;
      }
      case "number": {
        if (typeof raw !== "number" || !Number.isFinite(raw)) {
          errors[field.id] = "숫자를 입력해 주세요.";
          normalized[field.id] = null;
          break;
        }
        if (Math.abs(raw) > 1_000_000_000_000) {
          errors[field.id] = "숫자가 너무 큽니다.";
        }
        normalized[field.id] = raw;
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") {
          errors[field.id] = "예 또는 아니오를 선택해 주세요.";
          normalized[field.id] = null;
          break;
        }
        normalized[field.id] = raw;
        break;
      }
      case "single": {
        if (typeof raw !== "string" || !field.options.some((option) => option.id === raw)) {
          errors[field.id] = "선택지를 다시 골라 주세요.";
          normalized[field.id] = null;
          break;
        }
        normalized[field.id] = raw;
        break;
      }
      case "multi":
      case "checklist": {
        if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
          errors[field.id] = "선택지를 다시 골라 주세요.";
          normalized[field.id] = null;
          break;
        }
        const unique = [...new Set(raw)];
        if (unique.some((id) => !field.options.some((option) => option.id === id))) {
          errors[field.id] = "선택지를 다시 골라 주세요.";
          normalized[field.id] = unique;
          break;
        }
        if (field.required && unique.length === 0) {
          errors[field.id] = "필수 항목입니다.";
        }
        normalized[field.id] = unique;
        break;
      }
      case "date": {
        if (typeof raw !== "string" || !isValidYmd(raw)) {
          errors[field.id] = "날짜를 확인해 주세요.";
          normalized[field.id] = null;
          break;
        }
        normalized[field.id] = raw;
        break;
      }
      case "datetime": {
        if (typeof raw !== "string" || Number.isNaN(new Date(raw).getTime())) {
          errors[field.id] = "날짜와 시간을 확인해 주세요.";
          normalized[field.id] = null;
          break;
        }
        normalized[field.id] = new Date(raw).toISOString();
        break;
      }
      default:
        normalized[field.id] = null;
    }
  }

  return { errors, normalized };
}

export function dueFromAnswer(field: TemplateField, value: AnswerValue): { dueAt: string; allDay: boolean } | null {
  if (!field.reminderRule?.enabled) return null;
  if (field.type === "date" && typeof value === "string" && value) {
    return { dueAt: seoulDayStartIsoFromYmd(value), allDay: true };
  }
  if (field.type === "datetime" && typeof value === "string" && value) {
    return { dueAt: seoulDateTimeToIso(value), allDay: false };
  }
  return null;
}

export function formatAnswer(field: TemplateField, value: AnswerValue): string {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return "미입력";
  if (field.type === "boolean" && typeof value === "boolean") return value ? "예" : "아니오";
  if (field.type === "number" && typeof value === "number") {
    const formatted = new Intl.NumberFormat("ko-KR").format(value);
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }
  if (field.type === "single" && typeof value === "string") return optionLabel(field, value);
  if ((field.type === "multi" || field.type === "checklist") && Array.isArray(value)) {
    return value.map((id) => optionLabel(field, id)).join(", ");
  }
  if (field.type === "date" && typeof value === "string") return formatYmdKorean(value);
  if (field.type === "datetime" && typeof value === "string") return formatKoreanDateTime(value);
  return String(value);
}
