"use client";

import { Suspense } from "react";
import { OpportunitiesWorkspace } from "@/components/opportunities/workspace";

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<p className="kicker px-8 py-8">SCANNING BSC</p>}>
      <OpportunitiesWorkspace />
    </Suspense>
  );
}
