# PARALLAX

Cash freezes. BNB doesn’t. Trade the gap.

PARALLAX is a one-page trading surface for tokenized US stocks on BNB Smart Chain mainnet. The same company can exist as three different BEP-20s:

| Rail | Suffix | Example | Route |
| --- | --- | --- | --- |
| bStocks | `B` | NVDAB | LiquidMesh SWAP and PcsXRfq |
| Ondo | `on` | NVDAon | RFQ (InchFusion, CowSwap, PcsXRfq) |
| xStocks | `x` | NVDAx | AMM SWAP |

They are not fungible. Binance Web3 Trading API is the only quote and execution layer. Quotes die in 30 seconds. PARALLAX never holds a key. You sign in Binance Web3 Wallet. Fills land in that wallet. Spot only.

## Install

```bash
pnpm install
cp .env.example .env
```

Get a free Web3 API key and secret from the [Binance Web3 developer portal](https://web3.binance.com/en/dev-docs/authentication). A Binance account or Binance Web3 Wallet is enough for hackathon access. Put them in `.env`:

```
WEB3_API_KEY=
WEB3_API_SECRET=
WEB3_API_BASE=https://web3.binance.com/build
```

Every Trading and Transaction call is HMAC-signed. The key stays on the server (`apps/web/app/api`). Fund the wallet with USDT and a little BNB for gas on BSC mainnet (chain id 56).

```bash
pnpm quote          # live NVDA rails, or the live error body
pnpm test           # session clock and router gates
pnpm dev            # http://localhost:3000
pnpm --filter @parallax/agent start
pnpm --filter @parallax/mcp start
```

## What you are signing

BUY quotes every wrapper, marks the best open rail, and opens a full-screen confirm. SWAP orders are simulated with the Transaction Simulate API before the wallet signs. RFQ orders sign EIP-712 typed data, submit to `/order/submit`, and poll until filled or failed. A locked rail is never silently replaced by a different wrapper.

Caps default to 25 USDT per order and 100 USDT per New York day. The kill switch pauses the agent and rejects new builds.

Jobs the desk worker will queue, and the live advice the Strategies dock and Studio agent read, are in [docs/STRATEGIES.md](docs/STRATEGIES.md). Session DCA, index core, cheap rail, weekend discovery, Friday discount, cash-open window, and flatten earnings all stop at an unsigned intent.

## Agent Studio

The hackathon agent is the Studio project in `parallaxagent/`, scaffolded with `@bnbagent/studio-cli@0.0.14` on **bsc-mainnet**. Faces are A2A, MCP, and X402. Commerce is ERC-8183 plus B402. The seller price is free. Delivery calls the PARALLAX desk (`PARALLAX_BASE`, default `http://127.0.0.1:3020`) and returns the live rail table. Signing stays in `app/agent/src/signing.ts`. The model does not sign.

```bash
cd parallaxagent
pnpm install
# from app/agent, after the desk is running:
bag wallet new --generate-password
bag doctor
bag dev
```

`bag dev` serves A2A on port 9000 and MCP at `/mcp`. ERC-8004 registration happens at deploy time with `bag deploy` and `bag deploy verify`, after you fund the Studio wallet and switch storage off local disk.

`apps/agent` is the older local ticker. It still queues intents for the desk and does not replace Studio.

`apps/mcp` exposes `parallax_resolve`, `parallax_quote`, `parallax_best`, `parallax_simulate`, `parallax_status`, `parallax_portfolio`, and `parallax_weekend_brief`. None of them sign.

## Eligibility

US, UK, and other regions listed by the hackathon rules cannot enter. This software is not an offer to those regions.

Not investment advice. These tokens are not shares. They do not vote. Dividends rebase into the token.
