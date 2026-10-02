import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function LoadingState({ label = "QUOTING" }: { label?: string }) {
  return (
    <p className="kicker" role="status">
      {label}
    </p>
  );
}

export function EmptyState({ kicker, body, action }: { kicker?: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid gap-3">
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <p className="state-empty">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="state-error" role="alert">
      {message}
    </p>
  );
}

export function StaleState({ body = "That price is 30 seconds old. Requote.", action }: { body?: string; action?: ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="state-stale">QUOTE STALE</p>
      <p className="text-sm text-dim">{body}</p>
      {action}
    </div>
  );
}
