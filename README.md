# PARALLAX

Execution intelligence for tokenized equities on BNB Smart Chain.

Discover markets, assess an executable quote, enforce policy, prepare a passport, and keep an audit trail from the signed payload to the receipt. The same cash name can exist as three different BEP-20 wrappers. They are not fungible. A gap against a cash reference is not a guaranteed arbitrage, and this desk does not compute PnL.

Not advice. Tokens are not shares. No voting. Dividends rebase into the token.

## Product

| Surface | Route | What it does |
| --- | --- | --- |
| Overview | `/` | Product home. Cash session, scan state, current quote, and recent tape. |
| Markets | `/markets`, `/markets/[ticker]` | Directory and one underlying. Live rails, reference, and fees when Binance sent them. |
| Opportunities | `/opportunities` | Cross-rail screen. Gross gap, net edge, and policy preview. |
| Desk | `/desk` | Trade preparation. Confirm, simulate, and sign. |
| Portfolio | `/portfolio` | Wallet balances. A missing price stays blank. No cost basis. |
| Activity | `/activity` | Stored tape, passports, commitments, and receipts. |
| Strategies | `/strategies` | Catalog advice and armed jobs. |
| Agents | `/agents` | Agentic Wallet, worker, Agent Studio ping, and MCP tools. |
| Developer | `/developer` | Observed Binance calls from the devex log. |
| Replay | `/replay` | Deterministic scenarios. No live order. Not in the primary nav. |

Jobs and Wallet stay at `/jobs` and `/wallet`. They are desk utilities.

## Lifecycle

```text
Markets → Opportunities → Policy → Execution Passport → Authorized signing → Execution → Activity / Receipt
```

Human SWAP:

```text
Quote → Prepare → Simulate → Confirm → Wallet sign → Broadcast → Chain receipt
```

Human RFQ:

```text
Quote → Requote for the signer → Prepare → EIP-712 signature → RFQ submit → Poll → Fill or failure
```

Agent:

```text
Strategy → Decision → Quote → Passport → Policy → Agentic Wallet → Execution → Receipt
```

The model does not sign. MCP does not sign. The Developer Console does not sign. Guided Replay does not sign. PolicyEngine is deterministic. The Passport is the execution context. The signing commitment is a hash of the payload that was prepared. Broadcast and RFQ submit reject a payload that does not match that hash.

## Rails

| Rail | Suffix | Example | What the route decides |
| --- | --- | --- | --- |
| bStocks | `B` | NVDAB | `executionMode` on the returned route. Can be SWAP or RFQ. |
| Ondo | `on` | NVDAon | Same. Not permanently RFQ-only. A regular-session book has returned SWAP. |
| xStocks | `x` | NVDAx | AMM SWAP in the books observed here. |

Rails can be OPEN, CLOSED, or HALTED on their own. A closed rail is not given a synthesized price. Quotes expire in 30 seconds (`40401` on a late swap or RFQ submit). Chain id is 56 only.

## Live and replay

Live reads and, when you explicitly confirm, live signatures go through Binance Web3 and the connected wallet or the Agentic Wallet session.

Replay (`/replay`) walks `DEMO_SCENARIOS` through `evaluateLimits`. It does not write the tape, passports, receipts, jobs, or wallet. It stops before a signature. It is not a PnL simulator.

## Install

```bash
pnpm install
cp .env.example .env
```

Set `WEB3_API_KEY` and `WEB3_API_SECRET` from the [Binance Web3 developer portal](https://web3.binance.com/en/dev-docs/authentication). Both stay on the server. `WEB3_API_BASE` is `https://web3.binance.com/build`. Fund the wallet with USDT and a little BNB for gas.

```bash
pnpm dev            # http://localhost:3000
pnpm test
pnpm quote          # live NVDA book, or the live error body
pnpm agent          # desk worker
pnpm mcp            # stdio MCP, never signs
```

Default caps are 25 USDT per order and 100 USDT per New York day. The kill switch blocks execution.

## Always-on desk

Vercel can serve the site. It cannot keep the worker or the Agentic Wallet login. Run those on a machine that stays on. Job files use `PARALLAX_DATA_DIR`. On Vercel the store is process memory (`durable: false`).

```bash
docker compose up -d --build
docker compose exec parallax baw auth signin
```

The site is on port 3000. A connected `baw` session can send a job that passes policy. A signed-out session leaves the job to be signed by a person.

`pnpm desk` starts the site and `pnpm agent` together.

## Agentic Wallet

`apps/agent` ticks catalog jobs and armed strategies. Catalog jobs quote, issue a passport with `AGENTIC_MARKET`, and send with `baw` when the session is connected. Armed strategies can simulate a SWAP and then send the market order. The wallet signs. The worker does not invent a fill.

`GET /api/agentic` reports CONNECTED or not. The Agents page shows that status.

## Agent Studio

`parallaxagent/` is the Studio project (`bsc-mainnet`). Faces: A2A, MCP, X402. Commerce is ERC-8183 and B402. Seller signing stays in `parallaxagent/app/agent/src/signing.ts`. The model does not sign market orders.

Delivery calls the desk at `PARALLAX_BASE`. The default is `http://127.0.0.1:3000`, the same port as `pnpm dev` and Docker. Set the variable if the desk is elsewhere.

```bash
cd parallaxagent
pnpm install
bag dev    # A2A on port 9000, MCP at /mcp
```

The desk reports Studio ONLINE only after its ping succeeds. A `studio.toml` file is not treated as a live runtime. ERC-8004 registration is a deploy step (`AGENT_ERC8004_ID`), not something the desk invents.

## MCP

`apps/mcp` is stdio. It does not sign.

- `parallax_resolve`
- `parallax_quote`
- `parallax_best`
- `parallax_simulate`
- `parallax_passport`
- `parallax_policy`
- `parallax_advise`
- `parallax_status`
- `parallax_portfolio`
- `parallax_weekend_brief`

Studio MCP is a separate face inside `parallaxagent`. Do not treat the two as one server.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/STRATEGIES.md](docs/STRATEGIES.md)
- [docs/DEVEX.md](docs/DEVEX.md)
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md)
- [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md)
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

## Known limits

The worker and `baw` are not durable on Vercel. Studio delivery needs a reachable `PARALLAX_BASE`. Local JSON is the desk store on a long-running machine. Quote TTL is 30 seconds. RFQ does not get an EVM simulation. Portfolio does not invent cost basis. Scan cards can omit liquidity, slippage, gas USD, or price impact. Those fields stay blank.

US, UK, and other regions excluded by the program rules are not offered this software.
