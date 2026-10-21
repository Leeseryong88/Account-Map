"use client";

import { useEffect, useState } from "react";
import { LogOut, Palette, PlugZap, UserRound } from "lucide-react";
import { bandCaption, validateBands } from "@shared/visitBands";
import { DEFAULT_BANDS } from "@shared/types";
import { VISIT_TONE_LABEL } from "@shared/labels";
import { logout, useAuth } from "@/lib/auth";
import { useData } from "@/lib/data";
import { firebaseMode, kakaoAppKey } from "@/lib/firebase";
import { TONE_COLOR } from "@/lib/tones";
import { useToast } from "./Providers";
import { Button, PageHeader } from "./ui";

function DaysInput({ id, label, value, color, onChange }: { id: string; label: string; value: number; color: string; onChange: (value: number) => void }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2.5 text-sm font-semibold">
        <span className="size-3 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="flex items-center gap-2 text-sm text-subtle">
        <input id={id} type="number" min={0} inputMode="numeric" className="field-input h-10 min-h-10 w-20 text-center font-bold" value={Number.isFinite(value) ? value : ""} onChange={(event) => onChange(Number(event.target.value))} />
        일까지
      </span>
    </label>
  );
}

export function SettingsScreen() {
  const { bands, saveBands } = useData();
  const { user } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState(bands);
  const [error, setError] = useState("");
  useEffect(() => setDraft(bands), [bands]);
  const dirty = draft.recentDays !== bands.recentDays || draft.normalDays !== bands.normalDays || draft.warningDays !== bands.warningDays;

  async function save() {
    const message = validateBands(draft);
    if (message) {
      setError(message);
      return;
    }
    try {
      await saveBands(draft);
      setError("");
      toast("방문 기간 기준을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    }
  }

  const preview = bandCaption(draft.recentDays < draft.normalDays && draft.normalDays < draft.warningDays ? draft : DEFAULT_BANDS);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-2xl gap-5 p-4 pb-10 lg:p-8">
        <PageHeader title="설정" />
        <section className="card grid gap-4 p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Palette className="size-[18px] text-primary" aria-hidden="true" />마커 색상 기준</h2>
            <p className="mt-1 text-[13px] text-subtle">마지막 방문 후 며칠이 지났는지에 따라 지도 마커 색이 바뀝니다.</p>
          </div>
          <div className="divide-y divide-line rounded-xl border border-line px-4">
            <DaysInput id="recent-days" label={VISIT_TONE_LABEL.recent} color={TONE_COLOR.recent} value={draft.recentDays} onChange={(value) => setDraft({ ...draft, recentDays: value })} />
            <DaysInput id="normal-days" label={VISIT_TONE_LABEL.normal} color={TONE_COLOR.normal} value={draft.normalDays} onChange={(value) => setDraft({ ...draft, normalDays: value })} />
            <DaysInput id="warning-days" label={VISIT_TONE_LABEL.warning} color={TONE_COLOR.warning} value={draft.warningDays} onChange={(value) => setDraft({ ...draft, warningDays: value })} />
          </div>
          {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
          <div className="rounded-xl bg-[#f6f8fb] p-3">
            <p className="section-title mb-2">미리보기</p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {preview.map((item) => (
                <li key={item.tone} className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: TONE_COLOR[item.tone] }} />
                  <span className="font-semibold">{VISIT_TONE_LABEL[item.tone]}</span>
                  <span className="text-subtle">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="primary" disabled={!dirty} onClick={save}>저장</Button>
          </div>
        </section>
        <section className="card grid gap-3 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold"><UserRound className="size-[18px] text-primary" aria-hidden="true" />계정</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{user?.displayName || "내 계정"}</p>
              <p className="text-sm text-subtle">{user?.email}</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => logout()}><LogOut aria-hidden="true" />로그아웃</Button>
          </div>
        </section>
        <section className="card grid gap-2 p-4 text-sm sm:p-5">
          <h2 className="flex items-center gap-2 font-bold"><PlugZap className="size-[18px] text-primary" aria-hidden="true" />연결 상태</h2>
          <dl className="grid gap-1.5 text-muted">
            <div className="flex justify-between gap-3"><dt>시간대</dt><dd className="text-right">한국 표준시 (Asia/Seoul)</dd></div>
            <div className="flex justify-between gap-3"><dt>Firebase</dt><dd className="text-right">{firebaseMode() === "emulator" ? "로컬 에뮬레이터" : firebaseMode() === "production" ? "운영 프로젝트" : "설정 필요"}</dd></div>
            <div className="flex justify-between gap-3"><dt>카카오 지도</dt><dd className="text-right">{kakaoAppKey() ? "연결됨" : "키 없음 (목록과 기록은 사용 가능)"}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}
