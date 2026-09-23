# DEVEX

Written while wiring PARALLAX to BSC mainnet on 22 Sep 2026. Cash session at the first quote run was regular, 12:05 America/New_York. Ondo’s public dynamic endpoint reported `openState: true`, `marketStatus: regular` for NVDAon at the same time. The Trading API never returned a price in this environment because no key was present.

## Time to first `/quote`

The first live call was an unauthenticated GET:

`https://web3.binance.com/build/api/v1/dex/aggregator/quote?binanceChainId=56&fromTokenAddress=0x55d398326f99059fF775485246999027B3197955&toTokenAddress=0xc845b2894dbddd03858fd2d643b4ef725fe0849d&amount=10000000000000000000&userWalletAddress=0x0000000000000000000000000000000000000001`

HTTP 401, body:

```json
{"code":40101,"timestamp":1790092123948,"msg":"API Key is required","data":""}
```

That round trip was a single request, well under a second. It is not a quote.

`pnpm quote` then ran the real book: refresh multipliers from the public RWA list, quote NVDAB / NVDAon / NVDAx at 10, 50, and 500 USDT, and pull Friday’s cash close. Wall clock 4826 ms. The quote book itself was 3787 ms. Every rail came back `40101 API Key is required`. No price was filled in. Registry addresses matched the live list with zero mismatches. Friday cash close resolved from Yahoo’s daily chart as **2026-09-18 $222.27**.

## Docs that were wrong or incomplete

Authentication is not an API key header. [Authentication](https://web3.binance.com/en/dev-docs/authentication) requires `X-OC-APIKEY`, `X-OC-TIMESTAMP`, and `X-OC-SIGN`, where the signature is Base64 HMAC-SHA256 over `timestamp + METHOD + /build + path + query + body` using a secret. A hackathon brief that only says `WEB3_API_KEY` cannot call `/quote`. PARALLAX also reads `WEB3_API_SECRET`.

The amount example on Get Aggregated Quote says `"1000000" = 1 USDT (decimals=6)`. That is Ethereum USDT. BSC USDT `0x55d398326f99059fF775485246999027B3197955`, USDC, and USD1 are all **18 decimals**, confirmed with `decimals()` on mainnet. A 6-decimal amount buys dust and looks like a broken price.

The introduction says equity tokens always return `executionMode=RFQ`, then three paragraphs later says xStock is AMM `SWAP` and bStock is mixed LiquidMesh + PcsXRfq. Both statements are in the same page. The second one is the one that matches the product. Trust `executionMode` on the route, not the overview sentence.

`POST /order/submit` is described in the flow as `{ order, requestId }`. The generated OpenAPI client (binance-web3-connector-python, 2026-09) takes `requestId`, `userSignature`, `vendor`, `quoteId`, `signingScheme`. `quoteId` on submit is `rfq.orderId` from `/swap`, not necessarily the `/quote` quoteId. `typedDataToSign` is documented as hex or a JSON string. There is no full EIP-712 fixture per vendor.

`userWalletAddress` is optional in the schema and required for RFQ. Ondo without it fails the route. The failure mode is easy to misread as “market closed”.

`/quote` error list includes 40367 and 40369, but the gateway answers 40101 before any vendor is contacted when the key is missing. You cannot tell a closed Ondo market from a missing key unless you read `code`.

## Error bodies captured

40101, live, all three NVDA rails, 22 Sep 2026:

```json
{"code":40101,"timestamp":1790093110955,"msg":"API Key is required","data":""}
```

40367, 40369, 40401, and RFQ `FAILED` were not returned in this run. The clock was inside the regular cash session, so those codes were not the thing blocking the book. The client appends those codes, plus 40441 and 40462, to `docs/live-errors/errors.jsonl` with the full JSON body when they happen. Until a key is set, that file stays empty and the UI prints `40101 API Key is required` on the row.

Known meanings from the error-code page, not from a live body:

| Code | Name | When |
| --- | --- | --- |
| 40367 | ONDO_MARKET_STATE_NOT_TRADABLE | Ondo underlying cash market is closed or halted |
| 40369 | BStock outside exchange hours | bStock window is shut |
| 40401 | QUOTE_EXPIRED | `/swap` after the ~30s quote cache |

## SWAP vs RFQ time sinks

- Building the prehash with the query string the client actually sent, including `/build`. A signature over the path without `/build` is 40102, which looks like a bad secret.
- BSC decimals. The first mental model (6) would have quoted a billionth of a dollar.
- Deciding the spender. `approveTarget` is informational. `/approve-transaction` with `vendor=<vendorName>` is what returns calldata, and the vendor is required for RFQ even when the sold token is USDT.
- Not reusing `quoteId`. After 30 seconds the only legal move is a new `/quote`. Retrying submit uses the same `requestId`. A new `requestId` is a new order.
- xStock does not enter the RFQ path. Treating NVDAx like NVDAon wastes a typed-data signature against an AMM router.
- Simulation is `POST /pre-transaction/simulate` with `{ binanceChainId, evmTx: { from, to, value, data } }`. It is not `eth_call` and it is not available for RFQ. Showing a fake simulate line on an RFQ is worse than showing the quoted output and the TTL.

## Suffix mixups

`NVDA`, `NVDAB`, `NVDAon`, and `NVDAx` are four different strings and three contracts. Resolved 22 Sep 2026 from `.../rwa/stock/detail/list/ai?type=1|2|3`, chainId 56:

| Symbol | Address |
| --- | --- |
| NVDAB | `0x02fca66c1d1afb4e2a7884261eb00f63598a7436` |
| NVDAon | `0xa9ee28c80f960b889dfbd1902055218cba016f75` |
| NVDAx | `0xc845b2894dbddd03858fd2d643b4ef725fe0849d` |

The same shape holds for TSLA, AAPL, AMZN, MSFT, META, GOOGL, AMD, QQQ, SPY, CRCL. Multipliers are not 1.000 on several Ondo names (NVDAon was 1.0017152487959898). Comparing token price to the cash print without dividing by the multiplier invents a gap. `pnpm quote` checks the live list and prints `REGISTRY MISMATCH` if an address moved.

## Latency

Quote book for three rails at three sizes: **3787 ms** end to end, dominated by serial-looking parallel fan-out against a gateway that rejected each call with 40101. A successful quote plus `/swap` plus simulate was not measured. Expect the happy path to add those two calls inside the 30 second TTL, so the UI prepares the unsigned transaction immediately on BUY instead of waiting for another human click.

## Slip, $15 vs $500, after hours

Not measured. Slip bps in the product are the change in per-share price between the trade size and the $50 and $500 quotes. With no key, both columns render `—`, not zero. After hours the interesting comparison is xStock (often still an AMM) against Ondo 40367 and bStock 40369. That table is the product. It needs a key to exist.

## What to change in the developer platform

1. A hackathon quote credential, or a clearly documented unauthenticated quote, so a missing key is not the only thing a judge can see during a live demo. 40101 on an open cash session looks like the product is down.
2. Put decimals next to the amount example, per chain. BSC USDT is 18. The current example is a foot-gun.
3. One error object per rail inside HTTP 200 when some vendors quote and some are closed. Today a thrown 40367 and a thrown 40101 take the same client path only because we wrap each rail. The raw API fails the whole call.
4. Publish one EIP-712 fixture for InchFusion, CowSwap, and PcsXRfq, and say which id `/order/submit` wants.
5. Delete the sentence that says equity tokens always return RFQ, or scope it to Ondo.
6. Add `fridayClose` to the RWA dynamic payload. `stockInfo.price` is the live cash print and is null off-session, so it cannot be the Friday reference. Builders are left scraping a chart vendor for the number the whole product is about.
7. Say, in the quote reference, that `tradeFee` is USD and `estimateGasFee` is wei. Scoring “after gas” is a guess without that sentence.
