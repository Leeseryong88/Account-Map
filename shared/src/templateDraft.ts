import { createId } from "./ids";
import { EMPTY_REVISIT } from "./types";
import type { AutoFillSource, FieldType, RevisitRule, TemplateField } from "./types";

export interface TemplateDraft {
  name: string;
  description: string;
  fields: TemplateField[];
  revisitRule: RevisitRule;
}

export function usesOptions(type: FieldType): boolean {
  return type === "single" || type === "multi" || type === "checklist";
}

export function usesReminder(type: FieldType): boolean {
  return type === "date" || type === "datetime";
}

export function autoFillTypeOf(source: AutoFillSource): FieldType {
  return source === "accountName" ? "text" : "date";
}

export function autoFillFor(field: Pick<TemplateField, "type" | "autoFill">): AutoFillSource | null {
  if (!field.autoFill) return null;
  return autoFillTypeOf(field.autoFill) === field.type ? field.autoFill : null;
}

export function createField(type: FieldType): TemplateField {
  return {
    id: createId("f"),
    type,
    label: "",
    required: false,
    helpText: "",
    placeholder: "",
    options: usesOptions(type)
      ? [
          { id: createId("o"), label: "" },
          { id: createId("o"), label: "" },
        ]
      : [],
    unit: "",
    reminderRule: usesReminder(type) ? { enabled: false, title: "", leadDays: 1 } : null,
    autoFill: null,
  };
}

export function changeFieldType(field: TemplateField, type: FieldType): TemplateField {
  const fresh = createField(type);
  return {
    ...fresh,
    id: field.id,
    label: field.label,
    required: field.required,
    helpText: field.helpText,
    placeholder: type === "text" || type === "textarea" || type === "number" ? field.placeholder : "",
    options: usesOptions(type) && usesOptions(field.type) ? field.options : fresh.options,
    reminderRule: usesReminder(type) && field.reminderRule ? field.reminderRule : fresh.reminderRule,
    autoFill: autoFillFor({ type, autoFill: field.autoFill ?? null }),
  };
}

export function duplicateField(field: TemplateField): TemplateField {
  return {
    ...field,
    id: createId("f"),
    label: field.label ? `${field.label} (복사)` : "",
    options: field.options.map((option) => ({ ...option, id: createId("o") })),
    reminderRule: field.reminderRule ? { ...field.reminderRule } : null,
    autoFill: null,
  };
}

export interface FieldPreset {
  id: string;
  label: string;
  hint: string;
  build: () => TemplateField;
}

export const FIELD_PRESETS: FieldPreset[] = [
  {
    id: "purpose",
    label: "방문 목적",
    hint: "신규 상담, 정기 방문 등에서 고르기",
    build: () => ({
      ...createField("single"),
      label: "방문 목적",
      options: ["신규 상담", "정기 방문", "문제 해결", "수금", "기타"].map((label) => ({ id: createId("o"), label })),
    }),
  },
  {
    id: "accountName",
    label: "거래처명",
    hint: "거래처 이름이 자동으로 채워집니다",
    build: () => ({ ...createField("text"), label: "거래처명", autoFill: "accountName" }),
  },
  {
    id: "lastVisit",
    label: "전 방문일자",
    hint: "지난 방문일이 자동으로 채워집니다",
    build: () => ({ ...createField("date"), label: "전 방문일자", autoFill: "lastVisitDate" }),
  },
  {
    id: "memo",
    label: "메모",
    hint: "상담 내용을 자유롭게",
    build: () => ({ ...createField("textarea"), label: "메모", placeholder: "나눈 이야기, 요청 사항 등을 적어 주세요." }),
  },
  {
    id: "nextContact",
    label: "다음 연락일",
    hint: "날짜를 넣으면 알림이 생깁니다",
    build: () => ({
      ...createField("date"),
      label: "다음 연락일",
      helpText: "날짜를 넣으면 그날 알림을 받습니다.",
      reminderRule: { enabled: true, title: "다음 연락", leadDays: 1 },
    }),
  },
];

export function cloneFields(fields: TemplateField[]): TemplateField[] {
  return fields.map((field) => ({
    ...field,
    id: createId("f"),
    options: field.options.map((option) => ({ ...option, id: createId("o") })),
    reminderRule: field.reminderRule ? { ...field.reminderRule } : null,
    autoFill: autoFillFor(field),
  }));
}

function cleanField(field: TemplateField): TemplateField {
  const autoFill = autoFillFor(field);
  return {
    ...field,
    label: field.label.trim(),
    helpText: field.helpText.trim(),
    placeholder: field.placeholder.trim(),
    unit: field.type === "number" ? field.unit.trim() : "",
    options: usesOptions(field.type) ? field.options.map((option) => ({ ...option, label: option.label.trim() })) : [],
    reminderRule: usesReminder(field.type)
      ? {
          enabled: autoFill ? false : Boolean(field.reminderRule?.enabled),
          title: field.reminderRule?.title.trim() || field.label.trim(),
          leadDays: field.reminderRule?.leadDays ?? 1,
        }
      : null,
    autoFill,
  };
}

export function validateTemplate(draft: TemplateDraft): { errors: Record<string, string>; value: TemplateDraft | null } {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (!name) errors.name = "템플릿 이름을 입력해 주세요.";
  if (name.length > 80) errors.name = "템플릿 이름은 80자 이하로 입력해 주세요.";
  if (description.length > 400) errors.description = "설명은 400자 이하로 입력해 주세요.";
  if (draft.fields.length > 40) errors.fields = "항목은 40개까지 추가할 수 있습니다.";

  const rule = draft.revisitRule;
  if (!Number.isInteger(rule.daysAfterVisit) || rule.daysAfterVisit < 1 || rule.daysAfterVisit > 3650) {
    errors.revisitDays = "재방문 일수는 1에서 3650 사이의 정수로 입력해 주세요.";
  }
  if (!Number.isInteger(rule.leadDays) || rule.leadDays < 0 || rule.leadDays > 365) {
    errors.revisitLead = "사전 표시 일수는 0에서 365 사이의 정수로 입력해 주세요.";
  } else if (rule.enabled && rule.leadDays > rule.daysAfterVisit) {
    errors.revisitLead = "사전 표시 일수는 재방문 일수보다 길 수 없습니다.";
  }

  const ids = new Set<string>();
  const fields = draft.fields.map(cleanField);
  fields.forEach((field, index) => {
    if (!field.label) errors[`field-${index}-label`] = "항목 이름을 입력해 주세요.";
    if (field.label.length > 80) errors[`field-${index}-label`] = "항목 이름은 80자 이하로 입력해 주세요.";
    if (ids.has(field.id)) errors[`field-${index}-label`] = "항목 ID가 중복되었습니다.";
    ids.add(field.id);
    if (usesOptions(field.type)) {
      const filled = field.options.filter((option) => option.label);
      if (filled.length < 2) errors[`field-${index}-options`] = "선택지를 2개 이상 입력해 주세요.";
      if (field.options.length > 30) errors[`field-${index}-options`] = "선택지는 30개까지 추가할 수 있습니다.";
      if (field.options.some((option) => option.label.length > 80)) {
        errors[`field-${index}-options`] = "선택지는 80자 이하로 입력해 주세요.";
      }
    }
    if (field.reminderRule?.enabled) {
      if (!field.reminderRule.title) errors[`field-${index}-reminder`] = "알림 제목을 입력해 주세요.";
      if (!Number.isInteger(field.reminderRule.leadDays) || field.reminderRule.leadDays < 0 || field.reminderRule.leadDays > 365) {
        errors[`field-${index}-reminder`] = "사전 표시 일수를 확인해 주세요.";
      }
    }
  });

  if (Object.keys(errors).length > 0) return { errors, value: null };
  return {
    errors,
    value: {
      name,
      description,
      fields: fields.map((field) => ({
        ...field,
        options: field.options.filter((option) => option.label),
      })),
      revisitRule: {
        enabled: rule.enabled,
        daysAfterVisit: rule.daysAfterVisit,
        leadDays: rule.leadDays,
      },
    },
  };
}

export function blankTemplate(): TemplateDraft {
  return {
    name: "",
    description: "",
    fields: [{ ...createField("textarea"), label: "메모" }],
    revisitRule: { ...EMPTY_REVISIT },
  };
}
