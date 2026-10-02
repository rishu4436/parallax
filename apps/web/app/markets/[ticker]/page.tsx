"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AssetWorkspace } from "@/components/markets/asset-workspace";

export default function AssetPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker || "");
  return (
    <Suspense fallback={<p className="kicker px-8 py-8">SCANNING BSC</p>}>
      <AssetWorkspace ticker={ticker} />
    </Suspense>
  );
}
