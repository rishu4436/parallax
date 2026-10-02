# Architecture

PARALLAX is a pnpm monorepo. BSC mainnet only (chain id 56).

## Packages and apps

| Path | Role |
| --- | --- |
| `packages/core` | Types, policy, passport, commitment, receipt, strategies, markets, replay scripts. No Binance HTTP. |
| `packages/web3` | `web3Fetch`, quotes, RWA, simulate, broadcast, balances, devex log. |
| `apps/web` | Next.js desk. API routes hold the HMAC secret. |
| `apps/agent` | Worker. Quotes, passports, Agentic Wallet sends. |
| `apps/mcp` | Stdio tools. Never signs. |
| `parallaxagent/` | Agent Studio seller. A2A, MCP, X402. Signs commerce in `signing.ts` only. |

## Storage

Local desk and worker use JSON under `PARALLAX_DATA_DIR` (`FileStore`). `VERCEL=1` or `PARALLAX_STORE=memory` uses process memory and reports `durable: false`. Passports, commitments, and receipts are separate files. The Passport body does not contain calldata.

## Execution

Human SWAP: quote, prepare, simulate, wallet sign, broadcast, receipt. The broadcast route checks the signing commitment before it submits.

Human RFQ: EIP-712 sign, commitment check, submit, poll. No EVM simulation.

Agent: strategy or catalog job, quote, passport, policy, commitment, `baw` market order, receipt. The model does not sign.

## Replay

`/replay` reads `DEMO_SCENARIOS` and `evaluateLimits`. State stays in the page. It does not write tape, passports, receipts, jobs, or wallet.

## Telemetry

`web3Fetch` appends a safe path, status, and latency to `devex_metrics.json` (last 200). `/developer` reads that file. Query strings are stripped on new rows.

## Deploy

Vercel serves `apps/web` (region sin1, alias `https://parallax-puce-seven.vercel.app`). It can quote. It cannot keep `baw` or a durable job file. Docker Compose service `parallax` publishes port 3000 and is the always-on desk. Studio calls that desk through `PARALLAX_BASE`, default `http://127.0.0.1:3000`.
