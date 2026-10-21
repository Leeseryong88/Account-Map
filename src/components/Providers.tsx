"use client";

import { clsx } from "clsx";
import { createContext, useContext, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { AuthProvider } from "@/lib/auth";

type ToastTone = "ok" | "error";
interface ToastItem { id: string; message: string; tone: ToastTone }
const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useMemo(() => (message: string, tone: ToastTone = "ok") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === "error" ? 6000 : 2800);
  }, []);

  return (
    <Tooltip.Provider delayDuration={300}>
      <AuthProvider>
        <ToastContext.Provider value={push}>
          {children}
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
            {toasts.map((toast) => (
              <p key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className={clsx("pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-float", toast.tone === "error" ? "bg-[#7f1d1d]" : "bg-[#111827]")}>
                {toast.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#4ade80]" aria-hidden="true" />}
                <span>{toast.message}</span>
              </p>
            ))}
          </div>
        </ToastContext.Provider>
      </AuthProvider>
    </Tooltip.Provider>
  );
}

export function Modal({
  open,
  title,
  description,
  onOpenChange,
  wide,
  composer,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  wide?: boolean;
  composer?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0f172a]/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className={composer
            ? "fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-white focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(92dvh,860px)] sm:w-[min(100%-32px,680px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:shadow-float"
            : clsx(
              "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-auto rounded-t-[20px] bg-white p-5 pb-safe shadow-float focus:outline-none",
              "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(90dvh,760px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:pb-5",
              wide ? "sm:w-[min(100%-32px,680px)]" : "sm:w-[min(100%-32px,520px)]",
            )}
        >
          <div className={clsx("flex items-start justify-between gap-3", composer ? "shrink-0 border-b border-line px-4 py-3" : "")}>
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              <Dialog.Description className={description ? "mt-0.5 text-sm text-subtle" : "sr-only"}>{description || title}</Dialog.Description>
            </div>
            <Dialog.Close className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1" aria-label="닫기"><X aria-hidden="true" /></Dialog.Close>
          </div>
          <div className={composer ? "flex min-h-0 flex-1 flex-col" : "mt-4"}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
