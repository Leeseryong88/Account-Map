"use client";

import { clsx } from "clsx";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={clsx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)} {...props} />;
}

export function IconButton({
  label,
  children,
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} className={clsx("btn btn-icon", `btn-${variant}`, size === "sm" && "btn-sm", className)} {...props}>{children}</button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="z-[80] whitespace-nowrap rounded-lg bg-[#111827] px-2.5 py-1.5 text-xs font-medium text-white" sideOffset={6}>{label}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Switch({ checked, onCheckedChange, label, id, disabled }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label?: string; id?: string; disabled?: boolean }) {
  return (
    <SwitchPrimitive.Root id={id} className="switch" checked={checked} disabled={disabled} aria-label={label} onCheckedChange={onCheckedChange}>
      <SwitchPrimitive.Thumb className="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("field-input", className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx("field-textarea", className)} {...props} />;
}

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("field-select", className)} {...props}>{children}</select>;
}

function LabelText({ label, required, badge }: { label: string; required?: boolean; badge?: ReactNode }) {
  return (
    <>
      {label}
      {required ? <span className="ml-1.5 text-xs font-bold text-danger">필수</span> : null}
      {badge ? <span className="ml-2 align-middle">{badge}</span> : null}
    </>
  );
}

export function Field({
  id,
  label,
  required,
  help,
  error,
  badge,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  badge?: ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        <LabelText label={label} required={required} badge={badge} />
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {help ? <p id={helpId} className="text-[13px] leading-5 text-subtle">{help}</p> : null}
      {error ? <p id={errorId} role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export function ChoiceGroup({
  label,
  required,
  help,
  error,
  badge,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-2 border-0 p-0">
      <legend className="mb-0.5 text-sm font-semibold text-ink">
        <LabelText label={label} required={required} badge={badge} />
      </legend>
      {children}
      {help ? <p className="text-[13px] leading-5 text-subtle">{help}</p> : null}
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function EmptyState({ icon, title, description, children }: { icon?: ReactNode; title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-10 text-center">
      {icon ? <div className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary [&_svg]:size-7">{icon}</div> : null}
      <div className="grid gap-1">
        <p className="text-base font-bold">{title}</p>
        {description ? <p className="max-w-sm text-sm text-subtle">{description}</p> : null}
      </div>
      {children ? <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
