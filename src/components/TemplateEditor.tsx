"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { DndContext, PointerSensor, KeyboardSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft, Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, BellRing, Calendar, CalendarClock, Check, ChevronDown, CircleDot, Copy, Eye,
  GripVertical, Hash, ListChecks, Pencil, Plus, RotateCcw, Sparkles, SquareCheck, ToggleLeft, Trash2, Type, X, type LucideIcon,
} from "lucide-react";
import { FIELD_TYPES, type AnswerValue, type FieldType, type TemplateField } from "@shared/types";
import { AUTO_FILL_LABEL, FIELD_TYPE_HINT, FIELD_TYPE_LABEL } from "@shared/labels";
import { createId, moveItem } from "@shared/ids";
import { addSeoulDays } from "@shared/dates";
import { DEFAULT_TEMPLATE_ID, STARTER_TEMPLATE } from "@shared/starterTemplate";
import {
  autoFillFor, blankTemplate, changeFieldType, cloneFields, createField, duplicateField, FIELD_PRESETS, usesOptions, usesReminder, validateTemplate,
  type TemplateDraft,
} from "@shared/templateDraft";
import { useAuth } from "@/lib/auth";
import { loadTemplateDraft, saveTemplate, setTemplateArchived } from "@/lib/writes";
import { confirmLeave, setUnsaved } from "@/lib/unsaved";
import { useToast } from "./Providers";
import { TemplateFields } from "./TemplateFields";
import { Button, IconButton, Switch, TextInput } from "./ui";

export type TemplateSource = "starter" | "blank" | { copyOf: string };

const TYPE_ICON: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  single: CircleDot,
  multi: ListChecks,
  boolean: ToggleLeft,
  date: Calendar,
  datetime: CalendarClock,
  checklist: SquareCheck,
};

function starterDraft(): TemplateDraft {
  return { ...STARTER_TEMPLATE, fields: cloneFields(STARTER_TEMPLATE.fields), revisitRule: { ...STARTER_TEMPLATE.revisitRule } };
}

function fieldErrors(errors: Record<string, string>, index: number) {
  return [errors[`field-${index}-label`], errors[`field-${index}-options`], errors[`field-${index}-reminder`]].filter(Boolean) as string[];
}

export function TemplateEditor({ templateId, source = "blank" }: { templateId?: string; source?: TemplateSource }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<TemplateDraft>(() => (templateId ? blankTemplate() : source === "starter" ? starterDraft() : blankTemplate()));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [preview, setPreview] = useState<Record<string, AnswerValue>>({});
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [pending, setPending] = useState(false);
  const [archived, setArchived] = useState(false);
  const [version, setVersion] = useState(0);
  const copyOf = typeof source === "object" ? source.copyOf : null;
  const [loaded, setLoaded] = useState(!templateId && !copyOf);
  const [missing, setMissing] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const isDefault = templateId === DEFAULT_TEMPLATE_ID;
  const errors = useMemo(() => attempted ? validateTemplate(draft).errors : {}, [attempted, draft]);

  useEffect(() => {
    if (!user) return;
    const loadId = templateId ?? copyOf;
    if (!loadId) return;
    void loadTemplateDraft(user.uid, loadId).then((result) => {
      if (!result) {
        setMissing(true);
        return;
      }
      if (templateId) {
        setArchived(result.archived);
        setVersion(result.versionNumber);
        setDraft(result.draft);
      } else {
        setDraft({ ...result.draft, name: `${result.draft.name} 복사본`.slice(0, 80), fields: cloneFields(result.draft.fields) });
      }
      setLoaded(true);
    }).catch(() => setMissing(true));
  }, [user, templateId, copyOf]);

  const seenDraft = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!seenDraft.current) {
      seenDraft.current = true;
      return;
    }
    setUnsaved(true);
    return () => setUnsaved(false);
  }, [draft, loaded]);

  useEffect(() => {
    if (!justAdded) return;
    document.getElementById(`field-card-${justAdded}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [justAdded]);

  const previewValues = useMemo(() => {
    const next = { ...preview };
    for (const field of draft.fields) {
      const auto = autoFillFor(field);
      if (!auto || next[field.id] !== undefined) continue;
      next[field.id] = auto === "accountName" ? "예시 거래처" : addSeoulDays(new Date().toISOString(), -14);
    }
    return next;
  }, [draft.fields, preview]);

  function setFields(fields: TemplateField[]) {
    setDraft((current) => ({ ...current, fields }));
  }

  function updateField(id: string, patch: Partial<TemplateField> | ((field: TemplateField) => TemplateField)) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => field.id === id ? (typeof patch === "function" ? patch(field) : { ...field, ...patch }) : field),
    }));
  }

  function addField(field: TemplateField) {
    setFields([...draft.fields, field]);
    setExpanded(field.id);
    setJustAdded(field.id);
  }

  function removeField(id: string) {
    const field = draft.fields.find((item) => item.id === id);
    if (field?.label && !window.confirm(`"${field.label}" 항목을 지울까요?`)) return;
    setFields(draft.fields.filter((item) => item.id !== id));
    if (expanded === id) setExpanded(null);
  }

  function move(id: string, direction: -1 | 1) {
    const from = draft.fields.findIndex((field) => field.id === id);
    setFields(moveItem(draft.fields, from, from + direction));
  }

  function onDragEnd(event: DragEndEvent) {
    const from = draft.fields.findIndex((field) => field.id === event.active.id);
    const to = draft.fields.findIndex((field) => field.id === event.over?.id);
    if (from < 0 || to < 0) return;
    setFields(moveItem(draft.fields, from, to));
  }

  async function save() {
    if (!user) return;
    setAttempted(true);
    const checked = validateTemplate(draft);
    if (!checked.value) {
      const index = draft.fields.findIndex((_, fieldIndex) => fieldErrors(checked.errors, fieldIndex).length > 0);
      if (index >= 0) {
        setExpanded(draft.fields[index].id);
        setJustAdded(null);
        window.setTimeout(() => document.getElementById(`field-card-${draft.fields[index].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      } else if (checked.errors.name) {
        document.getElementById("template-name")?.focus();
      }
      setMobilePane("edit");
      toast("빨간색으로 표시된 곳을 확인해 주세요.", "error");
      return;
    }
    setPending(true);
    const result = await saveTemplate(user.uid, templateId ?? null, draft).catch(() => null);
    setPending(false);
    if (!result?.id) {
      toast("템플릿을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    setUnsaved(false);
    toast(templateId ? "템플릿을 저장했습니다. 이미 쓴 방문 기록은 그대로입니다." : "새 템플릿을 만들었습니다.");
    router.push("/templates");
  }

  async function toggleArchive() {
    if (!user || !templateId) return;
    await setTemplateArchived(user.uid, templateId, !archived);
    setArchived(!archived);
    toast(archived ? "보관을 해제했습니다." : "템플릿을 보관했습니다. 새 방문 기록에서는 고를 수 없습니다.");
  }

  function resetToStarter() {
    if (!window.confirm("기본 항목(방문 목적, 거래처명, 전 방문일자, 메모, 다음 연락일)으로 되돌릴까요? 저장해야 반영됩니다.")) return;
    setDraft(starterDraft());
    setExpanded(null);
  }

  if (missing) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="grid gap-3">
          <p className="font-semibold">템플릿을 찾을 수 없습니다.</p>
          <Link href="/templates" className="btn btn-secondary">템플릿 목록으로</Link>
        </div>
      </div>
    );
  }
  if (!loaded) return <p className="p-6 text-subtle">템플릿을 불러오는 중</p>;

  const title = templateId ? "템플릿 수정" : "새 템플릿";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <Link href="/templates" className="btn btn-ghost btn-sm hidden lg:inline-flex" onClick={(event) => { if (!confirmLeave()) event.preventDefault(); }}>
          <ArrowLeft aria-hidden="true" />템플릿 목록
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{title}</p>
          {templateId ? <p className="text-xs text-subtle">현재 버전 {version}{archived ? " · 보관됨" : ""}</p> : null}
        </div>
        <div className="seg lg:hidden" role="tablist" aria-label="화면 전환">
          <button type="button" role="tab" aria-selected={mobilePane === "edit"} onClick={() => setMobilePane("edit")}><span className="flex items-center gap-1"><Pencil className="size-3.5" aria-hidden="true" />편집</span></button>
          <button type="button" role="tab" aria-selected={mobilePane === "preview"} onClick={() => setMobilePane("preview")}><span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden="true" />미리보기</span></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className={clsx("min-h-0 overflow-auto", mobilePane === "preview" ? "hidden lg:block" : "block")}>
            <div className="mx-auto grid max-w-2xl gap-4 p-4 pb-10 lg:p-6">
              <section className="card grid gap-4 p-4 sm:p-5">
                <div className="grid gap-1.5">
                  <label htmlFor="template-name" className="text-sm font-semibold">템플릿 이름 <span className="ml-1 text-xs font-bold text-danger">필수</span></label>
                  <TextInput
                    id="template-name"
                    className="text-lg font-semibold"
                    placeholder="예: 정기 방문, 신규 상담"
                    aria-invalid={errors.name ? true : undefined}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                  {errors.name ? <p role="alert" className="text-sm font-medium text-danger">{errors.name}</p> : null}
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="template-description" className="text-sm font-semibold">설명 <span className="font-normal text-subtle">(선택)</span></label>
                  <TextInput id="template-description" placeholder="언제 쓰는 양식인지 짧게 적어 두면 고를 때 편합니다." value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                  {errors.description ? <p role="alert" className="text-sm font-medium text-danger">{errors.description}</p> : null}
                </div>
                {isDefault ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-sm text-primary-ink">
                    <span>기본으로 제공되는 템플릿입니다. 내 방식에 맞게 자유롭게 고쳐 쓰세요.</span>
                    <Button type="button" size="sm" variant="ghost" className="text-primary-ink" onClick={resetToStarter}><RotateCcw aria-hidden="true" />기본값으로</Button>
                  </div>
                ) : null}
              </section>

              <section className="grid gap-3">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <h2 className="text-lg font-bold">기록할 항목 <span className="text-subtle">{draft.fields.length}</span></h2>
                    <p className="text-[13px] text-subtle">카드를 눌러 고치고, 왼쪽 손잡이를 끌어 순서를 바꿉니다.</p>
                  </div>
                </div>
                {errors.fields ? <p role="alert" className="text-sm font-medium text-danger">{errors.fields}</p> : null}
                {draft.fields.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line-strong bg-white px-4 py-8 text-center text-sm text-subtle">아래에서 항목을 골라 추가해 주세요.</p>
                ) : null}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={draft.fields.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    <ul className="grid gap-2.5">
                      {draft.fields.map((field, index) => (
                        <SortableCard key={field.id} id={field.id}>
                          {(handle) => (
                            <FieldCard
                              field={field}
                              index={index}
                              total={draft.fields.length}
                              open={expanded === field.id}
                              autoFocus={justAdded === field.id}
                              errors={fieldErrors(errors, index)}
                              optionError={errors[`field-${index}-options`]}
                              handle={handle}
                              onToggle={() => { setExpanded(expanded === field.id ? null : field.id); setJustAdded(null); }}
                              onChange={(patch) => updateField(field.id, patch)}
                              onMove={(direction) => move(field.id, direction)}
                              onDuplicate={() => {
                                const copy = duplicateField(field);
                                const next = draft.fields.slice();
                                next.splice(index + 1, 0, copy);
                                setFields(next);
                                setExpanded(copy.id);
                                setJustAdded(copy.id);
                              }}
                              onDelete={() => removeField(field.id)}
                            />
                          )}
                        </SortableCard>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
                <AddFieldPanel existing={draft.fields} onAdd={addField} />
              </section>

              <section className="card grid gap-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 font-bold"><BellRing className="size-[18px] text-primary" aria-hidden="true" />재방문 알림</h2>
                    <p className="mt-0.5 text-[13px] text-subtle">이 템플릿으로 기록하면, 정한 기간 뒤에 다시 방문하라고 알려 드립니다.</p>
                  </div>
                  <Switch label="재방문 알림 사용" checked={draft.revisitRule.enabled} onCheckedChange={(checked) => setDraft({ ...draft, revisitRule: { ...draft.revisitRule, enabled: checked } })} />
                </div>
                {draft.revisitRule.enabled ? (
                  <div className="grid gap-2 rounded-xl bg-[#f6f8fb] p-3 text-[15px] leading-10">
                    <p className="flex flex-wrap items-center gap-x-2">
                      방문하고
                      <NumberBox id="revisit-days" label="방문 후 일수" min={1} value={draft.revisitRule.daysAfterVisit} invalid={Boolean(errors.revisitDays)} onChange={(value) => setDraft({ ...draft, revisitRule: { ...draft.revisitRule, daysAfterVisit: value } })} />
                      일 뒤에 다시 방문,
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2">
                      <NumberBox id="revisit-lead" label="미리 알림 일수" min={0} value={draft.revisitRule.leadDays} invalid={Boolean(errors.revisitLead)} onChange={(value) => setDraft({ ...draft, revisitRule: { ...draft.revisitRule, leadDays: value } })} />
                      일 전부터 미리 알려 주기
                    </p>
                    {errors.revisitDays || errors.revisitLead ? <p role="alert" className="text-sm font-medium leading-5 text-danger">{errors.revisitDays || errors.revisitLead}</p> : null}
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <aside className={clsx("min-h-0 overflow-auto border-line bg-[#eef1f6] lg:block lg:border-l", mobilePane === "preview" ? "block" : "hidden")}>
            <div className="mx-auto grid max-w-2xl gap-3 p-4 lg:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold"><Eye className="size-4" aria-hidden="true" />미리보기</p>
                  <p className="text-xs text-subtle">방문 기록을 쓸 때 이렇게 보입니다. 눌러 봐도 저장되지 않습니다.</p>
                </div>
                {Object.keys(preview).length ? <Button type="button" size="sm" variant="ghost" onClick={() => setPreview({})}>비우기</Button> : null}
              </div>
              <div className="card p-4 sm:p-5">
                <p className="text-base font-bold">{draft.name || "템플릿 이름"}</p>
                {draft.description ? <p className="mt-0.5 text-[13px] text-subtle">{draft.description}</p> : null}
                <div className="mt-4">
                  {draft.fields.length ? (
                    <TemplateFields fields={draft.fields} values={previewValues} errors={{}} onChange={(fieldId, value) => setPreview({ ...preview, [fieldId]: value })} />
                  ) : <p className="text-sm text-subtle">항목을 추가하면 여기에 표시됩니다.</p>}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-4 py-3 pb-safe" style={{ marginBottom: "var(--keyboard-inset)" }}>
        <p className="hidden min-w-0 text-[13px] text-subtle sm:block">저장해도 이미 쓴 방문 기록은 바뀌지 않습니다.</p>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          {templateId ? (
            <Button type="button" variant="ghost" onClick={toggleArchive}>
              {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}{archived ? "보관 해제" : "보관"}
            </Button>
          ) : null}
          <Button type="button" variant="primary" className="min-w-32" disabled={pending} aria-busy={pending} onClick={save}>{pending ? "저장 중" : templateId ? "변경 저장" : "템플릿 만들기"}</Button>
        </div>
      </footer>
    </div>
  );
}

function NumberBox({ id, label, value, min, invalid, onChange }: { id: string; label: string; value: number; min: number; invalid?: boolean; onChange: (value: number) => void }) {
  return (
    <input
      id={id}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      type="number"
      inputMode="numeric"
      min={min}
      className="field-input h-10 min-h-10 w-20 px-2 text-center font-bold"
      value={Number.isFinite(value) ? value : ""}
      onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
    />
  );
}

type DragHandle = { attributes: React.HTMLAttributes<HTMLElement>; listeners: Record<string, unknown> | undefined };

function SortableCard({ id, children }: { id: string; children: (handle: DragHandle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      id={`field-card-${id}`}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={clsx("relative scroll-mt-24", isDragging && "opacity-90 shadow-float")}
    >
      {children({ attributes, listeners })}
    </li>
  );
}

function FieldCard({
  field, index, total, open, autoFocus, errors, optionError, handle, onToggle, onChange, onMove, onDuplicate, onDelete,
}: {
  field: TemplateField;
  index: number;
  total: number;
  open: boolean;
  autoFocus: boolean;
  errors: string[];
  optionError?: string;
  handle: DragHandle;
  onToggle: () => void;
  onChange: (patch: Partial<TemplateField> | ((field: TemplateField) => TemplateField)) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICON[field.type];
  const auto = autoFillFor(field);
  const [advanced, setAdvanced] = useState(Boolean(field.helpText || field.placeholder));
  const autoSource = field.type === "text" ? "accountName" : field.type === "date" ? "lastVisitDate" : null;
  return (
    <div className={clsx("card overflow-hidden transition-shadow", open && "shadow-panel ring-2 ring-[#c9d6fb]", errors.length > 0 && "border-danger ring-0")}>
      <div className="flex items-stretch">
        <button
          type="button"
          className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center text-[#a8b1bf] hover:bg-[#f4f6fa] hover:text-subtle active:cursor-grabbing"
          aria-label={`${field.label || "이름 없는 항목"} 순서 옮기기. 스페이스로 잡고 방향키로 옮깁니다.`}
          {...handle.attributes}
          {...(handle.listeners as React.HTMLAttributes<HTMLButtonElement>)}
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
        <button type="button" className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left" aria-expanded={open} onClick={onToggle}>
          <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", open ? "bg-primary text-white" : "bg-[#eef1f6] text-muted")}>
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={clsx("block font-semibold leading-6", !field.label && "text-[#9aa3b0]")}>{field.label || "이름 없는 항목"}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
              <span className="whitespace-nowrap">{FIELD_TYPE_LABEL[field.type]}</span>
              {field.required ? <span className="badge badge-danger min-h-5">필수</span> : null}
              {auto ? <span className="badge badge-primary min-h-5"><Sparkles className="size-3" aria-hidden="true" />자동 입력</span> : null}
              {field.reminderRule?.enabled ? <span className="badge badge-warn min-h-5"><BellRing className="size-3" aria-hidden="true" />알림</span> : null}
            </span>
          </span>
          <ChevronDown className={clsx("size-5 shrink-0 text-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      {errors.length > 0 && !open ? <p className="border-t border-line bg-danger-soft px-4 py-2 text-[13px] font-medium text-danger">{errors[0]}</p> : null}
      {open ? (
        <div className="grid gap-5 border-t border-line bg-[#fbfcfd] px-4 pb-4 pt-4 sm:px-5">
          <div className="grid gap-1.5">
            <label htmlFor={`label-${field.id}`} className="text-sm font-semibold">항목 이름</label>
            <TextInput
              id={`label-${field.id}`}
              autoFocus={autoFocus}
              placeholder="예: 방문 목적, 다음 연락일"
              aria-invalid={errors.some((message) => message.includes("항목 이름")) ? true : undefined}
              value={field.label}
              onChange={(event) => onChange({ label: event.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-semibold">입력 방식</p>
            <div className="grid grid-cols-3 gap-1.5">
              {FIELD_TYPES.map((type) => {
                const TypeIcon = TYPE_ICON[type];
                const active = field.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    className={clsx("flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors", active ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-white text-muted hover:border-line-strong")}
                    onClick={() => { if (!active) onChange((current) => changeFieldType(current, type)); }}
                  >
                    <TypeIcon className="size-[18px]" aria-hidden="true" />
                    <span className="text-[12.5px] font-semibold leading-4">{FIELD_TYPE_LABEL[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {usesOptions(field.type) ? <OptionsEditor field={field} error={optionError} onChange={onChange} /> : null}

          {field.type === "number" ? (
            <div className="grid gap-1.5">
              <label htmlFor={`unit-${field.id}`} className="text-sm font-semibold">단위 <span className="font-normal text-subtle">(선택)</span></label>
              <TextInput id={`unit-${field.id}`} className="w-40" placeholder="예: 개, 원, kg" value={field.unit} onChange={(event) => onChange({ unit: event.target.value })} />
            </div>
          ) : null}

          <div className="grid divide-y divide-line rounded-xl border border-line bg-white">
            <ToggleRow title="꼭 입력해야 하는 항목" description="비워 두면 방문 기록을 저장할 수 없습니다." checked={field.required} onChange={(checked) => onChange({ required: checked })} />
            {autoSource ? (
              <ToggleRow
                title={`${AUTO_FILL_LABEL[autoSource]} 자동으로 채우기`}
                description={autoSource === "accountName" ? "방문 기록을 쓸 때 거래처 이름이 미리 들어갑니다." : "방문 기록을 쓸 때 지난번 방문 날짜가 미리 들어갑니다."}
                checked={auto === autoSource}
                onChange={(checked) => onChange((current) => ({
                  ...current,
                  autoFill: checked ? autoSource : null,
                  reminderRule: checked && current.reminderRule ? { ...current.reminderRule, enabled: false } : current.reminderRule,
                }))}
              />
            ) : null}
            {usesReminder(field.type) && !auto ? (
              <div>
                <ToggleRow
                  title="이 날짜에 알림 받기"
                  description="방문 기록에 날짜를 넣으면 그날 알림이 만들어집니다."
                  checked={field.reminderRule?.enabled === true}
                  onChange={(checked) => onChange({ reminderRule: { enabled: checked, title: field.reminderRule?.title || field.label, leadDays: field.reminderRule?.leadDays ?? 1 } })}
                />
                {field.reminderRule?.enabled ? (
                  <div className="grid gap-3 border-t border-line bg-[#f6f8fb] px-4 py-3">
                    <div className="grid gap-1.5">
                      <label htmlFor={`reminder-title-${field.id}`} className="text-sm font-semibold">알림에 보일 이름</label>
                      <TextInput id={`reminder-title-${field.id}`} placeholder={field.label || "예: 다음 연락"} value={field.reminderRule.title} onChange={(event) => onChange({ reminderRule: { enabled: true, title: event.target.value, leadDays: field.reminderRule?.leadDays ?? 1 } })} />
                    </div>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <NumberBox id={`reminder-lead-${field.id}`} label="미리 알림 일수" min={0} value={field.reminderRule.leadDays} onChange={(value) => onChange({ reminderRule: { enabled: true, title: field.reminderRule?.title ?? "", leadDays: value } })} />
                      일 전부터 미리 알려 주기
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3">
            <button type="button" className="flex w-fit items-center gap-1 text-sm font-semibold text-subtle hover:text-ink" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
              <ChevronDown className={clsx("size-4 transition-transform", advanced ? "rotate-180" : "-rotate-90")} aria-hidden="true" />
              안내 문구 넣기
            </button>
            {advanced ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label htmlFor={`help-${field.id}`} className="text-sm font-semibold">항목 아래 도움말</label>
                  <TextInput id={`help-${field.id}`} placeholder="예: 가장 가까운 것을 고르세요" value={field.helpText} onChange={(event) => onChange({ helpText: event.target.value })} />
                </div>
                {field.type === "text" || field.type === "textarea" || field.type === "number" ? (
                  <div className="grid gap-1.5">
                    <label htmlFor={`placeholder-${field.id}`} className="text-sm font-semibold">입력칸 예시 문구</label>
                    <TextInput id={`placeholder-${field.id}`} placeholder="입력칸에 흐리게 보이는 글자" value={field.placeholder} onChange={(event) => onChange({ placeholder: event.target.value })} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex gap-1">
              <IconButton label="위로 옮기기" variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp aria-hidden="true" /></IconButton>
              <IconButton label="아래로 옮기기" variant="ghost" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown aria-hidden="true" /></IconButton>
              <IconButton label="복제" variant="ghost" size="sm" onClick={onDuplicate}><Copy aria-hidden="true" /></IconButton>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="danger" onClick={onDelete}><Trash2 aria-hidden="true" />삭제</Button>
              <Button type="button" size="sm" variant="soft" onClick={onToggle}>완료</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[13px] text-subtle">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function OptionsEditor({ field, error, onChange }: { field: TemplateField; error?: string; onChange: (patch: Partial<TemplateField> | ((field: TemplateField) => TemplateField)) => void }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`option-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId]);

  function addAfter(index: number) {
    const option = { id: createId("o"), label: "" };
    onChange((current) => {
      const options = current.options.slice();
      options.splice(index + 1, 0, option);
      return { ...current, options };
    });
    setFocusId(option.id);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">보기</p>
        <p className="text-xs text-subtle">Enter를 누르면 다음 보기가 추가됩니다.</p>
      </div>
      <ul className="grid gap-1.5">
        {field.options.map((option, index) => (
          <li key={option.id} className="flex items-center gap-1.5">
            <span className="grid size-6 shrink-0 place-items-center text-xs font-bold text-subtle">{index + 1}</span>
            <TextInput
              id={`option-${option.id}`}
              aria-label={`보기 ${index + 1}`}
              placeholder={`보기 ${index + 1}`}
              className="h-10 min-h-10"
              value={option.label}
              onChange={(event) => onChange((current) => ({ ...current, options: current.options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) }))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addAfter(index);
                }
                if (event.key === "Backspace" && !option.label && field.options.length > 1) {
                  event.preventDefault();
                  const previous = field.options[index - 1] ?? field.options[index + 1];
                  onChange((current) => ({ ...current, options: current.options.filter((item) => item.id !== option.id) }));
                  if (previous) setFocusId(previous.id);
                }
              }}
            />
            <IconButton label="위로" variant="ghost" size="sm" className="hidden sm:inline-flex" disabled={index === 0} onClick={() => onChange((current) => ({ ...current, options: moveItem(current.options, index, index - 1) }))}><ArrowUp aria-hidden="true" /></IconButton>
            <IconButton label="보기 지우기" variant="ghost" size="sm" onClick={() => onChange((current) => ({ ...current, options: current.options.filter((item) => item.id !== option.id) }))}><X aria-hidden="true" /></IconButton>
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" variant="ghost" className="w-fit text-primary" onClick={() => addAfter(field.options.length - 1)}><Plus aria-hidden="true" />보기 추가</Button>
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function AddFieldPanel({ existing, onAdd }: { existing: TemplateField[]; onAdd: (field: TemplateField) => void }) {
  const labels = new Set(existing.map((field) => field.label.trim()));
  return (
    <div className="grid gap-4 rounded-2xl border-2 border-dashed border-[#c9d3e3] bg-white/60 p-4">
      <p className="flex items-center gap-1.5 font-bold"><Plus className="size-[18px] text-primary" aria-hidden="true" />항목 추가</p>
      <div className="grid gap-2">
        <p className="section-title">자주 쓰는 항목 · 한 번에 추가</p>
        <div className="flex flex-wrap gap-2">
          {FIELD_PRESETS.map((preset) => {
            const added = labels.has(preset.label);
            return (
              <button key={preset.id} type="button" className="chip" disabled={added} title={preset.hint} onClick={() => onAdd(preset.build())}>
                {added ? <Check className="text-subtle" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                <span className={added ? "text-subtle" : ""}>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2">
        <p className="section-title">직접 만들기 · 입력 방식 고르기</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FIELD_TYPES.map((type) => {
            const Icon = TYPE_ICON[type];
            return (
              <button key={type} type="button" className="flex min-h-14 items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary-soft" onClick={() => onAdd(createField(type))}>
                <Icon className="size-[18px] shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-5">{FIELD_TYPE_LABEL[type]}</span>
                  <span className="block text-xs leading-4 text-subtle">{FIELD_TYPE_HINT[type]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
