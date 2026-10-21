"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AccountForm } from "@/components/AccountForm";

function NewAccountForm() {
  const params = useSearchParams();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  return (
    <AccountForm
      preset={{
        name: params.get("name") ?? "",
        address: params.get("address") ?? "",
        lat: params.has("lat") && Number.isFinite(lat) ? lat : null,
        lng: params.has("lng") && Number.isFinite(lng) ? lng : null,
      }}
    />
  );
}

export default function NewAccountPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-subtle">거래처 등록 화면을 준비하는 중</p>}>
      <NewAccountForm />
    </Suspense>
  );
}
