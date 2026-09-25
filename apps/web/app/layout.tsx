import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { cashSession } from "@parallax/core";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const display = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "PARALLAX",
  description: "Intelligent trading and execution desk for tokenized stocks on BNB Smart Chain. Cash freezes. BNB doesn’t. Trade the gap.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = cashSession();
  return (
    <html lang="en" data-session={session.atmosphere} className={`${geist.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
