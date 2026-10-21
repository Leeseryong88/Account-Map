"use client";

import { useParams } from "next/navigation";
import { VisitForm } from "@/components/VisitForm";

export default function NewVisitPage() {
  const params = useParams<{ accountId: string }>();
  return <VisitForm accountId={params.accountId} />;
}
