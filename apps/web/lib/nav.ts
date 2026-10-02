export type DeskView = "trade" | "jobs" | "wallet";

export const NAV_GROUPS = [
  {
    id: "market",
    label: "Market",
    items: [
      { href: "/", id: "home", label: "Overview" },
      { href: "/markets", id: "markets", label: "Markets" },
      { href: "/opportunities", id: "opportunities", label: "Opportunities" },
      { href: "/portfolio", id: "portfolio", label: "Portfolio" },
      { href: "/activity", id: "activity", label: "Activity" },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    items: [
      { href: "/strategies", id: "strategies", label: "Strategies" },
      { href: "/agents", id: "agents", label: "Agents" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ href: "/developer", id: "developer", label: "Developer" }],
  },
  {
    id: "desk",
    label: "Desk",
    items: [
      { href: "/desk", id: "trade", label: "Trade" },
      { href: "/jobs", id: "jobs", label: "Jobs" },
      { href: "/wallet", id: "wallet", label: "Wallet" },
    ],
  },
] as const;

export const NAV: Array<{ href: string; id: string; label: string }> = NAV_GROUPS.flatMap((group) => [...group.items]);

export const MOBILE_PRIMARY = NAV_GROUPS[0].items;

export const MOBILE_MORE = [
  ...NAV_GROUPS[1].items,
  ...NAV_GROUPS[2].items,
  ...NAV_GROUPS[3].items,
  { href: "/replay", id: "replay", label: "Replay" },
] as const;

export function hrefForView(view: DeskView): string {
  if (view === "jobs") return "/jobs";
  if (view === "wallet") return "/wallet";
  return "/desk";
}

export function viewForPath(pathname: string): DeskView | null {
  if (pathname === "/jobs") return "jobs";
  if (pathname === "/wallet") return "wallet";
  if (pathname === "/desk") return "trade";
  return null;
}

export function navActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
