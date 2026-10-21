"use client";

import { useParams } from "next/navigation";
import { VisitForm } from "@/components/VisitForm";

export default function EditVisitPage() {
  const params = useParams<{ accountId: string; visitId: string }>();
  return <VisitForm accountId={params.accountId} visitId={params.visitId} />;
}
