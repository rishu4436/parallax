import { cn } from "@/lib/utils";

export type StatusTone = "open" | "closed" | "halted" | "offline" | "failed" | "pending" | "demo";

const TONE: Record<StatusTone, string> = {
  open: "badge-open",
  closed: "badge-closed",
  halted: "badge-halted",
  offline: "badge-offline",
  failed: "badge-failed",
  pending: "badge-pending",
  demo: "badge-demo",
};

export function StatusChip({ tone, children, className }: { tone: StatusTone; children: string; className?: string }) {
  return <span className={cn("badge", TONE[tone], className)}>{children}</span>;
}

export function DemoMark({ label }: { label?: string }) {
  return <span className="badge badge-demo">DEMO DATA{label ? ` · ${label}` : ""}</span>;
}

export function railTone(status: string): StatusTone {
  const key = status.toUpperCase();
  if (key === "OPEN") return "open";
  if (key === "CLOSED") return "closed";
  if (key === "HALTED") return "halted";
  return "offline";
}
