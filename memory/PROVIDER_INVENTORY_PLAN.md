# Provider inventory test plan — NOT RUN

User requested a review before any Kraken/Coinbase probe or backend test. Implementation is local; no asset is newly registered as verified supported. This plan uses the frozen CoinGecko public ranking retrieved 2026-09-27T09:15:20.053470Z (per-coin `last_updated` values were not frozen), sorted by original market-cap rank **before** provider checks. First 50 qualifying IDs plus seven distinct original-22 IDs = **57 candidates**. USDC remains cash/reserve, never a new paper-entry coin. Exclusions through rank 63: stablecoins USDT USDC USDS USDE DAI USD1 USDG PYUSD RLUSD USDD and cash-equivalent USYC BUIDL USDY (13); no candidate was skipped due to exchange difficulty. See `backend/albert/frozen_coingecko_universe.json` for names, IDs and original ranks.

## Predicted pair inventory (NOT provider availability claims)

For each row: attempt an *actual* CCXT `load_markets()` exact active spot **USD** market on **Kraken**, then **Coinbase** only for missing capabilities. Pair in the last column is the expected unified pair **on each approved provider**, NOT a declaration that either lists it. Record returned exchange ID, base/baseId, quote, active/spot, exact pair and any alias. Never try USDT or a different underlying as a fallback.

| Original rank | Frozen CoinGecko asset ID | Strategy symbol | Expected unified USD pair — Kraken & Coinbase (unverified) |
|---:|---|---|---|
| 1 | bitcoin | BTC | BTC/USD (Kraken raw XBT alias must be verified) |
| 2 | ethereum | ETH | ETH/USD |
| 4 | binancecoin | BNB | BNB/USD |
| 5 | ripple | XRP | XRP/USD |
| 7 | solana | SOL | SOL/USD |
| 8 | tron | TRX | TRX/USD |
| 9 | zcash | ZEC | ZEC/USD |
| 10 | figure-heloc | FIGR_HELOC | FIGR_HELOC/USD; do not shorten or substitute |
| 11 | hyperliquid | HYPE | HYPE/USD |
| 12 | dogecoin | DOGE | DOGE/USD (Kraken raw XDG alias must be verified) |
| 13 | chainlink | LINK | LINK/USD |
| 14 | monero | XMR | XMR/USD |
| 15 | whitebit | WBT | WBT/USD |
| 17 | cardano | ADA | ADA/USD |
| 18 | rain | RAIN | RAIN/USD; check ticker identity, not name alone |
| 19 | leo-token | LEO | LEO/USD |
| 20 | stellar | XLM | XLM/USD |
| 21 | near | NEAR | NEAR/USD |
| 22 | bitcoin-cash | BCH | BCH/USD |
| 23 | uniswap | UNI | UNI/USD |
| 24 | litecoin | LTC | LTC/USD |
| 25 | canton-network | CC | CC/USD; verify which CC asset |
| 26 | sui | SUI | SUI/USD |
| 28 | avalanche-2 | AVAX | AVAX/USD |
| 30 | the-open-network | GRAM | GRAM/USD; former TON pair cannot be accepted without ID proof |
| 32 | hedera-hashgraph | HBAR | HBAR/USD |
| 33 | bittensor | TAO | TAO/USD |
| 34 | shiba-inu | SHIB | SHIB/USD; sub-cent raw price required |
| 35 | crypto-com-chain | CRO | CRO/USD |
| 37 | bitway | BTW | BTW/USD; verify ticker identity |
| 39 | memecore | M | M/USD; verify ticker identity |
| 40 | ethena | ENA | ENA/USD |
| 41 | tether-gold | XAUT | XAUT/USD; gold-priced, not a stablecoin |
| 42 | ondo-finance | ONDO | ONDO/USD |
| 43 | quant-network | QNT | QNT/USD |
| 44 | okb | OKB | OKB/USD |
| 47 | aave | AAVE | AAVE/USD |
| 50 | mantle | MNT | MNT/USD |
| 51 | polkadot | DOT | DOT/USD |
| 52 | pump-fun | PUMP | PUMP/USD |
| 53 | worldcoin-wld | WLD | WLD/USD |
| 54 | aster-2 | ASTER | ASTER/USD |
| 55 | morpho | MORPHO | MORPHO/USD |
| 56 | pax-gold | PAXG | PAXG/USD |
| 57 | pepe | PEPE | PEPE/USD; sub-cent raw price required |
| 58 | world-liberty-financial | WLFI | WLFI/USD |
| 59 | sky | SKY | SKY/USD; confirm asset ID versus any older MKR listing |
| 60 | internet-computer | ICP | ICP/USD |
| 62 | arbitrum | ARB | ARB/USD |
| 63 | htx-dao | HTX | HTX/USD; verify ticker identity |
| 73 | polygon-ecosystem-token | POL (legacy MATIC) | POL/USD; never assume MATIC/USD equals POL/USD without ID proof |
| 82 | cosmos | ATOM | ATOM/USD |
| 84 | filecoin | FIL | FIL/USD |
| 94 | aptos | APT | APT/USD |
| 137 | optimism | OP | OP/USD |
| 90 | injective-protocol | INJ | INJ/USD |
| 118 | celestia | TIA | TIA/USD |

## Checks and pass criteria (per coin, independently)

1. **Identity beyond symbol**: frozen CoinGecko ID -> public `/coins/{id}/tickers?exchange_ids=kraken|gdax` (verify exchange IDs via CoinGecko `/exchanges/list`) -> returned `coin_id`, `market.identifier`, base/target and market URL -> exact CCXT active spot market ID/unified symbol/base/baseId/USD quote. A same-ticker market without ID evidence is `UNVERIFIED`, particularly POL/MATIC, GRAM/TON, CC, M and RAIN. Never stitch a renamed asset's old and new histories without migration proof. One correctly proven provider suffices; an unqueried second provider remains `UNVERIFIED`.
2. **Real observation freshness**: record HTTP retrieval time **separately** from provider ticker event time. CCXT `coinbase` uses Coinbase Advanced Trade public endpoints; `kraken` uses Kraken public endpoints. If CCXT ticker has no event timestamp, require a recent timestamped public trade and use *that trade's own price*. If the event is older than 60 seconds, missing or not demonstrably from this market, mark `FRESHNESS_UNPROVEN`; retrieval within 60 seconds alone cannot pass. No rounded-zero mark or daily-close fill.
3. **History coverage versus implementation**: report raw fetched rows, distinct sorted closed UTC days, first/last dates, discarded open/duplicate rows and **every missing interval** in the feature window without forward-filling. Kraken can return up to 720 entries including an open candle; CCXT `coinbase` (Advanced Trade, not `coinbaseexchange`) caps each candle page at 300 and can omit no-trade intervals. Confirm exact method, underlying HTTP endpoint and count, and fetch time. Existing engine features require 50 days SMA50, 200 days SMA200, 15 days RSI14, 31 days ROC30/volatility, 30 days USD liquidity, 20 days invalidation low, and **365 days for the one-year high/confidence**. 365 contiguous closed days is the latter features' coverage check, NOT the definition of permanent asset support. If short/gapped, name the affected feature, block scoring/BUY until adequate coverage; don't weaken a lookback to pass.
4. **Execution metadata versus cost assumptions**: record exchange price/amount precision, ticks, min/max amount/cost/price and taker fee/bid-ask where actually exposed. Separately label paper fees/spread/slippage as conservative **assumptions**. Simulated BUY and reduce-only SELL must satisfy venue quantization/limits and portfolio risk/position limits. No unverifiable prices, precision or fills.
5. **Outcome**: per-provider `PASS` only for checks proven; both providers failing a required capability => exact `BLOCKED` reason. Unqueried, rate-limited, ambiguous or incomplete = `UNVERIFIED`, never forced passing. Even a provider pass does **not** register an asset as strategy-supported until isolated synthetic scoring/journey/accounting/backtest regression passes. Keep inventory evidence and synthetic results in separate reports.
6. **No side effects**: public catalog/identity/ticker/trades/candles only; no private endpoints, keys, Mongo writes, strategy/wallet creation, paper fills or production mutation. Record per-coin actual provider pair/market ID, identity evidence, two timestamps, candles/gaps, precision/limits and exact blocker.

## Request limits and stop conditions

- Ranking selection is frozen; no CoinGecko market-cap refresh during inventory. Use CCXT `kraken` and `coinbase` (Coinbase **Advanced Trade public** adapter, not `coinbaseexchange`) with `enableRateLimit=True`; verify actual endpoint URLs from public requests. CoinGecko `/exchanges/list` and the two CCXT market catalogs have a **separate maximum of 12 catalog HTTP requests** combined; count them and stop if exceeded.
- **Hard ceiling: 342 total asset-level HTTP requests across CoinGecko identity pages AND Kraken/Coinbase ticker, trades and OHLCV pages, including failed attempts and any bounded retries.** Count at the HTTP layer, not just top-level CCXT method calls. Never attempt the 343rd call. Max 1 request/second/provider; on 429 cool down once within the same budget or stop, never evade rate limits.
- Prefer Kraken only where it proves the specific capability; Coinbase is fallback per missing capability. Kraken daily history is normally one page (up to 720), Coinbase daily pages at most three (300 each), but ticker-without-event-time may require one extra public trades request and CoinGecko identity pages also consume the same 342-request budget. These extras supersede the earlier simple 342-call estimate; **stop early and mark remaining checks UNVERIFIED** rather than exceed the ceiling. Record actual per-provider/identity/catalog counts and endpoint names. A non-queried Coinbase row is UNVERIFIED, not a pass or failure.
- Never call `create_order`, balances, private or authenticated endpoints. No frontend testing agent and no deployment.

## Backend synthetic phase — separate, after inventory approval

Use isolated fixtures and synthetic Gemini responses to check each **provider-passing** coin's own scoring components, authoritative BUY/HOLD/WAIT/SELL, draft → validate → save → Start-on-WAIT → Review approval → Autopilot BUY/SELL → accounting/ledger reconciliation → complete and incomplete backtests. Test unsupported picks regenerate, explicit user coins/weights never change without agreement; Start and rejected approvals produce zero side effects; outage blocks BUY and any exit lacking a valid live price but does not erase holdings/exits. Only after this and the live inventory pass may `verifiedAssetIds`/per-coin attestation be updated. Run no real Gemini calls and no live paper trades in this phase.
