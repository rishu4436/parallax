export type DeskView = "trade" | "jobs" | "wallet";

export const NAV = [
  { href: "/", id: "home", label: "Overview", kicker: "01" },
  { href: "/markets", id: "markets", label: "Markets", kicker: "02" },
  { href: "/opportunities", id: "opportunities", label: "Opportunities", kicker: "03" },
  { href: "/portfolio", id: "portfolio", label: "Portfolio", kicker: "04" },
  { href: "/agents", id: "agents", label: "Agents", kicker: "05" },
  { href: "/activity", id: "activity", label: "Activity", kicker: "06" },
  { href: "/desk", id: "trade", label: "Trade", kicker: "07" },
  { href: "/jobs", id: "jobs", label: "Jobs", kicker: "08" },
  { href: "/wallet", id: "wallet", label: "Wallet", kicker: "09" },
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
