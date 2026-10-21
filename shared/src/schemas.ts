import { z } from "zod";

export const requestIdSchema = z.string().regex(/^req[a-zA-Z0-9]+$/, "요청 번호가 올바르지 않습니다.").max(80);

const answerSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);

export const saveVisitSchema = z.object({
  clientRequestId: requestIdSchema,
  visitId: z.string().regex(/^v[a-zA-Z0-9]+$/).max(120).nullable(),
  accountId: z.string().min(1).max(120),
  visitedAt: z.string().min(8).max(40),
  summary: z.string().max(4000),
  contactIds: z.array(z.string().min(1).max(120)).max(20),
  templateId: z.string().min(1).max(120).nullable(),
  answers: z.record(z.string(), answerSchema),
});

export const deleteVisitSchema = z.object({
  clientRequestId: requestIdSchema,
  visitId: z.string().regex(/^v[a-zA-Z0-9]+$/).max(120),
  cancelLinkedFieldReminders: z.boolean(),
});

export const archiveAccountSchema = z.object({
  accountId: z.string().min(1).max(120),
  archived: z.boolean(),
  cancelOpenReminders: z.boolean(),
});

export const manualReminderSchema = z.object({
  clientRequestId: requestIdSchema,
  accountId: z.string().min(1).max(120),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(80),
  dueAt: z.string().min(8).max(40),
  allDay: z.boolean(),
  leadDays: z.number().int().min(0).max(365),
  memo: z.string().max(2000),
});

export const updateReminderSchema = z
  .object({
    reminderId: z.string().min(1).max(160),
    action: z.enum(["complete", "cancel", "reschedule"]),
    dueAt: z.string().min(8).max(40).optional(),
    allDay: z.boolean().optional(),
    leadDays: z.number().int().min(0).max(365).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "reschedule" && (!value.dueAt || value.allDay == null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "바꿀 날짜를 입력해 주세요.", path: ["dueAt"] });
    }
  });

export type SaveVisitInput = z.infer<typeof saveVisitSchema>;
export type DeleteVisitInput = z.infer<typeof deleteVisitSchema>;
export type ArchiveAccountInput = z.infer<typeof archiveAccountSchema>;
export type ManualReminderInput = z.infer<typeof manualReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
