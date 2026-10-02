export type DeskView = "trade" | "jobs" | "wallet";

export const NAV = [
  { href: "/", id: "home", label: "Overview", kicker: "01" },
  { href: "/desk", id: "trade", label: "Trade", kicker: "02" },
  { href: "/jobs", id: "jobs", label: "Jobs", kicker: "03" },
  { href: "/wallet", id: "wallet", label: "Wallet", kicker: "04" },
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
