# PARALLAX product architecture

Audit of `D:\parallax` as of commit `f30f903` on `main`. This document describes the system as it exists. It does not propose a rewrite and it does not change production code.

---

## Product vision

PARALLAX is a one-page BSC mainnet desk for tokenized US stocks. The same cash name exists as three non-fungible BEP-20 wrappers:

| Rail | Suffix | Example | Typical Binance Web3 route |
| --- | --- | --- | --- |
| bStocks | `B` | NVDAB | LiquidMesh SWAP and PcsXRfq |
| Ondo | `on` | NVDAon | RFQ (InchFusion, CowSwap, PcsXRfq) and, in regular session, sometimes SWAP |
| xStocks | `x` | NVDAx | AMM SWAP |

The product thesis is the hours split: US cash freezes; BNB wrappers can still print. The desk prices every wrapper, scores the cheapest executable rail, and lets a human (or a capped worker) trade the gap. It never holds a user key. Browser fills land in Binance Web3 Wallet. Armed jobs, when the host is signed in, go through Binance Agentic Wallet (`baw`).

The desk is a judge-first trading surface, not a chat toy:

- Observe live rails and cash prints.
- Analyze GROSS vs NET EDGE.
- Simulate the locked rail.
- Execute only after an explicit sign (browser) or an armed, capped worker send (`baw`).

Demo mode exists for a 3–5 minute walkthrough. Demo overlays stay labeled `DEMO DATA`. They do not replace live adapters or invent a fill.

---

## Information architecture

```
pnpm workspace
├── apps/web          Next.js 15 desk + HMAC API (Vercel-capable)
├── apps/agent        Always-on worker (jobs + armed strategies + baw)
├── apps/mcp          Stdio MCP: quote / simulate / advise. Never signs.
├── packages/core     Domain: session, registry, router, jobs, edge, copilot
├── packages/web3     Binance Web3 Trading / RWA / simulate / broadcast
├── packages/config   Env, chain-56 gate, data dir
├── parallaxagent/    BNB Agent Studio seller (A2A + MCP + X402)
├── scripts/desk.mjs  Production local entry: next start + pnpm agent
└── .data/            Jobs, tape, settings, armed strategies (host disk)
```

Three runtimes, three audiences:

1. **Desk UI** (`/` landing, `/desk` trade surface). Humans quote, compare, simulate, sign.
2. **Desk worker** (`pnpm agent` / `pnpm desk`). Cron jobs and armed strategies on one always-on machine that holds the `baw` session.
3. **Studio seller** (`parallaxagent/`). Paid A2A/MCP/X402 agent. Work is a live rail table from the desk API. Studio `signing.ts` is the only Studio signer. It does not swap tokenized stocks.

Secrets stay server-side: `WEB3_API_KEY`, `WEB3_API_SECRET`, Studio keystore under `parallaxagent/.studio/` (gitignored). Client env is only chain id, RPC, and optional WalletConnect project id.

---

## Domain model

### Names and wrappers

Seeded underlyings in `packages/core/src/registry.ts` (verified against Binance RWA list, chain 56):

`NVDA`, `TSLA`, `AAPL`, `AMZN`, `MSFT`, `META`, `GOOGL`, `AMD`, `QQQ`, `SPY`, `CRCL`.

Each has up to three `Wrapper`s (`rail`, `type` 1|2|3, `symbol`, `address`, `decimals`, `multiplier`). Dividends rebase via multiplier. Per-share comparison is `tokenPrice / multiplier`. Wrappers are not fungible. Buying NVDAon does not give NVDAB.

### Quotes

`VenueQuote` is one vendor route: `quoteId`, 30s `quoteExpiresAt`, `executionMode` SWAP|RFQ, `perShare`, slip, gas, `userWalletAddress`, raw body.

`RailBook` is all routes for one wrapper plus `status` OPEN | CLOSED | HALTED | OFFLINE and a mode badge (RFQ, SWAP, AMM, RFQ+SWAP).

`QuoteBook` is the full ticker book: three rails, best executable, Friday/prior/session cash prints, RWA `referencePrice`, `onchainBestPrice`, `gapVsFriday`.

### Edge

Visible formula:

```
NET EDGE = GROSS − SLIP − GAS − FEE
```

Missing slip is **not** invented. `complete` is false until slip is measured. Scan quotes with `slip: false` so NET is incomplete until the selected-ticker book measures $50 / $500 sizes.

### Intent and router

`Intent`: ticker, side, usdt, optional `railLock` / `vendorLock`, wallet, actor `user` | `agent`.

`RouterState`: idle → resolving → quoting → selecting → building → simulating | awaiting_signature → submitting → polling → filled | failed | expired | rail_closed.

Agent intents are capped (`orderCapUsdt`, `dailyCapUsdt`). Manual Buy/Sell (`actor: "user"`) skips those caps. Kill switch blocks both.

### Jobs vs armed strategies

Two job systems share the worker:

| Surface | Persistence | Types | When CONNECTED |
| --- | --- | --- | --- |
| Catalog jobs | `.data/jobs.json` | dca, flatten_earnings, weekend_cap, cheap_rail, gap_fade, open_print | `baw market-order swap`; else queue for human sign |
| Armed loops | `.data/armed.json` | BASIS_TRADE, CROSS_ARB, CORRELATION | Quote + simulate (SWAP) + `baw` send. Never queued for human sign |

Strategy catalog cards (Session DCA, Index core, Cheap rail, Weekend discovery, Prior-close discount, Cash-open window, Flatten earnings) arm through `jobFromStrategy`. Session router is advice only. The three agent types go through `POST /api/arm-job`.

### Settings and risk

```
orderCapUsdt, dailyCapUsdt, allowedRails, killSwitch,
minNetEdgePct, maxSlipPct, minLiquidityUsd, approvalRequired
```

Defaults: 25 / 100 USDT from env, all rails on, kill off, 0.5% min net, 0.5% max slip, $100k min liquidity, approval required. `parseSettings` fills missing risk fields so old `settings.json` still loads.

### Tape and fills

`TapeRow`: human and agent fills, 30 rows. `AgentFill`: armed-loop log, 40 rows. Agent daily spend is NY-day filled tape with `source === "agent"`.

---

## Screen map

### `/` Landing

`apps/web/components/landing.tsx`. Live NVDA quote every 20s. Session chip. Gold “ENTER THE DESK”. Identity: Geist + Instrument Serif, ink on `#07080a`, gold `#f0b90b`. Closed cash session adds a gold fog (`html[data-session]`).

### `/desk` Trade (default)

Left column, judge-first:

1. `SessionStrip` — US cash OPEN/CLOSED vs BSC always OPEN, 24h clock.
2. `OpportunityBoard` — selected ticker GROSS / NET EDGE, rail table.
3. `WhyFlagged` — reasons the name is on the board; limit fails in plain language.
4. `Hero` — name, candle, primary gap vs prior close (else Friday).
5. `Comparison` — three wrappers (demo overlay when DEMO is on).
6. `TradeTicket` — size, price, impact, fee, gas, total, net.
7. `VenueStack` — lock rail, ANALYZE / BUY / SELL. Size lives on the ticket.

Right column:

1. `OpportunityEngine` — ranked scan of every seeded wrapper (`GET /api/scan`, 30s cache).
2. `Copilot` — NL against the live/scan book. Grounded. Can jump, simulate, arm.
3. `RiskControls` — live limits from settings.
4. `AgentExecutionLog` — fills stream (`/api/agent-log` SSE).
5. `StrategyArm` — BASIS / CROSS_ARB / CORRELATION + size within cap.

Chrome: `TopBar` (Trade / Jobs / Wallet, command field, DEMO select, wallet chip, clock). `SettingsSheet`. Full-screen `ConfirmTakeover` for sign.

Mobile: Trade / Jobs / Wallet / Settings tabs.

### `/desk` Jobs

`StrategiesDock` — eight catalog cards + live advice. Session router does not persist a job.

### `/desk` Wallet

`PortfolioDock` + `Tape`. Balances from Binance token-balances API when a wallet is connected.

### Overlays

- Confirm takeover: approve → SWAP (simulate first) → RFQ EIP-712.
- Settings: rails, caps, kill, risk fields.
- DEMO MODE: six labeled scenarios (`gap-closed`, `cross-wrapper`, `low-liq`, `low-edge`, `sim-ok`, `agent-watch`).

---

## Execution lifecycle

Human path (browser Binance Web3 Wallet / injected wagmi, BSC only):

```
select ticker / size
    → POST /api/quote  (quoteIntent, HMAC, slip on buy)
    → lock rail (never silently replaced)
    → POST /api/prepare  (assertBuildAllowed, atomic re-quote if RFQ / wallet drift / stale)
        ├ approve     → sign tx → POST /api/broadcast → requote
        ├ sign-swap   → simulateEvm → confirmGate → sign tx → POST /api/broadcast → wait receipt
        └ sign-rfq    → signer must match quote wallet → signTypedData → POST /api/rfq → poll GET /api/rfq
    → tape.json
```

Rules encoded in `packages/web3/src/prepare.ts` and `packages/core/src/router.ts`:

- Quote TTL is 30 seconds (`QUOTE_TTL_MS`). `/swap` after that is `40401 QUOTE_EXPIRED`.
- `needsSignerQuote` is true for RFQ **and** for Ondo / bStock (those rails bind `userWalletAddress`). Display quotes may use `QUOTE_WALLET`; prepare re-quotes with the connected signer.
- `executionMode` on the route is source of truth. Ondo can return SWAP in regular session. Do not hard-code “Ondo is RFQ-only”.
- SWAP must simulate. `confirmGate` blocks Sign on FAILED simulate. RFQ has no EVM simulate; Sign is allowed while the quote is young.
- 40367 / 40369 → rail CLOSED, no invented price.
- Locked `railLock` / `vendorLock` is preserved across requote.

HMAC client (`packages/web3/src/client.ts`):

- Prehash: `ISO-timestamp + METHOD + /build + path+query + body`.
- Headers: `X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`, `X-OC-RECV-WINDOW: 15000`, `X-OC-NONCE`.
- Max 3 in flight. 429 / 5xx retry with jitter. Metrics in `.data/devex_metrics.json`.

Cash hydration (`packages/web3/src/rwa.ts`):

- Primary: signed RWA Market API (`tokenPrice`, `referencePrice`, `marketData.previousClose`).
- `referencePrice` is an on-chain per-share conversion, **not** NYSE close. It is stored as `book.referencePrice` and is not copied onto `priorClose`.
- `priorClose` is `marketData.previousClose`. Friday close is that print when the last completed session is Friday, else Yahoo/Stooq daily bar.
- Unsigned wallet-direct `rwa/dynamic/ai` is fallback.

---

## Agent lifecycle

### Desk worker (`apps/agent`)

`scripts/desk.mjs` starts `next start` and `pnpm agent` in one process group. Tick every 20s.

Each tick:

1. Kill switch → beat `stopped`, return.
2. `baw wallet status`. CONNECTED → BSC address; else `null`.
3. x402 probe (`AGENT_X402_URL`). 402 → `low`. Unset URL → `low`. Never invent funded.
4. Write `agent.json` beat (`live` if stamped < 30s ago).
5. Due catalog jobs: `quoteIntent` → `decideJob` → if agent wallet, `sendAgentSwap`; else `pushQueue` for human To-sign.
6. `runArmedDesk`: observe BASIS / CROSS / CORRELATION → if fire, quote + `prepareExecution` → skip on failed simulate / reject / expire → `baw market-order swap` at 1% slippage. Cooldown 60s. Not written to the human queue.
7. Friday 16:00 ET: persist cash prints for every underlying.

`baw` is a local CLI. Sign-in is `baw auth signin` (QR + Binance App). Session lives in the host home (Docker volume `baw-home`). LOCKED wallet pauses. The worker does not mint keys. ERC-8004 id is `AGENT_ERC8004_ID` from Studio deploy.

Vercel cannot run this loop. No `baw`, ephemeral disk, no persistent armed jobs.

### Studio seller (`parallaxagent/`)

Scaffolded with `@bnbagent/studio-cli`, runtime AgentCore on **bsc-mainnet**.

- Faces: A2A (`:9000`), MCP (`/mcp`), X402 (`/x402`).
- Commerce: ERC-8183, seller price `"0"` (free). ERC-8004 `agent_id` 357564. Wallet `0x8a4420…0209`.
- Deploy: AWS Bedrock AgentCore `arn:aws:bedrock-agentcore:us-east-1:654784950739:runtime/parallaxagent-Uu1isS4H7B`.
- LLM: Pieverse `auto/free`. LLM never signs and never sets price.
- Work hook `parallaxWork.ts`: HTTP to desk `PARALLAX_BASE` (default `http://127.0.0.1:3020`) `POST /api/quote` or `GET /api/desk`. Deliverable is the live rail table plus “No transaction was signed.”
- `signing.ts` only: `signQuote`, `verifySignedJob`, `submitResult`, `settle`. Keystore outside `app/agent` so deploys cannot bundle it.

Desk pings Studio at `http://127.0.0.1:9000/ping` and reads `studio.toml` address for the `/api/desk` `studio` field.

### Copilot (in-desk, not Studio)

`parseCopilot` / `answerCopilot` are deterministic against opportunity cards. `POST /api/copilot` will fetch `/api/scan` if the client sends no cards. Actions: jump ticker, open analyze, simulate, arm. No LLM required on the desk path.

---

## Design principles

1. **Cash freezes. BNB doesn’t.** Session atmosphere drives copy, fog, and strategy gates. BSC is treated as always open.
2. **Three wrappers, never netted.** Best rail is a scored quote, not a synthetic blend. A locked rail is never swapped for another wrapper.
3. **No invented numbers.** Closed rails stay closed. Missing Friday is “Friday ref unavailable”, never `0`. Unknown slip is omitted from NET and marked incomplete. Demo is labeled.
4. **30-second honesty.** Stale `quoteId` dies. Requote is a first-class control.
5. **Keys stay off the server.** Browser signs in the wallet. Worker signs only through a user-authorized `baw` session on the always-on host. Studio signs only ERC-8183 commerce.
6. **Caps on agents, not on a human Buy.** Kill switch is global.
7. **Trust `executionMode`.** Routing is vendor- and session-dependent.
8. **Gold / ink identity.** Existing Tailwind tokens and kicker type stay. New behavior belongs inside current component boundaries.
9. **BSC mainnet only.** `readEnv` throws on any chain id other than 56.
10. **Judge-first.** Observe → analyze → simulate → execute. Copilot is grounded on the book.

---

## Non-negotiable safety boundaries

- Do not hold user private keys in the Next app, the MCP stdio server, or copilot.
- Do not auto-execute a human confirm. Sign is explicit in `ConfirmTakeover`.
- Do not silently replace `railLock` / `vendorLock`.
- Do not execute when kill switch is on.
- Do not let an agent order exceed `orderCapUsdt` or NY-day `dailyCapUsdt`.
- Do not invent a fill, a price, or a tx hash. Tape status follows broadcast / RFQ / baw poll.
- Do not copy RWA `referencePrice` onto `priorClose`.
- Do not subtract unknown slip from NET EDGE.
- Do not ship demo numbers without a DEMO label.
- Do not register Studio signing functions as LLM tools.
- Do not commit `.env*`, `.vercel`, `.data`, or `parallaxagent/.studio/`.
- Do not run quotes from a US Vercel region (compliance: `sin1`). US functions return a compliance block.
- Do not treat Vercel as the worker host.
- Do not change chain off 56.
- RFQ submit `userWalletAddress` must equal the signer.
- SWAP sign is blocked until simulate is SUCCESS (human path). Armed SWAP skips send on failed simulate.

---

## Existing APIs that must remain compatible

JSON bodies use `{ ok, ... }`. Web3 failures go through `fail()` as `{ ok: false, code, message, body }`.

| Route | Methods | Contract |
| --- | --- | --- |
| `POST /api/quote` | ticker, usdt, side, wallet, railLock | `{ ok, book, advice, plan, session }` |
| `POST /api/prepare` | `{ intent, quote }` | `{ ok, step, ...PrepareResult }` steps: `rejected` \| `expired` \| `approve` \| `sign-rfq` \| `sign-swap` |
| `POST /api/broadcast` | signedTransaction, address, tape | `{ ok, txHash, orderId }` |
| `GET /api/broadcast` | txHash or address | history or orders |
| `POST /api/rfq` | requestId, userSignature, vendor, quoteId, signingScheme, tape | `{ ok, orderId, status }` |
| `GET /api/rfq` | orderId | `{ ok, order }` |
| `GET /api/desk` | ticker, wallet | session, settings, jobs, tape, beat, studio, queue, friday, portfolio, brief, live, armed, workerEnabled, fills, identity |
| `GET\|POST /api/scan` | usdt | `{ ok, cached, at, cards }` 30s cache |
| `POST /api/copilot` | text, cards?, focus? | `{ ok, intent, text, cards, action? }` |
| `POST /api/arm-job` | action arm\|worker\|pause, type, assetPairs, targetSpread, usdt | `{ ok, armed }` size ≤ order cap |
| `GET\|POST /api/jobs` | create \| pause \| remove | `{ ok, jobs }` |
| `GET\|POST /api/settings` | Settings | parseSettings validation |
| `GET\|POST /api/tape` | TapeRow | upsert, max 30 |
| `GET\|POST /api/queue` | id to clear | queued intents |
| `GET /api/agent-log` | `?snapshot=1` or SSE | fills + beat |
| `GET\|POST /api/agentic` | baw status; signin / verify / signout | `{ ok, status, address }` |
| `GET /api/kline` | address | candles |

Studio and MCP stdio both call `/api/quote` and `/api/desk`. Changing those shapes breaks Agent Studio deliverables and `parallax_quote` / `parallax_advise`.

Stdio MCP tools (`apps/mcp`, none sign):

`parallax_resolve`, `parallax_quote`, `parallax_best`, `parallax_simulate`, `parallax_advise`, `parallax_status`, `parallax_portfolio`, `parallax_weekend_brief`.

Studio MCP tools (`/mcp`): `negotiate`, `notify_funded`, plus read-only chain tools. Different product surface. Keep the names distinct.

Binance Web3 paths the client already signs:

- `GET /api/v1/dex/aggregator/quote`
- `GET /api/v1/dex/aggregator/swap`
- `GET /api/v1/dex/aggregator/approve-transaction`
- `POST /api/v1/dex/aggregator/order/submit`
- `GET /api/v1/dex/aggregator/order/:id`
- `GET /api/v1/dex/aggregator/history`
- `POST /api/v1/dex/pre-transaction/simulate`
- `POST /api/v1/dex/pre-transaction/broadcast-transaction`
- RWA list / price / underlying-market

---

## Components that can be reused

Keep and extend inside current boundaries:

| Piece | Why |
| --- | --- |
| `packages/core` types, router, session, registry, jobs, opportunity, flag, copilot | Domain is already the source of truth |
| `packages/web3` client, book, prepare, rwa, trading, transaction | HMAC, TTL, RFQ requote, simulate |
| `persist.ts` file layout | Worker and web already share `.data` |
| `ConfirmTakeover` | Only complete human sign path |
| `OpportunityBoard`, `WhyFlagged`, `TradeTicket`, `RiskControls` | Judge-first column |
| `VenueStack` ANALYZE / BUY / SELL | Rail lock + wallet gate |
| `SessionStrip` | Dual-clock story |
| `Comparison` + demo overlay | Cross-wrapper story |
| `Copilot` + `CommandField` | Grounded NL + ticker jumps |
| `StrategiesDock` + `StrategyArm` | Full catalog plus three agent arms |
| `AgentExecutionLog` + SSE | Live worker proof |
| `TopBar` DEMO select + wallet chip | Identity + walkthrough |
| `wagmi.ts` Binance connector + BSC-only transport | Signing wallet |
| `flag.ts` DEMO_SCENARIOS | Labeled walkthrough data |
| Studio `signing.ts` / `parallaxWork.ts` | Commerce vs desk split is correct |
| `docs/DEVEX.md` | HMAC, 40401, 40367/40369, TradFi hydration |

Zustand store (`apps/web/lib/store.ts`) is the desk session: quote, scan, confirm draft, demo, activity. New UI should read it rather than fetching ad hoc.

---

## Components that should be replaced

These are leftover or overlapping. Replace or delete in a later change; do not wire new product through them.

| Piece | Issue |
| --- | --- |
| `build-panel.tsx` | First buy / baskets / plain-rule builder. Not mounted on `/desk`. |
| `left-rail.tsx` | Icon nav from an earlier chrome. Desk uses TopBar + mobile tabs. |
| `weekend-dock.tsx` | Weekend brief UI. SessionStrip + Jobs + copilot cover the same story. Unused. |
| Dual opportunity UIs | `OpportunityEngine` (universe scan) and `OpportunityBoard` (selected ticker) overlap in language. Keep both roles; do not add a third “gap” card. |
| `COPY.strategies` and `docs/STRATEGIES.md` “worker never signs” | False once `baw` is CONNECTED. Catalog jobs and armed loops send. Copy must match `apps/agent`. |
| `DeskAdapters` in `adapters.ts` | Interface only. Live code calls `@parallax/web3` directly. Either implement adapters or stop implying a seam. |
| README MCP list | Missing `parallax_advise`. Studio vs stdio MCP are conflated in prose. |
| `PARALLAX_BASE` default `:3020` | Desk listens on `PORT` or 3000. Studio deliverables miss the desk unless env is set. |
| Nested `parallaxagent/app/agent/pnpm-lock.yaml` | Local install residue. Workspace lock is `parallaxagent/pnpm-lock.yaml`. |

---

## Technical risks

1. **Split brain: Vercel vs worker.** Production UI is `https://parallax-puce-seven.vercel.app/desk`. Armed jobs, tape, settings, and `baw` live only on the machine that runs `pnpm desk`. Judges hitting Vercel see UNCONNECTED agentic status, default 25 USDT caps, and empty jobs.

2. **Two wallets.** Display/quote wallet (`QUOTE_WALLET` or connected address) vs Agentic Wallet BSC address vs Studio seller wallet. RFQ fails if they diverge. Armed sends use `baw`, not the browser signer.

3. **Armed path skips RFQ typed data.** Worker `sendAgentSwap` is always `baw market-order swap`. Prepare may return `sign-rfq`; the loop still market-swaps the wrapper token. Ondo-heavy arms can diverge from the human RFQ path.

4. **Quote fan-out vs 429.** Scan quotes every underlying × rails with `MAX_WEB3_IN_FLIGHT = 3`. Scan `maxDuration = 60`. A cold scan can be slow or rate-limited. 30s cache hides this until it expires.

5. **Slip incomplete on scan.** Opportunity engine ranks NET with `slip: false`, so `complete` is often false and slip is 0. Board/ticket on the selected ticker measure slip. Ranking can overstate NET.

6. **Cash reference mix.** Hero prefers prior close; scan prefers prior close else Friday else RWA reference. Those are different numbers. Explain the label every time.

7. **Simulate does not block RFQ.** Honest, but judges can read “simulated” on an RFQ ticket as a chain simulation. Ticket already says `RFQ · no EVM simulate`. Keep that.

8. **Agentic Wallet App confirm.** `baw` LOCKED / double-confirm stalls clips. Worker marks pending and retries. Not a silent fill.

9. **Studio wallet funding.** ERC-8004 verify and on-chain submit need BNB on `0x8a4420…`. Zero balance blocks `bag deploy verify` even when `agent_id` exists.

10. **HMAC / region.** Wrong prehash (`/build` missing) → 40102. US function region → compliance error. Singapore pin is load-bearing.

11. **TTL during confirm.** Confirm is a full-screen modal; quotes still age. Requote is required. Opening confirm does not freeze the 30s clock (`freshExpiry` is stamped at quote arrival).

12. **Persistence is local JSON.** No locking beyond process tick guard. Two workers on one `PARALLAX_DATA_DIR` will race. Vercel `/tmp/parallax` evaporates.

13. **Test coverage is domain-heavy, UI-light.** `pnpm test` runs session, router, jobs, strategies, friday, settings, plainRule, plan, loops, opportunity, copilot, flag, web3 client, rwa, execute. No tests for confirm-takeover, API routes, store, MCP, or Studio `parallaxWork`.

14. **Docs drift.** README still says jobs “stop at an unsigned intent.” Worker sends when CONNECTED. Leftover “Ondo is RFQ-only” / “cash prints are Yahoo bars” language is a scoring risk against live books.

15. **Identity vs density.** Trade column now stacks session, board, why, hero, comparison, ticket, venues. Risk of repeating the same gap three times. Prefer one GROSS/NET authority (board + ticket) and keep hero as identity.

---

## Deployment map

| Target | What runs | What does not |
| --- | --- | --- |
| `pnpm dev` | Next dev :3000 | Worker unless started separately |
| `pnpm build` && `pnpm desk` | `next start` + agent | Requires `.next` |
| Docker Compose | Image with `baw` + `desk.mjs`, volumes `parallax-data`, `baw-home` | Needs `baw auth signin` once in the container |
| Vercel `apps/web`, region `sin1`, alias `parallax-puce-seven.vercel.app` | Desk UI + API quotes/simulate/broadcast | Worker, baw, durable `.data` |
| `bag deploy --provider aws` | Studio AgentCore runtime | Desk quotes unless `PARALLAX_BASE` reaches a live desk |

GitHub: `https://github.com/rishu4436/parallax.git` `main`. Vercel deploys that branch.

---

## Tests (current suite)

Root `pnpm test` (`tsx --test`):

- `packages/core`: session, router, jobs, strategies, friday, settings, plainRule, plan, loops, opportunity, copilot, flag
- `packages/web3`: client, rwa
- `apps/agent`: execute

These tests are the compatibility net for router gates, edge math, demo scenarios, HMAC retry, and baw argument shape. New product work should add to this list rather than bypass it.
)
