"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FieldFrameProps {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

function FieldFrame({ label, hint, error, className, children }: FieldFrameProps) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      {label ? <span className="kicker">{label}</span> : null}
      {children}
      {error ? <span className="state-error">{error}</span> : hint ? <span className="text-xs text-dim">{hint}</span> : null}
    </label>
  );
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  numeric?: boolean;
  command?: boolean;
}

export function Field({ label, hint, error, numeric, command, className, ...props }: FieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={className}>
      <input
        className={cn(command ? "field-command" : "field", numeric && "field-numeric", error && "field-error")}
        {...props}
      />
    </FieldFrame>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function SelectField({ label, hint, error, className, children, ...props }: SelectFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={className}>
      <select className={cn("field", error && "field-error")} {...props}>
        {children}
      </select>
    </FieldFrame>
  );
}

export interface AreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function AreaField({ label, hint, error, className, ...props }: AreaFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={className}>
      <textarea className={cn("field h-auto py-2", error && "field-error")} rows={props.rows ?? 3} {...props} />
    </FieldFrame>
  );
}
