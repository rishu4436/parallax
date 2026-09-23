# PARALLAX strategies

Not advice. Tokens are not shares. No voting. Dividends rebase into the token. Every job queues an unsigned intent. The desk worker never signs. The user signs in Binance Web3 Wallet.

These jobs exist because the same US name is three BEP-20s on BSC, cash hours and on-chain hours are different clocks, and a quote dies in 30 seconds.

## What each rail is

| Rail | Suffix | Product | Hours the Trading API will quote | Execution on Binance Web3 |
| --- | --- | --- | --- | --- |
| bStocks | `B` | 1:1 backed BEP-20 from BTech Holdings. Dividends reinvest via a multiplier. Not a share. | Often 24/7 on Binance Spot and on-chain; the Web3 aggregator still returns **40369** (`BSTOCK_INVALID_TRADING_TIME`) when it treats the underlying exchange as closed. |
| Ondo | `on` | Total-return tracker from Ondo Global Markets (BVI). Fully backed. One token is not one share: reinvested dividends (net of withholding) raise shares-per-token. Display multiplier on BNB Chain. | Generally 24/5, plus an Off-Hours session for a short list (including NVDAon, TSLAon, GOOGLon, SPYon, QQQon, CRCLon). **40367** (`ONDO_MARKET_STATE_NOT_TRADABLE`) when the platform says the underlying is closed or halted. |
| xStocks | `x` | Tracker certificate from Backed, 1:1 collateralized. Secondary markets 24/7; issuer mint/redeem is 24/5. | AMM **SWAP**. No RFQ route. |

They are not fungible with each other or with the cash listing. Buying NVDAon does not give you NVDAB. There is no primary redeem that turns one wrapper into another.

Per-share comparison **must** divide token price by the live multiplier. A 1.05× accumulating token at $210 against a $200 cash print is not a 5% premium.

Sources: [Ondo Stocks overview](https://docs.ondo.finance/ondo-stocks/overview), [Ondo token & quote pricing](https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing), [xStocks FAQ](https://docs.xstocks.fi/docs/frequently-asked-questions), [Binance bStocks announcement](https://www.binance.com/en/support/announcement/detail/2c0c92ed15ac42d1b14bb1eac00d22bb), [Binance Web3 Trading API introduction](https://web3.binance.com/en/dev-docs/products/trading-api/introduction), [error codes](https://web3.binance.com/en/dev-docs/products/trading-api/error-codes).

## The edge the desk can actually see

1. **Hours split.** Cash is Regular 09:30–16:00 America/New_York. Ondo and bStock RFQ often go blank outside that window. xStock AMM may still print. That print is a thin book versus Friday close, not a cash print.
2. **Cross-rail cheapness.** When two rails are OPEN, per-share (after multiplier, after the scored quote) can differ. The desk can accumulate the cheaper claim. It cannot complete a risk-free arb: the wrappers never net.
3. **Cash prints.** The desk reads Yahoo daily bars once and keeps four numbers: **prior close** and **prior open** (last completed regular session — yesterday on a weekday, Friday on a weekend), **session open** (today’s regular open once the bar exists), and **Friday close** (weekend gap). `gap = (perShare − ref) / ref`. Off-hours those cash numbers are frozen while the wrapper can still move. Friday-only was the original weekend thesis; on a Wednesday it is four sessions stale.
4. **Event windows.** Earnings, dividends, and 40365-family halts. Ondo may pause around ex-date. Flatten is a size job, not a view on the print.

Practitioner notes, not a guarantee:

- Tokenized weekend volume is a small slice of weekday volume; spreads widen. ([Coincub / Cong et al. summary](https://coincub.com/blog/24-7-tokenized-asset-trading/), [DefiLlama bStocks after hours](https://defillama.com/research/spotlight/bstocks-after-hours-who-is-capturing-liquidity-when-markets-close))
- Some weekend token moves have led Monday’s cash open (Binance Research on bStocks reported high directional hit rates in a short 2026 sample). Short-horizon off-hour prints on a single thin venue also reverse. The desk therefore has **two** gap jobs: follow a rich gap, buy a cheap gap. They are opposites. Do not arm both on the same name without reading the tape.
- Kraken’s xStocks FAQ states off-hours mismatch has historically been under 1% by Monday open, with wider spreads while cash is shut.

## Jobs the worker will queue

All jobs respect kill switch, order cap, daily cap, and “no open rail”. Soft misses retry in two minutes. A queued intent consumes the cadence. The worker still cannot see token balances, so flatten sells a USDT notional, not a position percent.

| Job | What it queues | Default gate |
| --- | --- | --- |
| **Session DCA** | Buy `usdtEach` on each ticker | Rail OPEN. Optional `maxPremiumPct` skips a rich-versus-**prior close** print. |
| **Index core** | Same DCA on QQQ and SPY | Weekday 09:30 ET, 2% premium cap vs prior close. |
| **Cheap rail** | Buy the cheaper OPEN rail | ≥ two OPEN rails and per-share spread ≥ `minBps` (default 40). Locks that rail. Slip on the cheap rail ≤ 80 bps when known. |
| **Weekend discovery** | Buy when gap **above Friday close** | Friday is the weekend clock. Queue for cash open, or trade if a rail is open. |
| **Prior-close discount** | Buy when gap **below prior close** | Yesterday’s session on a weekday; Friday on a weekend. Same queue/trade modes. |
| **Cash-open window** | Buy a leftover discount after 09:30 ET | Regular session, inside `windowMin` (default 30). Gap vs **prior close**. Once per `et.ymd`. |
| **Flatten earnings** | Sell before the print, optional dip buy, optional post-market flatten | Print time required. Each leg once. |

**Session router** is advice, not a job. It names the rails that are actually OPEN. Cash live → prefer OPEN Ondo/bStock. Cash dark → treat whatever still quotes as a thin book versus Friday. 40367/40369 bind some windows; they are not every off-hour clock. On 23 Sep 2026 in the pre-market window, NVDAB and NVDAon quoted OPEN (SWAP) while NVDAx was HALTED for liquidity.

## Baskets, first buy, and plain rules

The Jobs view starts with three builders.

- **First buy** picks one name, sets a size, and opens Trade. The buyer is told the token is not a share.
- **Baskets** split a USDT total across AI chips, mega caps, the index, or consumer names. Arm creates a weekday DCA job. Buy opens Trade for one slice.
- **Write a rule** turns a sentence into a job the worker already knows: DCA, cheap rail, Friday gap, prior-close discount, cash-open window, or earnings flatten. Arm saves it. The worker queues the clip. You sign.

## What the agent says

Studio `parallaxWork` reads `/api/quote` (which now returns `advice`) and `/api/desk` for weekend. Prompts that mention strategy/advise get the full advice list. Quote and best still append `fire` and `info` lines. MCP tool `parallax_advise` returns the same object. None of those paths sign.

## What we did not encode

- Cross-rail round-trip arb.
- Automatic sells of a rich cash-open premium (the user can SELL on the desk).
- Position-percent flatten (the worker has no wallet inventory).
- Typical realized slip at $10–$25. DEVEX did not measure it; jobs that care about slip only skip when `slipKnown` is true.
- Live 40367/40369 bodies in `docs/live-errors` — those codes are from the public error list, not a captured fill in this repo.

Caps default to 25 USDT per order and 100 USDT per New York day. Quotes expire in 30 seconds (`40401 QUOTE_EXPIRED`). A locked rail is never silently replaced.
