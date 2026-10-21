"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import { Archive, ArchiveRestore, BellRing, ChevronDown, Copy, FilePlus2, FileText, LayoutTemplate, MoreHorizontal, Pencil, Plus, Sparkles } from "lucide-react";
import { DEFAULT_TEMPLATE_ID, STARTER_TEMPLATE } from "@shared/starterTemplate";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data";
import type { TemplateRecord } from "@/lib/records";
import { ensureDefaultTemplate, setTemplateArchived } from "@/lib/writes";
import { Modal, useToast } from "@/components/Providers";
import { Button, EmptyState, PageHeader } from "@/components/ui";

function sortTemplates(list: TemplateRecord[]) {
  return list.slice().sort((a, b) => Number(b.id === DEFAULT_TEMPLATE_ID) - Number(a.id === DEFAULT_TEMPLATE_ID) || a.name.localeCompare(b.name, "ko"));
}

export default function TemplatesPage() {
  const { templates, templatesCapped, templatesLoading } = useData();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [startOpen, setStartOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const active = sortTemplates(templates.filter((template) => !template.archived));
  const archived = sortTemplates(templates.filter((template) => template.archived));

  async function archive(template: TemplateRecord, next: boolean) {
    if (!user) return;
    try {
      await setTemplateArchived(user.uid, template.id, next);
      toast(next ? `"${template.name}"을 보관했습니다.` : `"${template.name}"을 다시 사용합니다.`);
    } catch {
      toast("변경하지 못했습니다.", "error");
    }
  }

  async function restoreDefault() {
    if (!user) return;
    setRestoring(true);
    await ensureDefaultTemplate(user.uid).catch(() => toast("기본 템플릿을 만들지 못했습니다.", "error"));
    setRestoring(false);
  }

  function start(from: string) {
    setStartOpen(false);
    router.push(`/templates/new?from=${encodeURIComponent(from)}`);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-4xl gap-5 p-4 pb-10 lg:p-8">
        <PageHeader
          title="템플릿"
          description="방문 기록을 쓸 때 채우는 양식입니다. 기본 템플릿을 내 방식대로 고치거나 새로 만들 수 있습니다."
          actions={<Button type="button" variant="primary" onClick={() => setStartOpen(true)}><Plus aria-hidden="true" />새 템플릿</Button>}
        />
        {templatesCapped ? <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">템플릿은 100개까지만 불러왔습니다.</p> : null}

        {templatesLoading && templates.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((key) => <div key={key} className="card h-40 animate-pulse bg-[#f7f8fb]" />)}
          </div>
        ) : null}

        {!templatesLoading && active.length === 0 ? (
          <div className="card">
            <EmptyState icon={<LayoutTemplate aria-hidden="true" />} title="사용 중인 템플릿이 없습니다" description="기본 템플릿을 추가하면 바로 방문 기록을 쓸 수 있습니다.">
              {!templates.some((template) => template.id === DEFAULT_TEMPLATE_ID) ? (
                <Button type="button" variant="primary" disabled={restoring} onClick={restoreDefault}><Sparkles aria-hidden="true" />기본 템플릿 추가</Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => setStartOpen(true)}>새 템플릿 만들기</Button>
            </EmptyState>
          </div>
        ) : null}

        {active.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((template) => (
              <li key={template.id}>
                <TemplateCard template={template} onCopy={() => start(template.id)} onArchive={() => archive(template, true)} />
              </li>
            ))}
            <li>
              <button type="button" className="grid h-full min-h-40 w-full place-items-center rounded-2xl border-2 border-dashed border-[#c9d3e3] p-4 text-subtle transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary" onClick={() => setStartOpen(true)}>
                <span className="grid justify-items-center gap-1.5">
                  <FilePlus2 className="size-6" aria-hidden="true" />
                  <span className="font-semibold">새 템플릿 만들기</span>
                </span>
              </button>
            </li>
          </ul>
        ) : null}

        {archived.length > 0 ? (
          <section className="grid gap-3">
            <button type="button" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-subtle hover:text-ink" aria-expanded={archivedOpen} onClick={() => setArchivedOpen((open) => !open)}>
              <ChevronDown className={clsx("size-4 transition-transform", archivedOpen ? "" : "-rotate-90")} aria-hidden="true" />
              보관한 템플릿 {archived.length}개
            </button>
            {archivedOpen ? (
              <ul className="grid gap-2">
                {archived.map((template) => (
                  <li key={template.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
                    <Link href={`/templates/${template.id}`} className="min-w-0 font-medium text-muted hover:underline">{template.name}</Link>
                    <Button type="button" size="sm" variant="secondary" onClick={() => archive(template, false)}><ArchiveRestore aria-hidden="true" />다시 사용</Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>

      <Modal open={startOpen} title="새 템플릿 만들기" description="어떻게 시작할지 골라 주세요. 만든 뒤에도 자유롭게 고칠 수 있습니다." onOpenChange={setStartOpen} wide>
        <div className="grid gap-2.5">
          <StartOption
            icon={<Sparkles aria-hidden="true" />}
            title="기본 템플릿에서 시작"
            badge="추천"
            description="자주 쓰는 항목이 미리 들어 있습니다."
            onClick={() => start("starter")}
          >
            <span className="mt-2 flex flex-wrap gap-1">
              {STARTER_TEMPLATE.fields.map((field) => <span key={field.id} className="badge">{field.label}</span>)}
            </span>
          </StartOption>
          <StartOption icon={<FileText aria-hidden="true" />} title="빈 양식에서 시작" description="메모 항목 하나만 있는 상태에서 직접 구성합니다." onClick={() => start("blank")} />
          {active.length > 0 ? (
            <div className="grid gap-2 rounded-2xl border border-line p-4">
              <p className="flex items-center gap-2 font-bold"><Copy className="size-[18px] text-primary" aria-hidden="true" />내 템플릿 복사해서 시작</p>
              <div className="flex flex-wrap gap-2">
                {active.map((template) => <button key={template.id} type="button" className="chip" onClick={() => start(template.id)}>{template.name}</button>)}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function StartOption({ icon, title, badge, description, onClick, children }: { icon: React.ReactNode; title: string; badge?: string; description: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" className="flex w-full items-start gap-3 rounded-2xl border border-line p-4 text-left transition-colors hover:border-primary hover:bg-[#f7f9ff]" onClick={onClick}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-bold">{title}{badge ? <span className="badge badge-primary">{badge}</span> : null}</span>
        <span className="block text-sm text-subtle">{description}</span>
        {children}
      </span>
    </button>
  );
}

function TemplateCard({ template, onCopy, onArchive }: { template: TemplateRecord; onCopy: () => void; onArchive: () => void }) {
  const isDefault = template.id === DEFAULT_TEMPLATE_ID;
  return (
    <article className="card flex h-full flex-col p-4 transition-shadow hover:shadow-panel">
      <div className="flex items-start gap-3">
        <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl", isDefault ? "bg-primary text-white" : "bg-primary-soft text-primary")}>
          <LayoutTemplate className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="font-bold leading-6">{template.name}</h2>
            {isDefault ? <span className="badge badge-primary">기본</span> : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-subtle">{template.description || "설명 없음"}</p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1" aria-label={`${template.name} 메뉴`}><MoreHorizontal aria-hidden="true" /></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end">
              <DropdownMenu.Item className="menu-item" onSelect={onCopy}><Copy aria-hidden="true" />복사해서 새로 만들기</DropdownMenu.Item>
              <DropdownMenu.Item className="menu-item" onSelect={onArchive}><Archive aria-hidden="true" />보관하기</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {template.revisitRule.enabled ? <span className="badge badge-warn"><BellRing className="size-3" aria-hidden="true" />{template.revisitRule.daysAfterVisit}일 뒤 재방문 알림</span> : <span className="badge">재방문 알림 없음</span>}
        <span className="badge">버전 {template.currentVersionNumber}</span>
      </div>
      <div className="mt-auto pt-4">
        <Link href={`/templates/${template.id}`} className="btn btn-secondary w-full"><Pencil aria-hidden="true" />항목 편집</Link>
      </div>
    </article>
  );
}
