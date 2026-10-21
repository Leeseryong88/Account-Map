"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, MapPin, X } from "lucide-react";
import { z } from "zod";
import { SALES_STATUSES } from "@shared/types";
import { SALES_STATUS_LABEL } from "@shared/labels";
import { useAuth } from "@/lib/auth";
import { kakaoAppKey } from "@/lib/firebase";
import { useKeyboardInset } from "@/lib/hooks";
import { useData } from "@/lib/data";
import { createAccount, updateAccount } from "@/lib/writes";
import { setUnsaved } from "@/lib/unsaved";
import { useToast } from "./Providers";
import { Button, Field, TextArea, TextInput } from "./ui";
import { LocationPicker } from "./LocationPicker";

const schema = z.object({
  name: z.string().trim().min(1, "거래처명을 입력해 주세요.").max(120),
  address: z.string().max(300),
  lat: z.number({ invalid_type_error: "위치를 정해 주세요. 상호나 주소를 검색하거나 지도를 누르면 됩니다." }).min(-90).max(90),
  lng: z.number({ invalid_type_error: "위치를 정해 주세요. 상호나 주소를 검색하거나 지도를 누르면 됩니다." }).min(-180).max(180),
  industry: z.string().max(80),
  phone: z.string().max(40),
  memo: z.string().max(4000),
  salesStatus: z.enum(SALES_STATUSES),
  tags: z.array(z.string().trim().min(1).max(20)).max(20),
});

export function AccountForm({ accountId, preset }: { accountId?: string; preset?: { name?: string; address?: string; lat?: number | null; lng?: number | null } }) {
  const { user } = useAuth();
  const { accounts, loading } = useData();
  const existing = accounts.find((account) => account.id === accountId);
  const router = useRouter();
  const toast = useToast();
  useKeyboardInset();
  const seeded = accountId ? null : preset;
  const [name, setName] = useState(existing?.name ?? seeded?.name ?? "");
  const [address, setAddress] = useState(existing?.address ?? seeded?.address ?? "");
  const [lat, setLat] = useState<number | null>(existing?.lat ?? seeded?.lat ?? null);
  const [lng, setLng] = useState<number | null>(existing?.lng ?? seeded?.lng ?? null);
  const [industry, setIndustry] = useState(existing?.industry ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [salesStatus, setSalesStatus] = useState(existing?.salesStatus ?? "prospect");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const baseline = {
    name: existing?.name ?? seeded?.name ?? "",
    address: existing?.address ?? seeded?.address ?? "",
    lat: existing?.lat ?? seeded?.lat ?? null,
    lng: existing?.lng ?? seeded?.lng ?? null,
    memo: existing?.memo ?? "",
    industry: existing?.industry ?? "",
    phone: existing?.phone ?? "",
    salesStatus: existing?.salesStatus ?? "prospect",
    tags: (existing?.tags ?? []).join("\u0000"),
  };
  const dirty = accountId && !existing ? false : (
    name !== baseline.name
    || address !== baseline.address
    || lat !== baseline.lat
    || lng !== baseline.lng
    || memo !== baseline.memo
    || industry !== baseline.industry
    || phone !== baseline.phone
    || salesStatus !== baseline.salesStatus
    || tags.join("\u0000") !== baseline.tags
  );

  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setAddress(existing.address);
    setLat(existing.lat);
    setLng(existing.lng);
    setIndustry(existing.industry);
    setPhone(existing.phone);
    setMemo(existing.memo);
    setSalesStatus(existing.salesStatus);
    setTags(existing.tags);
    if (existing.industry || existing.phone || existing.tags.length || existing.memo) setMoreOpen(true);
  }, [existing]);

  function addTag() {
    const next = tagInput.trim();
    if (!next || tags.includes(next) || tags.length >= 20) return;
    setTags([...tags, next]);
    setTagInput("");
  }

  async function save() {
    if (!user) return;
    const parsed = schema.safeParse({ name, address, lat, lng, industry, phone, memo, salesStatus, tags });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => { next[String(issue.path[0])] = issue.message; });
      setErrors(next);
      return;
    }
    setPending(true);
    try {
      if (accountId) {
        await updateAccount(user.uid, accountId, parsed.data);
        toast("거래처 정보를 저장했습니다.");
        router.push(`/map?account=${accountId}`);
      } else {
        const id = await createAccount(user.uid, parsed.data);
        toast("거래처를 등록했습니다. 방문 후 ‘방문 기록 작성’을 눌러 기록하세요.");
        router.push(`/map?account=${id}`);
      }
    } catch {
      toast("저장하지 못했습니다. 입력 내용은 그대로 두었습니다.", "error");
    } finally {
      setPending(false);
    }
  }

  if (accountId && loading) return <p className="p-6 text-subtle">거래처를 불러오는 중</p>;
  if (accountId && !existing) return <p className="p-6">거래처를 찾을 수 없습니다.</p>;

  const located = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-bg">
        <div className="mx-auto grid max-w-5xl gap-4 p-4 pb-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:p-6">
          <div className="lg:col-span-2">
            <h1 className="text-2xl font-bold tracking-tight">{accountId ? "거래처 정보 수정" : "거래처 등록"}</h1>
            <p className="mt-1 text-sm text-subtle">{accountId ? "바뀐 정보를 고치고 저장하세요." : "상호나 주소로 위치를 찾고, 이름만 넣으면 바로 등록됩니다. 나머지는 나중에 채워도 됩니다."}</p>
          </div>

          <section className={`card grid gap-3 p-4 sm:p-5 lg:order-2 lg:sticky lg:top-0 ${errors.lat || errors.lng ? "border-danger" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold"><MapPin className="size-[18px] text-primary" aria-hidden="true" />위치 <span className="text-xs font-bold text-danger">필수</span></h2>
              {located ? <span className="badge badge-success"><Check className="size-3" aria-hidden="true" />위치 지정됨</span> : <span className="badge">아직 없음</span>}
            </div>
            {errors.lat || errors.lng ? <p role="alert" className="text-sm font-medium text-danger">{errors.lat || errors.lng}</p> : null}
            <LocationPicker
              appKey={kakaoAppKey()}
              lat={lat}
              lng={lng}
              onPick={(value) => {
                if (Number.isFinite(value.lat)) setLat(value.lat);
                if (Number.isFinite(value.lng)) setLng(value.lng);
                if (value.address) setAddress(value.address);
                if (value.name && !name.trim()) setName(value.name);
              }}
            />
          </section>

          <form className="card grid gap-5 p-4 sm:p-5 lg:order-1" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
            <h2 className="flex items-center gap-2 font-bold"><Building2 className="size-[18px] text-primary" aria-hidden="true" />기본 정보</h2>
            <Field id="account-name" label="거래처명" required error={errors.name}>{(aria) => <TextInput {...aria} placeholder="예: 한빛상사" value={name} onChange={(event) => setName(event.target.value)} />}</Field>
            <Field id="account-address" label="주소" help="위치를 고르면 자동으로 채워집니다." error={errors.address}>{(aria) => <TextInput {...aria} value={address} onChange={(event) => setAddress(event.target.value)} />}</Field>
            <div className="grid gap-2">
              <span className="text-sm font-semibold">영업 상태</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="영업 상태">
                {SALES_STATUSES.map((status) => (
                  <button key={status} type="button" role="radio" aria-checked={salesStatus === status} className="chip" onClick={() => setSalesStatus(status)}>
                    {salesStatus === status ? <Check aria-hidden="true" /> : null}{SALES_STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="flex w-fit items-center gap-1 text-sm font-semibold text-subtle hover:text-ink" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
              <ChevronDown className={`size-4 transition-transform ${moreOpen ? "rotate-180" : "-rotate-90"}`} aria-hidden="true" />
              추가 정보 (업종, 전화번호, 태그, 메모)
            </button>
            {moreOpen ? (
              <div className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="account-industry" label="업종">{(aria) => <TextInput {...aria} placeholder="예: 제조업" value={industry} onChange={(event) => setIndustry(event.target.value)} />}</Field>
                  <Field id="account-phone" label="대표 전화번호">{(aria) => <TextInput {...aria} type="tel" inputMode="tel" placeholder="02-000-0000" value={phone} onChange={(event) => setPhone(event.target.value)} />}</Field>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="account-tag" className="text-sm font-semibold">태그</label>
                  <div className="flex gap-2">
                    <TextInput id="account-tag" value={tagInput} placeholder="입력 후 Enter" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addTag(); } }} />
                    <Button type="button" variant="secondary" onClick={addTag}>추가</Button>
                  </div>
                  {tags.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {tags.map((tag) => (
                        <span key={tag} className="badge min-h-8 gap-1 pl-3 pr-1 text-[13px]">
                          #{tag}
                          <button type="button" className="grid size-6 place-items-center rounded-full hover:bg-white" aria-label={`${tag} 태그 지우기`} onClick={() => setTags(tags.filter((item) => item !== tag))}><X className="size-3.5" aria-hidden="true" /></button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Field id="account-memo" label="메모">{(aria) => <TextArea {...aria} placeholder="거래 조건, 방문 시 참고할 점 등" value={memo} onChange={(event) => setMemo(event.target.value)} />}</Field>
              </div>
            ) : null}
          </form>
        </div>
      </div>
      <footer className="flex shrink-0 justify-between gap-3 border-t border-line bg-white px-4 py-3 pb-safe" style={{ marginBottom: "var(--keyboard-inset)" }}>
        <Button type="button" variant="ghost" onClick={() => router.push(accountId ? `/map?account=${accountId}` : "/map")}>취소</Button>
        <Button type="button" variant="primary" className="min-w-36" disabled={pending} aria-busy={pending} onClick={save}>{pending ? "저장 중" : accountId ? "변경 저장" : "거래처 등록"}</Button>
      </footer>
    </div>
  );
}
