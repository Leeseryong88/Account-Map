import { describe, expect, it } from "vitest";
import { formatAnswer, validateAnswers } from "./answers";
import { clusterByGrid, clusterCellSize, summarizeBadges } from "./cluster";
import { addSeoulDays, assertVisitedAt, formatDateInSeoul, seoulDayStartIsoFromYmd } from "./dates";
import { EMPTY_FILTERS, earliestOpenDue, filtersToParams, matchAccount, parseFilters, sortAccounts, summarize } from "./filters";
import { fieldReminderDocId, moveItem, visitDocId } from "./ids";
import { planDeleteEffects } from "./planDelete";
import { planVisitEffects } from "./planVisit";
import { clusterHasUrgent, getReminderTimeStatus, pickAlertBadge } from "./reminderStatus";
import { STARTER_TEMPLATE } from "./starterTemplate";
import { validateTemplate } from "./templateDraft";
import type { AccountFilterInput, ReminderFilterInput } from "./filters";
import type { TemplateField } from "./types";
import { DEFAULT_BANDS } from "./types";
import { validateBands, visitTone } from "./visitBands";
import { previewLatest, selectVisitAnchors } from "./visits";

const NOW = "2026-10-21T03:00:00.000Z"; // 2026-10-21 12:00 KST
const OCT20 = "2026-10-20T03:00:00.000Z"; // 2026-10-20 12:00 KST
const OCT21 = "2026-10-21T01:00:00.000Z"; // 2026-10-21 10:00 KST
const SEP1 = "2026-09-01T03:00:00.000Z";

const followUp: TemplateField = {
  id: "follow_up_date",
  type: "date",
  label: "후속 연락일",
  required: false,
  helpText: "",
  placeholder: "",
  options: [],
  unit: "",
  reminderRule: { enabled: true, title: "후속 연락", leadDays: 1 },
};

const purpose = STARTER_TEMPLATE.fields[0];

function account(partial: Partial<AccountFilterInput> & Pick<AccountFilterInput, "id" | "name">): AccountFilterInput {
  return {
    address: "",
    contactSearchText: "",
    salesStatus: "prospect",
    tags: [],
    templateIds: [],
    archived: false,
    lat: 37.5,
    lng: 127,
    lastVisitAt: null,
    ...partial,
  };
}

describe("서울 날짜와 방문 일시", () => {
  it("날짜 경계와 일수 더하기를 한국 표준시로 계산한다", () => {
    expect(formatDateInSeoul(new Date("2026-10-20T14:59:00.000Z"))).toBe("2026-10-20");
    expect(formatDateInSeoul(new Date("2026-10-20T15:00:00.000Z"))).toBe("2026-10-21");
    expect(addSeoulDays(OCT20, 14)).toBe("2026-11-03");
    expect(addSeoulDays("2026-12-31T03:00:00.000Z", 1)).toBe("2027-01-01");
  });

  it("오늘을 넘는 방문 일시를 거절하고 오늘 안의 시각은 허용한다", () => {
    expect(assertVisitedAt("2026-10-21T14:30:00+09:00", new Date(NOW)).toISOString()).toContain("2026-10-21");
    expect(() => assertVisitedAt("2026-10-22T00:30:00+09:00", new Date(NOW))).toThrow(/오늘/);
  });
});

describe("알림 시간 상태", () => {
  it("날짜만 있는 알림은 해당 날짜가 끝난 뒤 지연이다", () => {
    const due = seoulDayStartIsoFromYmd("2026-10-20");
    expect(getReminderTimeStatus({ dueAt: due, allDay: true, leadDays: 3, now: "2026-10-20T14:59:00.000Z" })).toBe("today");
    expect(getReminderTimeStatus({ dueAt: due, allDay: true, leadDays: 3, now: "2026-10-20T15:00:00.000Z" })).toBe("overdue");
    expect(getReminderTimeStatus({ dueAt: due, allDay: true, leadDays: 3, now: "2026-10-17T00:00:00+09:00" })).toBe("soon");
    expect(getReminderTimeStatus({ dueAt: due, allDay: true, leadDays: 3, now: "2026-10-16T23:59:00+09:00" })).toBe("scheduled");
  });

  it("날짜와 시간 알림은 지정 시각 이후 지연이고 오늘이 임박보다 우선한다", () => {
    const due = "2026-10-10T06:00:00.000Z"; // 15:00 KST
    expect(getReminderTimeStatus({ dueAt: due, allDay: false, leadDays: 3, now: "2026-10-10T05:59:00.000Z" })).toBe("today");
    expect(getReminderTimeStatus({ dueAt: due, allDay: false, leadDays: 3, now: "2026-10-10T06:00:00.000Z" })).toBe("overdue");
    expect(getReminderTimeStatus({ dueAt: due, allDay: false, leadDays: 1, now: "2026-10-09T06:00:00.000Z" })).toBe("soon");
    expect(getReminderTimeStatus({ dueAt: due, allDay: false, leadDays: 1, now: "2026-10-08T06:00:00.000Z" })).toBe("scheduled");
  });

  it("배지 우선순위는 지연, 오늘, 임박 순이다", () => {
    expect(pickAlertBadge(["soon", "today", "overdue"]).kind).toBe("overdue");
    expect(pickAlertBadge(["soon", "today"]).kind).toBe("today");
    expect(pickAlertBadge(["scheduled", "soon"])).toEqual({ kind: "soon", count: 2 });
    expect(clusterHasUrgent(["soon", null])).toBe(false);
    expect(clusterHasUrgent(["today"])).toBe(true);
  });
});

describe("방문 경과", () => {
  it("기간이 이어지고 겹치지 않을 때만 설정이 유효하다", () => {
    expect(validateBands(DEFAULT_BANDS)).toBeNull();
    expect(validateBands({ recentDays: 7, normalDays: 7, warningDays: 10 })).toMatch(/겹치/);
    expect(validateBands({ recentDays: 30, normalDays: 10, warningDays: 60 })).toMatch(/겹치/);
  });

  it("기본 기간으로 방문 색 구간을 나눈다", () => {
    const now = new Date(NOW);
    expect(visitTone(null, DEFAULT_BANDS, now).tone).toBe("none");
    expect(visitTone(NOW, DEFAULT_BANDS, now)).toMatchObject({ tone: "recent", days: 0 });
    expect(visitTone(addDaysIso(NOW, -7), DEFAULT_BANDS, now).tone).toBe("recent");
    expect(visitTone(addDaysIso(NOW, -8), DEFAULT_BANDS, now).tone).toBe("normal");
    expect(visitTone(addDaysIso(NOW, -30), DEFAULT_BANDS, now).tone).toBe("normal");
    expect(visitTone(addDaysIso(NOW, -31), DEFAULT_BANDS, now).tone).toBe("warning");
    expect(visitTone(addDaysIso(NOW, -60), DEFAULT_BANDS, now).tone).toBe("warning");
    expect(visitTone(addDaysIso(NOW, -61), DEFAULT_BANDS, now).tone).toBe("old");
  });
});

describe("방문 기록 계획", () => {
  const base = {
    visitId: "v1",
    visitedAt: OCT20,
    templateId: "t1",
    templateName: "기본 영업 방문",
    fields: [followUp],
    revisitRule: { enabled: true, daysAfterVisit: 14, leadDays: 3 },
    answers: { follow_up_date: "2026-10-28" },
    existingFieldReminders: [],
    openRevisit: null,
    lastCompletedSourceVisitAt: null,
    latestVisitAt: OCT20,
    latestVisitId: "v1",
    newRevisitId: "rv1",
  };

  it("첫 방문은 후속 업무와 재방문 알림을 만들고 같은 ID를 유지한다", () => {
    const changes = planVisitEffects(base);
    const field = changes.find((change) => change.type === "field");
    const revisit = changes.find((change) => change.type === "revisit");
    expect(field).toMatchObject({ action: "create", reminderId: fieldReminderDocId("v1", "follow_up_date"), title: "후속 연락" });
    expect(formatDateInSeoul(new Date(revisit!.dueAt!))).toBe("2026-11-03");
    expect(planVisitEffects(base).map((change) => change.reminderId)).toEqual(changes.map((change) => change.reminderId));
    expect(visitDocId("reqabc")).toBe(visitDocId("reqabc"));
  });

  it("값이 없는 날짜에는 알림을 만들지 않고 완료된 알림은 다시 열지 않는다", () => {
    expect(planVisitEffects({ ...base, answers: {} }).some((change) => change.type === "field")).toBe(false);
    const done = planVisitEffects({
      ...base,
      answers: { follow_up_date: "2026-11-01" },
      existingFieldReminders: [
        { id: "fr1", fieldId: "follow_up_date", status: "done", dueAt: seoulDayStartIsoFromYmd("2026-10-28"), title: "후속 연락", allDay: true, leadDays: 1 },
      ],
    });
    expect(done.find((change) => change.type === "field")).toMatchObject({ action: "keep" });
  });

  it("과거 방문은 더 최근 재방문 일정을 뒤로 밀지 않는다", () => {
    const changes = planVisitEffects({
      ...base,
      visitId: "vold",
      visitedAt: SEP1,
      latestVisitAt: OCT20,
      latestVisitId: "v1",
      answers: {},
      openRevisit: {
        id: "open",
        dueAt: seoulDayStartIsoFromYmd("2026-11-03"),
        sourceVisitAt: OCT20,
        visitId: "v1",
        title: "기본 영업 방문 재방문",
        leadDays: 3,
        allDay: true,
      },
    });
    expect(changes.find((change) => change.type === "revisit")).toMatchObject({ action: "keep", dueAt: seoulDayStartIsoFromYmd("2026-11-03") });
  });

  it("더 최근 방문은 재방문 일정을 그 날짜 기준으로 갱신한다", () => {
    const changes = planVisitEffects({
      ...base,
      visitId: "v2",
      visitedAt: OCT21,
      latestVisitAt: OCT21,
      latestVisitId: "v2",
      answers: {},
      openRevisit: {
        id: "open",
        dueAt: seoulDayStartIsoFromYmd("2026-11-03"),
        sourceVisitAt: OCT20,
        visitId: "v1",
        title: "기본 영업 방문 재방문",
        leadDays: 3,
        allDay: true,
      },
    });
    const revisit = changes.find((change) => change.type === "revisit");
    expect(revisit?.action).toBe("update");
    expect(formatDateInSeoul(new Date(revisit!.dueAt!))).toBe("2026-11-04");
    expect(revisit?.visitId).toBe("v2");
  });

  it("완료된 회차보다 오래된 방문은 새 재방문을 만들지 않고 더 새로운 방문은 만든다", () => {
    const older = planVisitEffects({
      ...base,
      latestVisitAt: OCT20,
      latestVisitId: "v1",
      lastCompletedSourceVisitAt: OCT20,
      answers: {},
    });
    expect(older.some((change) => change.type === "revisit" && change.action === "create")).toBe(false);
    const newer = planVisitEffects({
      ...base,
      visitId: "v2",
      visitedAt: OCT21,
      latestVisitAt: OCT21,
      latestVisitId: "v2",
      lastCompletedSourceVisitAt: OCT20,
      answers: {},
    });
    expect(newer.find((change) => change.type === "revisit")?.action).toBe("create");
  });
});

describe("방문 삭제 계획", () => {
  it("최근 방문을 지우면 재방문은 남은 방문으로 다시 계산하고 다른 후속 업무는 남긴다", () => {
    const changes = planDeleteEffects({
      visitId: "v2",
      templateId: "t1",
      cancelLinkedFieldReminders: true,
      fieldReminders: [
        { id: "fr2", fieldId: "follow_up_date", status: "open", title: "후속 연락", dueAt: seoulDayStartIsoFromYmd("2026-10-30"), allDay: true, leadDays: 1 },
      ],
      openRevisit: {
        id: "open",
        dueAt: seoulDayStartIsoFromYmd("2026-11-04"),
        sourceVisitAt: OCT21,
        visitId: "v2",
        title: "기본 영업 방문 재방문",
        leadDays: 3,
        templateId: "t1",
      },
      remainingLatestAt: OCT20,
      remainingLatestId: "v1",
      revisitRule: { enabled: true, daysAfterVisit: 14, leadDays: 3 },
      templateName: "기본 영업 방문",
    });
    expect(changes.find((change) => change.type === "field")?.action).toBe("cancel");
    expect(formatDateInSeoul(new Date(changes.find((change) => change.type === "revisit")!.dueAt!))).toBe("2026-11-03");
  });

  it("남은 방문이 없으면 재방문 알림을 취소한다", () => {
    const changes = planDeleteEffects({
      visitId: "v1",
      templateId: "t1",
      cancelLinkedFieldReminders: false,
      fieldReminders: [
        { id: "fr1", fieldId: "follow_up_date", status: "open", title: "후속 연락", dueAt: seoulDayStartIsoFromYmd("2026-10-28"), allDay: true, leadDays: 1 },
      ],
      openRevisit: {
        id: "open",
        dueAt: seoulDayStartIsoFromYmd("2026-11-03"),
        sourceVisitAt: OCT20,
        visitId: "v1",
        title: "재방문",
        leadDays: 3,
        templateId: "t1",
      },
      remainingLatestAt: null,
      remainingLatestId: null,
      revisitRule: { enabled: true, daysAfterVisit: 14, leadDays: 3 },
      templateName: "기본",
    });
    expect(changes.find((change) => change.fieldId === "follow_up_date")?.action).toBe("keep");
    expect(changes.find((change) => change.type === "revisit")?.action).toBe("cancel");
  });
});

describe("최근 방문 미리보기", () => {
  it("과거 방문을 더해도 저장된 최근 방문이 기준이다", () => {
    const latest = previewLatest({
      thisVisitId: null,
      thisVisitedAt: SEP1,
      latestVisitId: "v1",
      latestVisitAt: OCT20,
      previousVisitId: null,
      previousVisitAt: null,
    });
    expect(latest?.id).toBe("v1");
  });

  it("최근 방문 시각을 당기면 직전 방문과 비교한다", () => {
    const latest = previewLatest({
      thisVisitId: "v2",
      thisVisitedAt: SEP1,
      latestVisitId: "v2",
      latestVisitAt: OCT21,
      previousVisitId: "v1",
      previousVisitAt: OCT20,
    });
    expect(latest?.id).toBe("v1");
  });

  it("같은 시각이면 ID로 안정적으로 고른다", () => {
    const anchors = selectVisitAnchors([
      { id: "b", visitedAt: OCT20 },
      { id: "a", visitedAt: OCT20 },
    ]);
    expect(anchors.latest?.id).toBe("b");
    expect(anchors.previous?.id).toBe("a");
  });
});

describe("템플릿과 답변", () => {
  it("기본 템플릿은 방문 목적, 거래처명, 전 방문일자, 메모, 다음 연락일을 포함한다", () => {
    const result = validateTemplate(STARTER_TEMPLATE);
    expect(result.value?.name).toBe("기본 방문 기록");
    expect(result.value?.fields.map((field) => field.label)).toEqual(["방문 목적", "거래처명", "전 방문일자", "메모", "다음 연락일"]);
    expect(result.value?.fields.find((field) => field.label === "다음 연락일")?.required).toBe(false);
    expect(result.value?.fields.find((field) => field.label === "다음 연락일")?.reminderRule?.enabled).toBe(true);
    expect(result.value?.fields.map((field) => field.autoFill)).toEqual([null, "accountName", "lastVisitDate", null, null]);
    expect(result.value?.revisitRule).toEqual({ enabled: true, daysAfterVisit: 14, leadDays: 3 });
  });

  it("자동 입력은 맞는 유형에서만 유지하고 자동 입력 날짜에는 알림을 만들지 않는다", () => {
    const result = validateTemplate({
      ...STARTER_TEMPLATE,
      fields: [
        { ...STARTER_TEMPLATE.fields[1], type: "textarea" },
        { ...STARTER_TEMPLATE.fields[2], reminderRule: { enabled: true, title: "전 방문", leadDays: 1 } },
        { ...STARTER_TEMPLATE.fields[3], autoFill: undefined },
      ],
    });
    expect(result.value?.fields.map((field) => field.autoFill)).toEqual([null, "lastVisitDate", null]);
    expect(result.value?.fields[1].reminderRule?.enabled).toBe(false);
  });

  it("필수값과 선택지를 검증하고 과거 양식의 라벨로 답을 표시한다", () => {
    const invalid = validateAnswers([purpose], {});
    expect(invalid.errors.purpose).toBe("필수 항목입니다.");
    const valid = validateAnswers([purpose, followUp], { purpose: "regular", follow_up_date: "2026-10-28" });
    expect(valid.errors).toEqual({});
    const renamed = { ...purpose, label: "방문 이유" };
    expect(formatAnswer(purpose, "regular")).toBe("정기 방문");
    expect(formatAnswer(renamed, "regular")).toBe("정기 방문");
    expect(formatAnswer(purpose, "regular")).not.toBe(formatAnswer({ ...purpose, options: [{ id: "regular", label: "바뀐 이름" }] }, "regular"));
  });

  it("항목 순서를 이동한다", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});

describe("필터와 요약", () => {
  const now = new Date(NOW);
  const reminders: ReminderFilterInput[] = [
    { accountId: "a", status: "open", dueAt: seoulDayStartIsoFromYmd("2026-10-20"), allDay: true, leadDays: 1 },
    { accountId: "a", status: "open", dueAt: seoulDayStartIsoFromYmd("2026-10-20"), allDay: true, leadDays: 1 },
    { accountId: "b", status: "open", dueAt: seoulDayStartIsoFromYmd("2026-10-22"), allDay: true, leadDays: 3 },
    { accountId: "c", status: "done", dueAt: seoulDayStartIsoFromYmd("2026-10-01"), allDay: true, leadDays: 1 },
  ];
  const accounts = [
    account({ id: "a", name: "가나다", salesStatus: "active", tags: ["병원"], templateIds: ["t1"], lastVisitAt: addDaysIso(NOW, -70), address: "서울" }),
    account({ id: "b", name: "마바사", salesStatus: "hold", tags: ["공장"], contactSearchText: "김담당", lastVisitAt: NOW }),
    account({ id: "c", name: "신규처", salesStatus: "prospect" }),
    account({ id: "d", name: "보관처", archived: true, lastVisitAt: NOW }),
  ];

  it("그룹 안에서는 OR, 그룹 사이에는 AND로 거른다", () => {
    const activeOrHold = accounts.filter((item) =>
      matchAccount(item, reminders, { ...EMPTY_FILTERS, status: ["active", "hold"] }, DEFAULT_BANDS, null, now),
    );
    expect(activeOrHold.map((item) => item.id).sort()).toEqual(["a", "b"]);

    const both = accounts.filter((item) =>
      matchAccount(item, reminders, { ...EMPTY_FILTERS, status: ["active"], tags: ["공장"] }, DEFAULT_BANDS, null, now),
    );
    expect(both).toHaveLength(0);

    const search = accounts.filter((item) =>
      matchAccount(item, reminders, { ...EMPTY_FILTERS, query: "김담당" }, DEFAULT_BANDS, null, now),
    );
    expect(search.map((item) => item.id)).toEqual(["b"]);
  });

  it("오래된 순은 미방문이 먼저이고 요약은 영업처 수와 알림 수를 구분한다", () => {
    const visible = accounts.filter((item) => matchAccount(item, reminders, EMPTY_FILTERS, DEFAULT_BANDS, null, now));
    const sorted = sortAccounts(visible, "oldest", new Map(visible.map((item) => [item.id, earliestOpenDue(item.id, reminders)])));
    expect(sorted[0].id).toBe("c");
    const summary = summarize(accounts, reminders, DEFAULT_BANDS, now);
    expect(summary.total).toBe(3);
    expect(summary.never).toBe(1);
    expect(summary.old).toBe(1);
    expect(summary.overdueAccounts).toBe(1);
    expect(summary.overdueReminders).toBe(2);
    expect(summary.soonAccounts).toBe(1);
    expect(summary.soonReminders).toBe(1);
  });

  it("필터를 주소와 왕복한다", () => {
    const filters = { ...EMPTY_FILTERS, query: "서울", visit: ["old" as const], alert: ["overdue" as const], status: ["active" as const], sort: "name" as const };
    const parsed = parseFilters(filtersToParams(filters));
    expect(parsed).toMatchObject(filters);
  });
});

describe("클러스터", () => {
  it("가까운 마커만 묶고 크게 확대하면 풀어서 보여 준다", () => {
    const groups = clusterByGrid(
      [
        { id: "a", x: 10, y: 10 },
        { id: "b", x: 20, y: 12 },
        { id: "c", x: 200, y: 10 },
      ],
      40,
    );
    expect(groups.map((group) => group.map((item) => item.id).sort())).toEqual([["a", "b"], ["c"]]);
    expect(clusterByGrid([{ id: "a", x: 1, y: 1 }], 0)).toEqual([[{ id: "a", x: 1, y: 1 }]]);
    expect(clusterCellSize(2)).toBe(0);
    expect(clusterCellSize(3)).toBeGreaterThan(0);
    expect(clusterCellSize(8)).toBeGreaterThan(clusterCellSize(3));
  });

  it("가까운 배지는 이름별로 개수를 합친다", () => {
    expect(summarizeBadges([
      { key: "warning", label: "방문 필요", color: "#c2410c" },
      { key: "none", label: "미방문", color: "#5f6b7a" },
      { key: "warning", label: "방문 필요", color: "#c2410c" },
      { key: "overdue", label: "지연", color: "#b42318", count: 2 },
      { key: "overdue", label: "지연", color: "#b42318", count: 1 },
    ])).toEqual([
      { key: "overdue", label: "지연", color: "#b42318", count: 3 },
      { key: "warning", label: "방문 필요", color: "#c2410c", count: 2 },
      { key: "none", label: "미방문", color: "#5f6b7a", count: 1 },
    ]);
  });
});

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}
