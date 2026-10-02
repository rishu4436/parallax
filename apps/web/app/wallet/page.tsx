"use client";

import { PortfolioDock } from "@/components/portfolio-dock";
import { Tape } from "@/components/tape";

export default function WalletPage() {
  return (
    <div className="grid min-h-full grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)] max-[900px]:grid-cols-1">
      <div className="border-r border-line px-6 py-6 md:px-8 max-[900px]:border-r-0">
        <PortfolioDock />
      </div>
      <Tape />
    </div>
  );
}
