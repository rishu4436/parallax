# Submission checklist

## Product

- Deployed URL: `https://parallax-puce-seven.vercel.app` (sin1). Worker and wallet login are not on Vercel.
- Routes: `/`, `/markets`, `/markets/NVDA`, `/opportunities`, `/desk`, `/portfolio`, `/activity`, `/strategies`, `/agents`, `/developer`, `/replay`, `/jobs`, `/wallet`.
- Wallet: Binance Web3 Wallet for a human signature. Agentic Wallet (`baw`) on the always-on host for agent sends.
- Walkthrough: [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

## Technical

- Binance Web3 Trading, Transaction, and RWA Data APIs through `packages/web3`.
- BSC mainnet, chain 56.
- SWAP simulation before sign. RFQ has no EVM simulation.
- PolicyEngine, Execution Passport, signing commitment, receipts.
- Agentic Wallet, Agent Studio (`parallaxagent/`), stdio MCP (`apps/mcp`).

## Security

- HMAC secrets stay in server env. The repo does not store them.
- Human keys stay in the wallet. Studio commerce signing is `signing.ts` only.
- Broadcast and RFQ check the commitment hash before submit.
- Quote TTL is 30 seconds. Rails can be locked. Kill switch blocks sends.
- Policy caps apply to agent jobs. A manual user trade still requires a signature.

## Developer experience

- Evidence and requested API notes: [DEVEX.md](DEVEX.md).
- Console: `/developer`. Do not invent latency when the log is empty.

## Demo

- Four minutes. Live pages first. Replay last, and label it.
- Do not click confirm unless a real order is intended.
- If Studio or Agentic Wallet is disconnected, say so.
