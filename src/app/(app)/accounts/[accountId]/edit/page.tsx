"use client";

import { useParams } from "next/navigation";
import { AccountForm } from "@/components/AccountForm";

export default function EditAccountPage() {
  const params = useParams<{ accountId: string }>();
  return <AccountForm accountId={params.accountId} />;
}
