"use client";

import { useParallax } from "@/lib/store";

export function Tape() {
  const tape = useParallax((s) => s.tape);
  return (
    <section id="tape" className="min-h-0 overflow-auto px-6 py-5 md:px-8">
      <h2 className="kicker">Tape</h2>
      <div className="mt-3 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-dim">
            <tr>
              <th className="py-1 font-normal">Time</th>
              <th className="font-normal">Side</th>
              <th className="font-normal">Symbol</th>
              <th className="font-normal">Rail</th>
              <th className="font-normal">USD</th>
              <th className="font-normal">Status</th>
              <th className="font-normal">Hash</th>
            </tr>
          </thead>
          <tbody>
            {tape.slice(0, 30).map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="num py-1.5">{new Date(row.at).toLocaleTimeString()}</td>
                <td className={row.side === "buy" ? "text-up" : "text-down"}>{row.side}</td>
                <td>{row.symbol}</td>
                <td>{row.rail}</td>
                <td className="num">{row.usd}</td>
                <td className={/fail|403/i.test(row.status) ? "text-down" : ""}>
                  {row.status}
                  {row.errorText ? ` ${row.errorText}` : ""}
                </td>
                <td>
                  {row.txHash ? (
                    <a className="text-gold" href={`https://bscscan.com/tx/${row.txHash}`} target="_blank" rel="noreferrer">
                      {row.txHash.slice(0, 8)}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tape.length ? <p className="mt-3 text-sm text-dim">Fills land here from chain status, not from the quote.</p> : null}
      </div>
    </section>
  );
}
