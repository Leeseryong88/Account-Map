"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TemplateEditor, type TemplateSource } from "@/components/TemplateEditor";

function NewTemplate() {
  const params = useSearchParams();
  const from = params.get("from");
  const source: TemplateSource = from === "starter" ? "starter" : from && from !== "blank" ? { copyOf: from } : "blank";
  return <TemplateEditor key={from ?? "blank"} source={source} />;
}

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<p className="p-6 text-subtle">불러오는 중</p>}>
      <NewTemplate />
    </Suspense>
  );
}
