"use client";

import { useRouter } from "next/navigation";
import { hrefForView, type DeskView } from "./nav";
import { useParallax } from "./store";

export function useGo() {
  const router = useRouter();
  const setView = useParallax((s) => s.setView);
  return (view: DeskView) => {
    setView(view);
    router.push(hrefForView(view));
  };
}
