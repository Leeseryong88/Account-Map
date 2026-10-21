"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { autoFillFor } from "@shared/templateDraft";
import type { AnswerValue, TemplateField } from "@shared/types";
import { ChoiceGroup, Field, TextArea, TextInput } from "./ui";

const AUTO_BADGE = <span className="badge badge-primary"><Sparkles className="size-3" aria-hidden="true" />자동 입력</span>;

export function TemplateFields({
  fields,
  values,
  errors,
  copiedDateFields = [],
  onChange,
  disabled = false,
}: {
  fields: TemplateField[];
  values: Record<string, AnswerValue>;
  errors: Record<string, string>;
  copiedDateFields?: string[];
  onChange: (fieldId: string, value: AnswerValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-5">
      {fields.map((field) => {
        const value = values[field.id] ?? null;
        const error = errors[field.id];
        const copied = copiedDateFields.includes(field.id);
        const label = field.label || "이름 없는 항목";
        if (field.type === "single" && field.options.length <= 8) {
          return (
            <ChoiceGroup key={field.id} label={label} required={field.required} help={field.helpText} error={error}>
              <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
                {field.options.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={value === option.id}
                    disabled={disabled}
                    className="chip"
                    onClick={() => onChange(field.id, value === option.id && !field.required ? null : option.id)}
                  >
                    {value === option.id ? <Check aria-hidden="true" /> : null}
                    {option.label || `보기 ${index + 1}`}
                  </button>
                ))}
              </div>
            </ChoiceGroup>
          );
        }
        if ((field.type === "multi" || field.type === "checklist") && field.options.length <= 8) {
          const selected = Array.isArray(value) ? value : [];
          return (
            <ChoiceGroup key={field.id} label={label} required={field.required} help={field.helpText || (field.type === "multi" ? "여러 개 고를 수 있습니다." : undefined)} error={error}>
              <div className={field.type === "checklist" ? "grid gap-1.5" : "flex flex-wrap gap-2"}>
                {field.options.map((option, index) => {
                  const checked = selected.includes(option.id);
                  const toggle = () => onChange(field.id, checked ? selected.filter((id) => id !== option.id) : [...selected, option.id]);
                  if (field.type === "multi") {
                    return (
                      <button key={option.id} type="button" className="chip" aria-pressed={checked} disabled={disabled} onClick={toggle}>
                        {checked ? <Check aria-hidden="true" /> : null}
                        {option.label || `보기 ${index + 1}`}
                      </button>
                    );
                  }
                  return (
                    <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-3 text-[15px] has-[:checked]:border-[#b9c9f5] has-[:checked]:bg-[#f5f8ff]">
                      <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={toggle} />
                      <span className={checked ? "text-subtle line-through" : ""}>{option.label || `항목 ${index + 1}`}</span>
                    </label>
                  );
                })}
              </div>
            </ChoiceGroup>
          );
        }
        if (field.type === "boolean") {
          return (
            <ChoiceGroup key={field.id} label={label} required={field.required} help={field.helpText} error={error}>
              <div className="flex gap-2">
                {([["예", true], ["아니오", false]] as const).map(([text, next]) => (
                  <button
                    key={text}
                    type="button"
                    aria-pressed={value === next}
                    disabled={disabled}
                    className="chip min-w-20 justify-center"
                    onClick={() => onChange(field.id, value === next && !field.required ? null : next)}
                  >
                    {value === next ? <Check aria-hidden="true" /> : null}
                    {text}
                  </button>
                ))}
              </div>
            </ChoiceGroup>
          );
        }
        const auto = autoFillFor(field);
        const help = copied ? "이전 기록의 날짜가 그대로 들어 있습니다. 확인해 주세요." : auto ? (field.helpText || "거래처 정보로 자동으로 채웠습니다. 필요하면 고칠 수 있습니다.") : field.helpText;
        return (
          <Field key={field.id} id={`field-${field.id}`} label={label} required={field.required} help={help} error={error} badge={auto ? AUTO_BADGE : field.reminderRule?.enabled ? <span className="badge badge-warn">알림</span> : undefined}>
            {(aria) => fieldControl(field, value, disabled, aria, (next) => onChange(field.id, next))}
          </Field>
        );
      })}
    </div>
  );
}

function fieldControl(
  field: TemplateField,
  value: AnswerValue,
  disabled: boolean,
  aria: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean },
  onChange: (value: AnswerValue) => void,
) {
  if (field.type === "textarea") {
    return <TextArea {...aria} disabled={disabled} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.type === "number") {
    return (
      <div className="flex items-center gap-2">
        <TextInput
          {...aria}
          inputMode="decimal"
          disabled={disabled}
          placeholder={field.placeholder}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
        {field.unit ? <span className="shrink-0 whitespace-nowrap text-sm font-medium text-muted">{field.unit}</span> : null}
      </div>
    );
  }
  if (field.type === "date") {
    return <TextInput {...aria} type="date" className="sm:max-w-60" disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }
  if (field.type === "datetime") {
    return <TextInput {...aria} type="datetime-local" className="sm:max-w-72" disabled={disabled} value={typeof value === "string" ? toLocal(value) : ""} onChange={(event) => onChange(event.target.value ? new Date(`${event.target.value}:00+09:00`).toISOString() : null)} />;
  }
  if (field.type === "single" || field.type === "multi" || field.type === "checklist") {
    return <OptionSearch field={field} value={value} disabled={disabled} aria={aria} onChange={onChange} />;
  }
  return <TextInput {...aria} disabled={disabled} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
}

function toLocal(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

function OptionSearch({
  field,
  value,
  disabled,
  aria,
  onChange,
}: {
  field: TemplateField;
  value: AnswerValue;
  disabled: boolean;
  aria: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };
  onChange: (value: AnswerValue) => void;
}) {
  const selected = field.type === "single" ? (typeof value === "string" ? [value] : []) : (Array.isArray(value) ? value : []);
  const [query, setQuery] = useState("");
  const visible = field.options.filter((option) => option.label.includes(query.trim()));
  return (
    <div className="grid gap-2">
      <input {...aria} className="field-input" disabled={disabled} placeholder="보기 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div role="listbox" aria-label={field.label} className="max-h-56 overflow-auto rounded-xl border border-line">
        {visible.length === 0 ? <p className="px-3 py-2 text-sm text-subtle">맞는 보기가 없습니다.</p> : visible.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={checked}
              disabled={disabled}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left hover:bg-[#f7f8fb] aria-selected:bg-primary-soft aria-selected:font-semibold aria-selected:text-primary-ink"
              onClick={() => {
                if (field.type === "single") onChange(option.id);
                else onChange(checked ? selected.filter((id) => id !== option.id) : [...selected, option.id]);
              }}
            >
              {option.label}
              {checked ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
