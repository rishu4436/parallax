# PARALLAX developer experience

Written from live BSC mainnet calls. The clock on the successful book below is Thursday 24 Sep 2026, 13:21 America/New_York, regular session, US cash open. Chain id is 56. Base URL is `https://web3.binance.com/build`.

## Time to first successful quote

Two secrets are required. `WEB3_API_KEY` alone is not enough. The gateway checks `X-OC-SIGN`, which is Base64 HMAC-SHA256 over the secret in `WEB3_API_SECRET`. PARALLAX reads both from the repo `.env` and refuses any chain id other than 56.

The prehash the server actually verifies is:

`timestamp + METHOD + /build + path + query + body`

`timestamp` is an ISO-8601 string (`new Date().toISOString()`), not unix milliseconds. The path includes the `/build` prefix even though that prefix is also the host path. A signature over the path without `/build` is rejected before any vendor is contacted. The query string in the prehash has to be the exact string appended to the URL, including parameter order.

Headers on every call:

- `X-OC-APIKEY`
- `X-OC-TIMESTAMP`
- `X-OC-SIGN`
- `X-OC-RECV-WINDOW: 15000`
- `X-OC-NONCE` a UUID
- `content-type: application/json` when there is a body

The first live attempt in this environment, 22 Sep 2026, was an unsigned GET of `/api/v1/dex/aggregator/quote` for 10 USDT of NVDAx. HTTP 401, one round trip, well under a second. Body:

```json
{"code":40101,"timestamp":1790092123948,"msg":"API Key is required","data":""}
```

That is not a quote. A later signed call with the `/build` segment missing from the prehash returned HTTP 200-class business failure `40102` (the transport status varies; the body is what matters). Captured body:

```json
{"msg":"Invalid signature","timestamp":1790095696233,"code":40102,"data":""}
```

BSC USDT `0x55d398326f99059fF775485246999027B3197955` has 18 decimals. The amount example on Get Aggregated Quote (`"1000000"` = 1 USDT at 6 decimals) is the Ethereum USDT example. Sending that on BSC buys dust and looks like a broken price. PARALLAX sizes with `toBaseUnits` at 18.

Once the prehash included `/build` and both secrets were set, `pnpm quote` (`tsx scripts/quote-nvda.ts`) produced a real book. Wall clock 3783 ms, of which the quote book was 3130 ms. No 429 fired, so the backoff path did not add wait. The registry check against `.../rwa/stock/detail/list/ai?type=1|2|3` matched every seeded address.

10 USDT buy, wallet `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (display-only fallback; it is not a signing wallet):

- bStock NVDAB, LiquidMesh, executionMode SWAP, quoteId `73080a55a75b48cebbf5951e83c9b752`, $224.27 per share, about 0.0446 NVDAB out, slip 3 / 3 bps at $50 / $500, status OPEN
- Ondo NVDAon, LiquidMesh, executionMode SWAP, quoteId `398e91061514402a8c462ee628e7b491`, $224.33 per share, about 0.0445 NVDAon out, slip 0 / 0, status OPEN
- xStock NVDAx, no route, status HALTED

Best executable print was NVDAB at $224.27. The gap the desk prints is `((onchainBestPrice - fridayClose) / fridayClose) * 100`. On this book that is `(224.27 - 222.27) / 222.27 * 100 = +0.90%`. Versus the prior close ($225.51 on 2026-09-23) it is `-0.55%`. Session open 2026-09-24 was $222.12.

The introduction still says equity tokens always return `executionMode=RFQ`. This book did not. NVDAon came back LiquidMesh SWAP during a regular session. Trust `executionMode` on the route. PARALLAX still re-quotes Ondo and bStocks with the connected wallet before building an order, because a later route on those rails can be InchFusion, CowSwap, or PcsXRfq, and those fail if `userWalletAddress` is not the signer.

## TradFi hydration (RWA Data API)

Yahoo chart `interval=1d&range=1mo` and Stooq daily CSV still exist as fallbacks. The primary source is the signed Binance Web3 RWA Data API on the same `WEB3_API_BASE` as trading:

| Call | Path | What it returns |
| --- | --- | --- |
| Get RWA Token Price | `GET /api/v1/dex/market/rwa/price?binanceChainId=56&tokenContractAddresses=addr,addr` | `tokenPrice` (on-chain USD) and `referencePrice` (per-share conversion of that on-chain price) |
| Get RWA Underlying Market | `GET /api/v1/dex/market/rwa/underlying-market?binanceChainId=56&tokenContractAddress=addr` | `marketData.previousClose` / `open` / `lastPrice` / `referencePrice` for the cash underlying |

`referencePrice` on both payloads is documented as a per-share conversion of the on-chain token, not an official NYSE print. PARALLAX stores it on `book.referencePrice` and does **not** copy it onto `book.priorClose`. `book.priorClose` is `marketData.previousClose` (the last completed regular session). `book.fridayClose` is that same print when the last completed session *is* Friday (weekend and Monday open); otherwise the daily chart still supplies the Friday 16:00 ET bar. `hydrateCashPrints` merges the two so a Wednesday book can have Tuesday from RWA and Friday from the chart.

The public wallet-direct dynamic snapshot (`.../rwa/dynamic/ai`) is the unsigned fallback when the signed Market API is down. It can carry `stockInfo.price` and, when present, `stockInfo.previousClose`.

Gap on the hero, venue stack, weekend dock, and `pnpm quote`:

```
((onchainBestPrice - fridayClose) / fridayClose) * 100
```

`onchainBestPrice` is the best executable per-share quote, else the RWA `tokenPrice`. A missing Friday print renders "Friday ref unavailable". It never becomes `0`.

## The 30-second TTL wall (error 40401)

`/quote` caches `quoteId` for about 30 seconds. `GET /swap` after that returns `QUOTE_EXPIRED`, code `40401`. Catalog `Message` (this is the `msg` string): `Quote expired. Please request a new quote`. Endpoint: `/swap` only. HTTP status is 200; the body carries the business code. Envelope, matching the live 40374 sibling and the published Trading API error format:

```json
{"code":40401,"msg":"Quote expired. Please request a new quote","data":null,"timestamp":1718000000000,"success":false}
```

The `timestamp` in that block is the catalog example (`1718000000000`). This run stayed inside the window, so `40401` was not returned by the gateway. `captureError` appends the untouched JSON to `docs/live-errors/errors.jsonl` the moment it is. `freshExpiry` stamps every route with `Date.now() + 30_000` as soon as the quote bytes arrive, not when the modal opens.

What eats the window:

- The book fans out a primary quote plus $50 and $500 slip quotes per rail. Those HMAC calls share a concurrency cap of 3 (`MAX_WEB3_IN_FLIGHT`) so a burst does not trip 429. The cap kept this book at 3130 ms, which leaves most of the 30 seconds.
- HTTP 429 and any 50x (500–599) retry at most 3 times. Backoff is 350 ms, then 700 ms, then 1400 ms, plus up to 30 percent jitter. A thrown `fetch` is retried on the same schedule.
- The human still has to read the price and open a wallet.
- SWAP then needs `GET /swap` and `POST /pre-transaction/simulate` before the sign button enables.
- RFQ skips simulate. It needs an EIP-712 signature, `POST /order/submit`, and a poll of `GET /order/{orderId}`.

PARALLAX does not ask the user to click Build and then click Sign. BUY or SELL on an open rail calls prepare immediately. For a SWAP route that is still young and was quoted for this same wallet, prepare calls `/swap`, then `/pre-transaction/simulate` with `{ binanceChainId, evmTx: { from, to, value, data } }`, and only then opens the modal. `confirmGate` leaves SIGN disabled while simulate is pending or `FAILED`. A failed simulate is rewritten into a plain sentence (missing balance, missing BNB for gas, short allowance). The modal shows a conic countdown ring bound to the same 30 second stamp. At zero, SIGN drops out and REQUOTE / CANCEL remain.

If `/swap` throws `40401`, prepare returns step `expired` with the text `40401 QUOTE_EXPIRED` instead of a stuck spinner. REQUOTE requests a new `/quote`. Retrying submit keeps the same `requestId`. A new `requestId` is a new order. `quoteId` on submit is `rfq.orderId` from `/swap` when that field is present, not blindly the `/quote` id.

## RFQ parity and atomic re-quote

RFQ display quotes may use the fallback wallet so the book can render before anyone connects. That quote must not be executed. Ondo **and** bStocks bind `/quote` to `userWalletAddress` (`needsSignerQuote`). xStock AMM does not. If an Ondo or bStock rail is selected and no browser wallet is connected, the gold control says `Connect Binance Web3 Wallet` and does not call prepare.

When a wallet is connected and the user hits BUY or SELL on a signer-bound rail, prepare throws away the display `quoteId` and re-quotes that rail atomically with `userWalletAddress` set to the signer, then checks `signer.toLowerCase() === quote.userWalletAddress.toLowerCase()`. A mismatch aborts with `Quote wallet does not match the signer. Requoting.` and the client runs that re-quote once more. The same check runs again in the modal before `signTypedData`. The fresh `quoteId` is passed to `/swap` immediately so EIP-712 typed data is in the modal before the 30 second TTL dies.

`executionMode` still decides the signing payload. Ondo SWAP (LiquidMesh, as in this book) goes through simulate then `signTransaction`. Ondo or bStock `executionMode=RFQ` goes through EIP-712 then `/order/submit`. The wallet constraint is the rail, not the badge.

## Off-hours error handling

Business errors from the trading API usually arrive as HTTP 200 with a non-zero `code`. Transport failures are different: missing key was HTTP 401, and rate limits are HTTP 429. A client that only branches on HTTP status will treat a closed Ondo market and a successful empty body as the same kind of event, or miss the closed market entirely.

This run was inside the regular session, so codes `40367` and `40369` were not returned. NVDAB and NVDAon both quoted OPEN. The published catalog names them `ONDO_MARKET_STATE_NOT_TRADABLE` and `BSTOCK_INVALID_TRADING_TIME`. The `msg` field on sibling RWA errors is a sentence, not the constant name. Raw bodies, same envelope as the live 40374 capture below, catalog `Message` in `msg`:

Ondo off-hours (`40367` `ONDO_MARKET_STATE_NOT_TRADABLE`):

```json
{"code":40367,"msg":"Current time is outside of trading hours","data":null,"timestamp":1718000000000,"success":false}
```

bStocks off-hours (`40369` `BSTOCK_INVALID_TRADING_TIME`):

```json
{"code":40369,"msg":"The BStock token's underlying stock exchange is currently closed (outside trading hours).","data":null,"timestamp":1718000000000,"success":false}
```

`timestamp` `1718000000000` is the catalog example, the same sentinel as 40401. `captureError` writes the untouched JSON to `docs/live-errors/errors.jsonl` the moment a live `40367` or `40369` arrives, including the server timestamp.

The RWA error this book did return, NVDAx, captured 24 Sep 2026:

```json
{"code":40374,"msg":"Insufficient liquidity for a quote. Please decrease the transaction amount or try again later.","data":null,"timestamp":1790270492205,"success":false}
```

`statusFor` maps `40367` and `40369` to rail status `CLOSED` with the text `40367 US hours` or `40369 US hours`. `40374` maps to `HALTED` because it is a liquidity miss, not a clock. `CLOSED` and `HALTED` are row states. They are not thrown out of the quote fan-out, and they do not blank the other rails. In this book NVDAx was HALTED while NVDAB and NVDAon stayed OPEN and priced. The same isolation is what keeps the xStock AMM row on screen when Ondo or bStocks later comes back closed. The desk does not synthesize a price for a closed rail. The Friday and prior closes still render, and the hero gap uses the live BSC print when no route is executable.

xStock is the AMM path (`executionMode=SWAP`, wrapper type 2). It does not follow the Ondo session clock. It can still be HALTED, as it was here, when no pool will quote the size. That is a different fact from "the cash market is shut," and the row says so.

## SWAP versus RFQ

Two architectures share `/quote` and then diverge. The 30 second `quoteId` is the only thing they have in common after that.

**Synchronous EVM SWAP** (regular crypto, xStock AMM, bStock LiquidMesh, and the Ondo LiquidMesh print this session actually returned):

```
GET /quote  →  GET /swap  →  POST /pre-transaction/simulate  →  sign tx  →  POST /broadcast-transaction  →  receipt
```

1. `GET /quote` returns `quoteId`, amounts, `executionMode=SWAP`, and usually `approveTarget`.
2. If the wallet allowance is short, `GET /approve-transaction` returns calldata. For an RFQ vendor the `vendor` query is required even when the sold token is USDT. The user signs an approve, it is broadcast, and the swap is quoted again.
3. `GET /swap` returns `tx.to`, `tx.data`, `tx.value`.
4. `POST /pre-transaction/simulate` runs that exact unsigned transaction. This is not `eth_call`, and it is not offered for RFQ. Showing a fake simulate line on an RFQ is worse than showing the quoted output and the TTL.
5. The wallet signs the transaction. PARALLAX broadcasts the signed raw tx. The fill is a chain receipt. After sign, there is no server poll: the next fact is the hash.

**Asynchronous EIP-712 RFQ** (Ondo InchFusion / CowSwap / PcsXRfq, bStock PcsXRfq):

```
GET /quote  →  GET /swap  →  signTypedData  →  POST /order/submit  →  GET /order/{orderId} loop
```

1. `GET /quote` must carry the signer as `userWalletAddress`. The fallback display wallet is illegal here. PARALLAX re-quotes atomically at click with the connected wallet so this step and the signature share an address.
2. `GET /swap` returns `rfq.typedDataToSign`, `rfq.vendor`, and an order id. There is still no published EIP-712 fixture per vendor, so the client parses whatever JSON or hex string comes back. This call must land inside the 30 second TTL or it is `40401`.
3. The wallet signs typed data. The signer has to be the same address as step 1. Nothing has hit the chain yet.
4. `POST /order/submit` takes `requestId`, `userSignature`, `vendor`, `quoteId`, and an optional `signingScheme`. The documented `{ order, requestId }` shape does not match the generated client, which wants the signature and the vendor.
5. `GET /order/{orderId}` is polled until `FILLED`, `FAILED`, `EXPIRED`, or `CANCELLED`. Intermediate states are `PENDING_VENDOR` and `PENDING_ONCHAIN`. A `FAILED` status is a fill result, not an application crash. The tape records it and the modal closes.

The SWAP path is synchronous once the user signs: simulate already happened, broadcast either lands or reverts. The RFQ path is asynchronous after the signature. The signature is not a transaction. The only id that makes the poll mean anything is the one from `/swap`, captured inside the same 30 second window as the quote. Reusing a display `quoteId` that was fetched for the fallback wallet, or polling with the `/quote` id instead of `rfq.orderId`, produces a silent miss.

`tradeFee` on a quote is USD. `estimateGasFee` is wei. Scoring "after gas" without that distinction invents a number. PARALLAX subtracts `tradeFee` converted at the quoted per-share price, and shows simulate balance changes for the signer when the SWAP simulation returns them.

## What would make the platform easier to build on

1. A sandbox with a clock. There is no way, during a regular session, to force `40367` or `40369` for a demo. A testnet or a header that freezes the vendor clock at Sunday 18:00 ET would let a judge see a CLOSED Ondo row next to an OPEN xStock row without waiting for the cash close. An unauthenticated quote credential would have saved the first day, which was only `40101`.

2. One error schema across the aggregator and the RFQ market makers. Today a missing key is HTTP 401 with `code` `40101`, a bad signature is `40102` with fields in a different order, a closed market is HTTP 200 with `code` `40367`, and a rate limit is HTTP 429 with or without a JSON body. Return HTTP 200 and one object per rail when some vendors quote and some are closed, with the same field order (`code`, `msg`, `data`, `timestamp`, `success`). Publish the exact `msg` sentence next to the constant name. And delete, or scope, the sentence that says equity tokens always return RFQ. This book is the counterexample: NVDAon was LiquidMesh SWAP at 13:21 ET.

3. A persistent RFQ intent. The 30 second `quoteId` dies while the user reads a simulation and confirms in the Binance wallet. A channel that accepts the intent once, refreshes the quote server-side until the signature arrives, and then binds that signature to the latest unseen quote would remove the requote race. Until that exists, builders will keep doing what PARALLAX does: re-quote at the moment of signing, simulate SWAP before the modal enables SIGN, and show the remaining seconds on the ring.

Retries around the gateway are a local necessity, not a product feature. Outgoing calls to `WEB3_API_BASE` are queued at 3 in flight across every wrapper, slip quote, swap, and RWA price call. HTTP 429 and 50x retry at most 3 times. The waits are 350 ms, 700 ms, and 1400 ms, plus up to 30 percent jitter so a burst does not retry in lockstep. Network `fetch` failures use the same backoff. Each retry is appended to `.data/devex_metrics.json` with the status, time to first byte, and the backoff that was slept. This successful book did not need a retry.
