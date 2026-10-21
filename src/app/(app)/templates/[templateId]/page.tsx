"use client";

import { useParams } from "next/navigation";
import { TemplateEditor } from "@/components/TemplateEditor";

export default function EditTemplatePage() {
  const params = useParams<{ templateId: string }>();
  return <TemplateEditor templateId={params.templateId} />;
}
