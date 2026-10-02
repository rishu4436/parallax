import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  kicker?: string;
  title?: ReactNode;
  aside?: ReactNode;
  flagged?: boolean;
}

export function Panel({ kicker, title, aside, flagged, className, children, ...props }: PanelProps) {
  return (
    <section className={cn("panel", flagged && "panel-flagged", className)} {...props}>
      {kicker || aside ? (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {kicker ? <h2 className="kicker">{kicker}</h2> : null}
          {aside}
        </div>
      ) : null}
      {title ? <div className="display mt-3 text-3xl">{title}</div> : null}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "warn" | "dim";
}) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "warn" ? "text-warn" : tone === "dim" ? "text-dim" : "text-ink";
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className={cn("num mt-1", color)}>{value}</dd>
    </div>
  );
}
