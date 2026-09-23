import Link from "next/link";

export function Mark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 text-ink" aria-label="PARALLAX">
      <span className="relative block h-4 w-4 shrink-0" aria-hidden>
        <span className="absolute left-0 top-1 h-3 w-3 bg-gold" />
        <span className="absolute left-[5px] top-0 h-3 w-3 border border-gold" />
      </span>
      <span className="text-[12px] font-medium tracking-[0.22em]">PARALLAX</span>
    </Link>
  );
}
