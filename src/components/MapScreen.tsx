"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Bell, Building2, ChevronDown, ChevronRight, FileText, Info, List, Map as MapIcon, Maximize2, PanelLeftClose, PanelLeftOpen, Plus, SlidersHorizontal, X } from "lucide-react";
import { countActiveFilters, earliestOpenDue, EMPTY_FILTERS, matchAccount, sortAccounts, summarize, toggleValue, type AlertFilter, type FilterState, type VisitFilter } from "@shared/filters";
import { SALES_STATUS_LABEL, TIME_STATUS_LABEL, visitLabel, VISIT_TONE_LABEL } from "@shared/labels";
import { getReminderTimeStatus, pickAlertBadge } from "@shared/reminderStatus";
import { bandCaption, visitTone } from "@shared/visitBands";
import type { AlertKind } from "@shared/types";
import { useData } from "@/lib/data";
import { kakaoAppKey } from "@/lib/firebase";
import { accountDraftHref, type MapPlace } from "@/lib/kakao";
import { useDebounced, useMediaQuery, useNow } from "@/lib/hooks";
import { sanitizeView } from "@/lib/mapState";
import { useMapUi } from "@/lib/mapUi";
import type { AccountRecord, ReminderRecord } from "@/lib/records";
import { ALERT_COLOR, TONE_COLOR } from "@/lib/tones";
import { confirmLeave } from "@/lib/unsaved";
import { AccountPanel, AccountSummary } from "./AccountPanel";
import { VisitForm } from "./VisitForm";
import { KakaoMap, type MapMarker } from "./KakaoMap";
import { Modal, useToast } from "./Providers";
import { Button, IconButton, SelectInput, Switch } from "./ui";

type StatKind = "overdue" | "today" | "never" | "old";

const ALERT_BADGE_CLASS: Record<AlertKind, string> = {
  overdue: "badge-danger",
  today: "badge-primary",
  soon: "badge-warn",
};

const VISIT_FILTER_TONES: VisitFilter[] = ["never", "recent", "normal", "warning", "old"];
const ALERT_FILTERS: Array<{ id: AlertFilter; label: string }> = [
  { id: "overdue", label: "지연된 알림" },
  { id: "today", label: "오늘 알림" },
  { id: "soon", label: "곧 다가올 알림" },
];

function accountBadge(accountId: string, reminders: ReminderRecord[], now: Date) {
  const statuses = reminders.filter((reminder) => reminder.accountId === accountId).map((reminder) => getReminderTimeStatus({ dueAt: reminder.dueAt, allDay: reminder.allDay, leadDays: reminder.leadDays, now }));
  return pickAlertBadge(statuses);
}

function statActive(filters: FilterState, kind: StatKind) {
  const onlyVisit = filters.alert.length === 0 && filters.visit.length === 1;
  const onlyAlert = filters.visit.length === 0 && filters.alert.length === 1;
  if (kind === "never" || kind === "old") return onlyVisit && filters.visit[0] === kind;
  return onlyAlert && filters.alert[0] === kind;
}

export function MapScreen() {
  const { accounts, reminders, bands, loading, error, accountsCapped, remindersCapped } = useData();
  const mapUi = useMapUi();
  const now = useNow();
  const router = useRouter();
  const toast = useToast();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const debouncedQuery = useDebounced(mapUi.searchMode === "accounts" ? mapUi.filters.query : "");
  const filters = { ...mapUi.filters, query: debouncedQuery };
  const [listOpen, setListOpen] = useState(true);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [snap, setSnap] = useState<"peek" | "mid" | "full">("mid");
  const [fitToken, setFitToken] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [clusterIds, setClusterIds] = useState<string[] | null>(null);
  const [writingId, setWritingId] = useState<string | null>(null);
  const [visitRevision, setVisitRevision] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const userMoved = useRef(false);
  const fitted = useRef(false);
  const visible = useMemo(() => {
    const matched = accounts.filter((account) => matchAccount(account, reminders, filters, bands, mapUi.bounds, now));
    const due = new Map(matched.map((account) => [account.id, earliestOpenDue(account.id, reminders)]));
    return sortAccounts(matched, filters.sort, due);
  }, [accounts, reminders, filters, bands, mapUi.bounds, now]);
  const selected = accounts.find((account) => account.id === mapUi.accountId) ?? null;
  const summary = summarize(accounts, reminders, bands, now);
  const activeCount = countActiveFilters(mapUi.filters);
  const hasAccounts = accounts.some((account) => !account.archived);
  const markers = useMemo<MapMarker[]>(() => visible.map((account) => {
    const tone = visitTone(account.lastVisitAt, bands, now);
    const badge = accountBadge(account.id, reminders, now);
    return {
      id: account.id,
      lat: account.lat,
      lng: account.lng,
      color: TONE_COLOR[tone.tone],
      badgeKey: tone.tone,
      badgeLabel: VISIT_TONE_LABEL[tone.tone],
      alertKey: badge.kind,
      alertLabel: badge.kind ? TIME_STATUS_LABEL[badge.kind] : null,
      alertCount: badge.kind ? badge.count : 0,
      alertColor: badge.kind ? ALERT_COLOR[badge.kind] : null,
      label: `${account.name}, ${VISIT_TONE_LABEL[tone.tone]}, ${visitLabel(tone.days)}${badge.kind ? `, ${TIME_STATUS_LABEL[badge.kind]} 알림 ${badge.count}건` : ""}`,
    };
  }), [visible, reminders, bands, now]);

  useEffect(() => {
    if (!mapUi.hydrated || !mapReady || loading || fitted.current) return;
    fitted.current = true;
    if (userMoved.current || mapUi.restored || markers.length === 0) return;
    setFitToken((token) => token + 1);
  }, [mapUi.hydrated, mapUi.restored, mapReady, loading, markers.length]);

  useEffect(() => {
    if (!mapUi.pickedPlace) return;
    setMode("map");
    setSnap("peek");
  }, [mapUi.pickedPlace]);

  function selectAccount(id: string) {
    mapUi.setAccountId(id);
    setMode("map");
    setSnap((current) => current === "peek" ? "mid" : current);
  }

  function writeVisit(accountId: string) {
    setWritingId(accountId);
  }

  function closeVisit() {
    if (!confirmLeave()) return;
    setWritingId(null);
  }

  function applyStat(kind: StatKind) {
    if (statActive(mapUi.filters, kind)) {
      mapUi.setFilters({ ...mapUi.filters, visit: [], alert: [] });
      return;
    }
    mapUi.setFilters({
      ...mapUi.filters,
      visit: kind === "never" || kind === "old" ? [kind] : [],
      alert: kind === "today" || kind === "overdue" ? [kind] : [],
    });
  }

  function resetFilters() {
    mapUi.setFilters({ ...EMPTY_FILTERS, sort: mapUi.filters.sort });
  }

  const stats: Array<{ kind: StatKind; label: string; value: number; sub?: string; tone: string }> = [
    { kind: "overdue", label: "지연 알림", value: summary.overdueAccounts, sub: summary.overdueReminders ? `${summary.overdueReminders}건` : undefined, tone: "text-danger" },
    { kind: "today", label: "오늘 알림", value: summary.todayAccounts, sub: summary.todayReminders ? `${summary.todayReminders}건` : undefined, tone: "text-primary" },
    { kind: "never", label: "미방문", value: summary.never, tone: "text-ink" },
    { kind: "old", label: "장기 미방문", value: summary.old, tone: "text-warn" },
  ];

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      {(accountsCapped || remindersCapped) ? (
        <p className="border-b border-[#f3dcb5] bg-warn-soft px-4 py-2 text-[13px] text-warn">
          {accountsCapped ? "거래처는 이름순 500곳까지만 불러왔습니다. " : ""}
          {remindersCapped ? "미완료 알림은 예정일순 500건까지만 상태 계산에 포함됩니다." : ""}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {hasAccounts ? (
          <>
            <div className="grid grid-cols-2 gap-2 px-4 pt-3">
              {stats.map((stat) => {
                const active = statActive(mapUi.filters, stat.kind);
                return (
                  <button
                    key={stat.kind}
                    type="button"
                    aria-pressed={active}
                    className={clsx("flex min-h-[64px] flex-col justify-center rounded-xl border px-3 py-2 text-left transition-colors", active ? "border-primary bg-primary-soft" : "border-line bg-white hover:bg-[#f7f8fb]")}
                    onClick={() => applyStat(stat.kind)}
                  >
                    <span className="whitespace-nowrap text-[13px] font-medium text-subtle">{stat.label}</span>
                    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className={clsx("text-xl font-bold", stat.value > 0 ? stat.tone : "text-[#9aa3b0]")}>{stat.value}</span>
                      <span className="text-[13px] text-subtle">곳{stat.sub ? ` · ${stat.sub}` : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold" aria-live="polite">
                거래처 {visible.length}곳
                {activeCount || mapUi.filters.query ? <button type="button" className="ml-2 text-[13px] font-medium text-primary underline-offset-2 hover:underline" onClick={resetFilters}>조건 지우기</button> : null}
              </p>
              <label className="shrink-0">
                <span className="sr-only">정렬</span>
                <SelectInput className="h-9 min-h-9 w-auto rounded-lg py-0 pl-2.5 pr-8 text-sm" value={filters.sort} onChange={(event) => mapUi.setFilters({ ...mapUi.filters, sort: event.target.value as typeof filters.sort })}>
                  <option value="oldest">오래 안 간 순</option>
                  <option value="recent">최근 방문순</option>
                  <option value="reminder">알림 빠른 순</option>
                  <option value="name">이름순</option>
                </SelectInput>
              </label>
              <Button type="button" size="sm" variant={activeCount ? "soft" : "secondary"} onClick={() => setFilterOpen(true)}>
                <SlidersHorizontal aria-hidden="true" />필터{activeCount ? ` ${activeCount}` : ""}
              </Button>
            </div>
          </>
        ) : null}
        {loading ? <p className="px-4 py-6 text-sm text-subtle">거래처를 불러오는 중</p> : null}
        {!loading && !hasAccounts && !mapUi.filters.archivedOnly ? <Onboarding onAdd={() => router.push("/accounts/new")} onTemplates={() => router.push("/templates")} /> : null}
        {!loading && hasAccounts && visible.length === 0 ? (
          <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
            <p className="font-semibold">{mapUi.filters.query ? "검색 결과가 없습니다" : "조건에 맞는 거래처가 없습니다"}</p>
            <Button type="button" size="sm" variant="secondary" onClick={resetFilters}>조건 지우기</Button>
          </div>
        ) : null}
        <ul className="divide-y divide-line">
          {visible.map((account) => (
            <AccountRow key={account.id} account={account} selected={account.id === mapUi.accountId} onSelect={() => selectAccount(account.id)} />
          ))}
        </ul>
      </div>
    </div>
  );

  if (!mapUi.hydrated) return <div className="h-full bg-bg" />;

  const sheetHeight = snap === "peek" ? "200px" : snap === "mid" ? "50%" : "calc(100% - 8px)";

  return (
    <div className="flex h-full min-h-0">
      {listOpen ? (
        <aside className="hidden w-[360px] shrink-0 flex-col border-r border-line bg-white lg:flex">
          <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-4">
            <h1 className="whitespace-nowrap text-lg font-bold">내 거래처</h1>
            <Button type="button" size="sm" variant="primary" onClick={() => router.push("/accounts/new")}><Plus aria-hidden="true" />거래처 추가</Button>
          </div>
          <div className="min-h-0 flex-1">{list}</div>
        </aside>
      ) : null}
      <div className="relative min-w-0 flex-1">
        <KakaoMap
          appKey={kakaoAppKey()}
          markers={markers}
          selectedId={mapUi.accountId}
          initialView={mapUi.view}
          fitToken={fitToken}
          onSelect={selectAccount}
          onView={(view) => {
            mapUi.setView(sanitizeView(view));
            mapUi.setBounds(view.bounds);
          }}
          onUserMove={() => { userMoved.current = true; }}
          onReady={() => setMapReady(true)}
          onCluster={setClusterIds}
          onError={(message) => toast(message, "error")}
          place={mapUi.pickedPlace}
          focus={mapUi.focus}
          padding={{ top: 72, left: 24, bottom: desktop ? 24 : 230, right: selected && desktop ? 440 : 72 }}
          controlsRight={selected && desktop ? 434 : 12}
        />
        {error ? <p role="alert" className="absolute left-3 right-16 top-16 z-10 rounded-xl bg-white px-3 py-2 text-sm text-danger shadow-float">{error}</p> : null}

        <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
          <div className="seg shadow-float lg:hidden" role="group" aria-label="보기 방식">
            <button type="button" aria-pressed={mode === "map"} onClick={() => setMode("map")}><span className="flex items-center gap-1.5"><MapIcon className="size-4" aria-hidden="true" />지도</span></button>
            <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")}><span className="flex items-center gap-1.5"><List className="size-4" aria-hidden="true" />목록</span></button>
          </div>
          {mode === "list" && !desktop ? null : (
            <>
              <IconButton label="전체 거래처 보기" className="shadow-float lg:hidden" onClick={() => { userMoved.current = true; setFitToken((token) => token + 1); }}>
                <Maximize2 aria-hidden="true" />
              </IconButton>
              <IconButton label="배지 안내" className="shadow-float lg:hidden" onClick={() => setLegendOpen(true)}>
                <Info aria-hidden="true" />
              </IconButton>
            </>
          )}
          <IconButton label={listOpen ? "목록 접기" : "목록 펼치기"} className="hidden shadow-float lg:inline-flex" onClick={() => setListOpen((open) => !open)}>
            {listOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
          </IconButton>
          <Button type="button" variant="secondary" className="hidden shadow-float lg:inline-flex" onClick={() => { userMoved.current = true; setFitToken((token) => token + 1); }}>
            <Maximize2 aria-hidden="true" />전체 거래처 보기
          </Button>
        </div>

        <div className="absolute bottom-4 left-3 z-10 hidden rounded-xl border border-line bg-white/95 shadow-float backdrop-blur lg:block">
          <button type="button" className="flex w-full items-center justify-between gap-6 px-3 py-2 text-[13px] font-bold" aria-expanded={legendExpanded} onClick={() => setLegendExpanded((open) => !open)}>
            배지 안내
            <ChevronDown className={clsx("size-4 transition-transform", legendExpanded ? "" : "-rotate-90")} aria-hidden="true" />
          </button>
          {legendExpanded ? <Legend className="px-3 pb-3" compact /> : null}
        </div>

        {mapUi.pickedPlace && (desktop || mode === "map") ? (
          <PlaceCard
            place={mapUi.pickedPlace}
            accounts={accounts}
            onClose={() => mapUi.pickPlace(null)}
            onOpen={(id) => selectAccount(id)}
            onRegister={() => {
              const place = mapUi.pickedPlace;
              if (!place || !confirmLeave()) return;
              router.push(accountDraftHref(place));
            }}
          />
        ) : null}

        {selected ? (
          <aside className="absolute inset-y-3 right-3 z-20 hidden w-[410px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-float lg:flex">
            <AccountPanel account={selected} refreshKey={visitRevision} onClose={() => mapUi.setAccountId(null)} onWriteVisit={() => writeVisit(selected.id)} />
          </aside>
        ) : null}

        {!desktop && mode === "list" ? (
          <div className="absolute inset-0 z-20 flex flex-col bg-white pt-[60px]">
            {list}
            <button type="button" className="btn btn-primary absolute bottom-4 right-4 h-14 rounded-full px-5 shadow-float" onClick={() => router.push("/accounts/new")}>
              <Plus aria-hidden="true" />거래처 추가
            </button>
          </div>
        ) : null}

        {!desktop && mode === "map" ? (
          <>
            {!selected ? (
              <button type="button" className="btn btn-primary absolute right-3 z-10 h-12 rounded-full px-4 shadow-float" style={{ bottom: `calc(${sheetHeight} + 12px)` }} onClick={() => router.push("/accounts/new")}>
                <Plus aria-hidden="true" />거래처 추가
              </button>
            ) : null}
            <section className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[20px] border-t border-line bg-white shadow-[0_-6px_24px_rgba(15,23,42,0.12)]" style={{ height: sheetHeight }}>
              <div
                className="flex h-7 shrink-0 cursor-grab items-center justify-center"
                style={{ touchAction: "none" }}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={snap === "peek" ? 0 : snap === "mid" ? 1 : 2}
                aria-label="하단 목록 높이"
                tabIndex={0}
                onPointerDown={(event) => { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); event.currentTarget.dataset.start = String(event.clientY); }}
                onPointerUp={(event) => {
                  const start = Number(event.currentTarget.dataset.start ?? event.clientY);
                  const delta = event.clientY - start;
                  const order = ["full", "mid", "peek"] as const;
                  const index = order.indexOf(snap);
                  if (Math.abs(delta) < 6) setSnap(snap === "peek" ? "mid" : snap === "mid" ? "full" : "mid");
                  else if (delta > 40 && index < order.length - 1) setSnap(order[index + 1]);
                  else if (delta < -40 && index > 0) setSnap(order[index - 1]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") setSnap(snap === "peek" ? "mid" : "full");
                  if (event.key === "ArrowDown") setSnap(snap === "full" ? "mid" : "peek");
                }}
              >
                <span className="h-1.5 w-10 rounded-full bg-[#cbd2dc]" />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {selected && snap === "peek" ? <AccountSummary account={selected} onWriteVisit={() => writeVisit(selected.id)} onClose={() => mapUi.setAccountId(null)} /> : null}
                {selected && snap !== "peek" ? <AccountPanel account={selected} refreshKey={visitRevision} onClose={() => mapUi.setAccountId(null)} onWriteVisit={() => writeVisit(selected.id)} /> : null}
                {!selected ? list : null}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <Modal
        open={Boolean(writingId)}
        composer
        title="방문 기록 작성"
        description={accounts.find((account) => account.id === writingId)?.name ?? "방문 내용"}
        onOpenChange={(open) => { if (!open) closeVisit(); }}
      >
        {writingId ? <VisitForm key={writingId} accountId={writingId} presentation="modal" onDone={() => { setVisitRevision((value) => value + 1); setWritingId(null); }} /> : null}
      </Modal>
      <Modal open={legendOpen} title="배지 안내" description="배지는 마지막 방문 후 지난 기간입니다. 지도를 축소하면 가까운 배지가 이름과 개수로 합쳐지고, 누르면 그 구간이 확대됩니다." onOpenChange={setLegendOpen}>
        <Legend />
      </Modal>
      <Modal open={filterOpen} title="거래처 필터" description="같은 묶음 안에서는 하나라도 맞으면, 묶음끼리는 모두 맞아야 표시됩니다." onOpenChange={setFilterOpen}>
        <FilterDetails />
        <div className="sticky bottom-0 -mx-5 mt-4 flex items-center justify-between gap-3 border-t border-line bg-white px-5 pt-3">
          <Button type="button" variant="ghost" onClick={resetFilters}>모두 지우기</Button>
          <Button type="button" variant="primary" onClick={() => setFilterOpen(false)}>거래처 {visible.length}곳 보기</Button>
        </div>
      </Modal>
      <Modal open={Boolean(clusterIds)} title="이 위치의 거래처" onOpenChange={() => setClusterIds(null)}>
        <ul className="grid gap-2">
          {accounts.filter((account) => clusterIds?.includes(account.id)).map((account) => (
            <li key={account.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-[#f7f8fb]" onClick={() => { selectAccount(account.id); setClusterIds(null); }}>
                <span className="font-semibold">{account.name}</span>
                <ChevronRight className="size-4 text-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function AccountRow({ account, selected, onSelect }: { account: AccountRecord; selected: boolean; onSelect: () => void }) {
  const { reminders, bands } = useData();
  const now = useNow();
  const tone = visitTone(account.lastVisitAt, bands, now);
  const badge = accountBadge(account.id, reminders, now);
  return (
    <li>
      <button type="button" aria-pressed={selected} className={clsx("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", selected ? "bg-primary-soft" : "hover:bg-[#f7f8fb]")} onClick={onSelect}>
        <span className="mt-1.5 size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: TONE_COLOR[tone.tone], boxShadow: `0 0 0 1px ${TONE_COLOR[tone.tone]}55` }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="font-semibold leading-6">{account.name}</span>
            {badge.kind ? <span className={clsx("badge mt-0.5 shrink-0", ALERT_BADGE_CLASS[badge.kind])}>{TIME_STATUS_LABEL[badge.kind]} {badge.count}</span> : null}
          </span>
          <span className="block truncate text-[13px] text-subtle">{account.address || "주소 없음"}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="whitespace-nowrap font-medium" style={{ color: TONE_COLOR[tone.tone] }}>{visitLabel(tone.days)}</span>
            <span className="text-[#c4cad3]" aria-hidden="true">·</span>
            <span className="whitespace-nowrap text-subtle">{SALES_STATUS_LABEL[account.salesStatus]}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function Onboarding({ onAdd, onTemplates }: { onAdd: () => void; onTemplates: () => void }) {
  const steps = [
    { icon: Building2, title: "거래처 등록", text: "상호나 주소로 검색하면 지도에 바로 표시됩니다." },
    { icon: FileText, title: "방문 기록", text: "기본 템플릿이 준비되어 있어 바로 기록할 수 있습니다." },
    { icon: Bell, title: "알림 받기", text: "다음 연락일을 넣으면 그날 알림으로 알려 드립니다." },
  ];
  return (
    <div className="grid gap-4 px-4 py-5">
      <div>
        <p className="text-lg font-bold">첫 거래처를 등록해 보세요</p>
        <p className="mt-1 text-sm text-subtle">세 단계면 지도에서 거래처를 관리할 수 있습니다.</p>
      </div>
      <ol className="grid gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="size-[18px]" aria-hidden="true" /></span>
              <span>
                <span className="block text-sm font-bold">{index + 1}. {step.title}</span>
                <span className="block text-[13px] text-subtle">{step.text}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="grid gap-2">
        <Button type="button" variant="primary" onClick={onAdd}><Plus aria-hidden="true" />첫 거래처 등록하기</Button>
        <Button type="button" variant="ghost" onClick={onTemplates}>기본 템플릿 살펴보기</Button>
      </div>
    </div>
  );
}

function Legend({ className, compact }: { className?: string; compact?: boolean }) {
  const { bands } = useData();
  return (
    <div className={className}>
      <ul className={clsx("grid", compact ? "gap-1.5" : "gap-2")}>
        {bandCaption(bands).map((item) => (
          <li key={item.tone} className={clsx("flex items-center gap-2.5", compact ? "text-[13px]" : "min-h-10")}>
            <span className="size-3 shrink-0 rounded-full" style={{ background: TONE_COLOR[item.tone] }} />
            <span className="whitespace-nowrap font-semibold">{VISIT_TONE_LABEL[item.tone]}</span>
            <span className="whitespace-nowrap text-subtle">{item.label}</span>
          </li>
        ))}
      </ul>
      {!compact ? <p className="mt-4 rounded-xl bg-[#f4f6fa] p-3 text-sm text-muted">지도의 거래처는 이 배지로 표시됩니다. 알림이 있으면 지연, 오늘, 임박 배지가 함께 붙습니다. 지도를 축소해 거래처가 가까워지면 같은 배지가 개수로 합쳐지고, 그 묶음을 누르면 해당 구간이 커집니다.</p> : null}
    </div>
  );
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function PlaceCard({
  place,
  accounts,
  onClose,
  onOpen,
  onRegister,
}: {
  place: MapPlace;
  accounts: AccountRecord[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onRegister: () => void;
}) {
  const nearby = accounts.find((account) => !account.archived && metersBetween(account, place) < 80);
  return (
    <div className="absolute left-3 top-16 z-30 w-[min(22rem,calc(100%-4.5rem))] rounded-2xl border border-line bg-white p-3 shadow-float">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-6">{place.name}</p>
          {place.address ? <p className="text-[13px] leading-5 text-subtle">{place.address}</p> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm shrink-0" aria-label="검색 위치 닫기" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      {nearby ? (
        <p className="mt-2 text-[13px] text-muted">
          근처에 등록된 거래처가 있습니다.{" "}
          <button type="button" className="font-bold text-primary hover:underline" onClick={() => onOpen(nearby.id)}>{nearby.name}</button>
        </p>
      ) : <p className="mt-2 text-[13px] text-subtle">이 장소를 내 거래처로 등록할 수 있습니다.</p>}
      <Button type="button" variant="primary" className="mt-3 w-full" onClick={onRegister}><Plus aria-hidden="true" />거래처로 등록</Button>
    </div>
  );
}

function ChipGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-bold">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function FilterDetails() {
  const { accounts, templates, bands } = useData();
  const mapUi = useMapUi();
  const tags = [...new Set(accounts.flatMap((account) => account.tags))].sort((a, b) => a.localeCompare(b, "ko"));
  const filters = mapUi.filters;
  const captions = bandCaption(bands);
  const activeTemplates = templates.filter((template) => !template.archived);
  return (
    <div className="grid gap-5">
      <ChipGroup title="방문 경과">
        {VISIT_FILTER_TONES.map((tone) => {
          const key = tone === "never" ? "none" : tone;
          return (
            <button key={tone} type="button" className="chip" aria-pressed={filters.visit.includes(tone)} onClick={() => mapUi.setFilters({ ...filters, visit: toggleValue(filters.visit, tone) })}>
              <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[key] }} />
              {VISIT_TONE_LABEL[key]}
              <span className="text-xs font-normal text-subtle">{captions.find((item) => item.tone === key)?.label}</span>
            </button>
          );
        })}
      </ChipGroup>
      <ChipGroup title="알림">
        {ALERT_FILTERS.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={filters.alert.includes(item.id)} onClick={() => mapUi.setFilters({ ...filters, alert: toggleValue(filters.alert, item.id) })}>{item.label}</button>
        ))}
      </ChipGroup>
      <ChipGroup title="영업 상태">
        {(Object.keys(SALES_STATUS_LABEL) as Array<keyof typeof SALES_STATUS_LABEL>).map((status) => (
          <button key={status} type="button" className="chip" aria-pressed={filters.status.includes(status)} onClick={() => mapUi.setFilters({ ...filters, status: toggleValue(filters.status, status) })}>{SALES_STATUS_LABEL[status]}</button>
        ))}
      </ChipGroup>
      {tags.length > 0 ? (
        <ChipGroup title="태그">
          {tags.map((tag) => (
            <button key={tag} type="button" className="chip" aria-pressed={filters.tags.includes(tag)} onClick={() => mapUi.setFilters({ ...filters, tags: toggleValue(filters.tags, tag) })}>#{tag}</button>
          ))}
        </ChipGroup>
      ) : null}
      {activeTemplates.length > 1 ? (
        <ChipGroup title="연결된 템플릿">
          {activeTemplates.map((template) => (
            <button key={template.id} type="button" className="chip" aria-pressed={filters.templates.includes(template.id)} onClick={() => mapUi.setFilters({ ...filters, templates: toggleValue(filters.templates, template.id) })}>{template.name}</button>
          ))}
        </ChipGroup>
      ) : null}
      <div className="grid gap-1 rounded-xl border border-line px-4 py-1">
        <label className="flex min-h-12 items-center justify-between gap-3 text-sm font-medium">
          지금 보이는 지도 영역만
          <Switch checked={filters.area} onCheckedChange={(checked) => mapUi.setFilters({ ...filters, area: checked })} />
        </label>
        <label className="flex min-h-12 items-center justify-between gap-3 border-t border-line text-sm font-medium">
          보관한 거래처만 보기
          <Switch checked={filters.archivedOnly} onCheckedChange={(checked) => mapUi.setFilters({ ...filters, archivedOnly: checked })} />
        </label>
      </div>
    </div>
  );
}
