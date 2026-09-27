# Frozen top-50 plus original-22: 57-asset capability matrix

**Status:** locally IMPLEMENTED adapter, Studio and paper guards; synthetically VERIFIED for selected individual code paths only; **0/57 VERIFIED SUPPORTED**, **0 DEPLOYED**. This is not a live-trading permission list. Frozen CoinGecko ranking retrieved **2026-09-27T09:15:20.053470Z**, source `backend/albert/frozen_coingecko_universe.json`; first 50 qualifying original market-cap ranks plus 7 distinct original-22 IDs; USDC is cash/reserve only. Token names/ranks were chosen before exchange checks. MATIC is retained on old lots/contracts but shares canonical CoinGecko ID `polygon-ecosystem-token` with POL; no implicit conversion of its historical bars or allocations.

**Raw inventory cautions:** `PROVIDER_INVENTORY_RESULTS.json` recorded public exchange observations but mislabeled some provider checks VERIFIED; `PROVIDER_INVENTORY_ADJUDICATION.md` explains why they are **not** identity proof. **46/57** CoinGecko ID lookups got HTTP 429; the reported **319 asset + 2 catalog** figure counts CCXT method calls, **not actual HTTP requests**. Consequently identity and HTTP-budget compliance remain UNVERIFIED. In the table, `K`/`C` are *preliminary observed* Kraken/CCXT Coinbase (`coinbase`, Advanced Trade) pair + unique closed-day count—not support certifications. `—` means no proven fresh quote/365-day history; consult raw JSON for precise quote timestamp/limits/gaps. All rows need isolated per-coin canonical BUY/HOLD/WAIT/SELL, Review/Autopilot, exits, ledger and backtest proof before final registration.

| Rank | CoinGecko asset ID | Asset | K pair · closed days observed | C pair · closed days observed | Exact current blocker / missing proof | Status |
|---:|---|---|---|---|---|---|
| 1 | bitcoin | BTC | BTC/USD · 402 | BTC/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 2 | ethereum | ETH | ETH/USD · 402 | ETH/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 4 | binancecoin | BNB | BNB/USD · 402 | BNB/USD · 340 | CG identity 429; Coinbase year-high short, Kraken data preliminary | IMPLEMENTED / UNVERIFIED |
| 5 | ripple | XRP | XRP/USD · 402 | XRP/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 7 | solana | SOL | SOL/USD · 402 | SOL/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 8 | tron | TRX | TRX/USD · 402 | — | CG identity 429; Kraken data preliminary, Coinbase no USD spot market | IMPLEMENTED / UNVERIFIED |
| 9 | zcash | ZEC | ZEC/USD · 402 | ZEC/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 10 | figure-heloc | FIGR_HELOC | — | — | Neither approved venue has exact USD spot pair | BLOCKED: NO_EXACT_SPOT_USD_PAIR |
| 11 | hyperliquid | HYPE | HYPE/USD · 242 | HYPE/USD · 234 | Both venues lack 365-day year-high/confidence coverage; CG identity 429 | BLOCKED: INSUFFICIENT_YEAR_HIGH_LOOKBACK |
| 12 | dogecoin | DOGE | DOGE/USD · 402 | DOGE/USD · 402 | CG identity 429; Kraken XDG alias needs ID proof | IMPLEMENTED / UNVERIFIED |
| 13 | chainlink | LINK | LINK/USD · 402 | LINK/USD · 402 | CG ID matched; native product-ID link, HTTP count, full journey unproven | IMPLEMENTED / UNVERIFIED |
| 14 | monero | XMR | XMR/USD · — | — | Kraken freshness unproven; Coinbase no USD pair; history unqueried | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 15 | whitebit | WBT | WBT/USD · — | — | CG identity 429; Kraken freshness unproven, Coinbase no USD pair | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 17 | cardano | ADA | ADA/USD · 402 | ADA/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 18 | rain | RAIN | — | — | Neither approved venue has exact USD spot pair; identity 429 | BLOCKED: NO_EXACT_SPOT_USD_PAIR |
| 19 | leo-token | LEO | — | — | Neither approved venue has exact USD spot pair; identity 429 | BLOCKED: NO_EXACT_SPOT_USD_PAIR |
| 20 | stellar | XLM | XLM/USD · 402 | XLM/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 21 | near | NEAR | NEAR/USD · 402 | NEAR/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 22 | bitcoin-cash | BCH | BCH/USD · 402 | BCH/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 23 | uniswap | UNI | UNI/USD · 402 | UNI/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 24 | litecoin | LTC | LTC/USD · 402 | LTC/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 25 | canton-network | CC | CC/USD · 321 | — | Year-high/confidence need 365; ticker ID 429; Coinbase no USD pair | BLOCKED: INSUFFICIENT_YEAR_HIGH_LOOKBACK |
| 26 | sui | SUI | SUI/USD · 402 | SUI/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 28 | avalanche-2 | AVAX | AVAX/USD · 402 | AVAX/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 30 | the-open-network | GRAM | — | — | No exact GRAM/USD; TON rename NOT proven same-ID market/history | BLOCKED: NO_EXACT_SPOT_USD_PAIR / RENAMED_ID_UNPROVEN |
| 32 | hedera-hashgraph | HBAR | HBAR/USD · 402 | HBAR/USD · 402 | CG ticker ID differs (hedera); migration evidence missing | UNVERIFIED: ID_MISMATCH |
| 33 | bittensor | TAO | TAO/USD · 402 | TAO/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 34 | shiba-inu | SHIB | SHIB/USD · — | SHIB/USD · — | Both public quotes lack fresh provider event; history not measured | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 35 | crypto-com-chain | CRO | CRO/USD · 402 | CRO/USD · 402 | CG ticker ID differs (cronos); migration evidence missing | UNVERIFIED: ID_MISMATCH |
| 37 | bitway | BTW | — | — | No exact USD spot market; frozen ID/candidate not corroborated by venue | BLOCKED: NO_EXACT_SPOT_USD_PAIR |
| 39 | memecore | M | — | — | No exact USD spot market; one-letter ticker ambiguous | BLOCKED: NO_EXACT_SPOT_USD_PAIR |
| 40 | ethena | ENA | ENA/USD · 402 | ENA/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 41 | tether-gold | XAUT | XAUT/USD · — | — | Kraken freshness unproven, Coinbase no USD pair; CG identity 429 | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 42 | ondo-finance | ONDO | ONDO/USD · 402 | ONDO/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 43 | quant-network | QNT | QNT/USD · 402 | QNT/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 44 | okb | OKB | OKB/USD · 177 | — | Only observed venue lacks 365-day year-high; Coinbase no USD spot pair | BLOCKED: INSUFFICIENT_YEAR_HIGH_LOOKBACK |
| 47 | aave | AAVE | AAVE/USD · 402 | AAVE/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 50 | mantle | MNT | MNT/USD · — | — | Kraken freshness unproven, Coinbase no USD pair; CG identity 429 | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 51 | polkadot | DOT | DOT/USD · 402 | DOT/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 52 | pump-fun | PUMP | PUMP/USD · 402 | PUMP/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 53 | worldcoin-wld | WLD | WLD/USD · 402 | WLD/USD · 402 | CG ticker ID differs (worldcoin); migration evidence missing | UNVERIFIED: ID_MISMATCH |
| 54 | aster-2 | ASTER | ASTER/USD · 342 | ASTER/USD · — | Both venues lack 365-day year-high coverage or fresh mark | BLOCKED: INSUFFICIENT_YEAR_HIGH_LOOKBACK |
| 55 | morpho | MORPHO | MORPHO/USD · — | MORPHO/USD · 402 | CG identity 429; Coinbase data preliminary, Kraken freshness unproven | IMPLEMENTED / UNVERIFIED |
| 56 | pax-gold | PAXG | PAXG/USD · 402 | PAXG/USD · — | CG identity 429; Kraken data preliminary, Coinbase freshness unproven | IMPLEMENTED / UNVERIFIED |
| 57 | pepe | PEPE | PEPE/USD · 402 | PEPE/USD · 402 | CG identity 429; precision/identity/full journey unproven | IMPLEMENTED / UNVERIFIED |
| 58 | world-liberty-financial | WLFI | WLFI/USD · — | WLFI/USD · — | Both venue quotes freshness unproven; CG identity 429 | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 59 | sky | SKY | SKY/USD · — | SKY/USD · — | Both venue quotes freshness unproven; CG identity 429 | BLOCKED CURRENT ENTRY: FRESHNESS_UNPROVEN |
| 60 | internet-computer | ICP | ICP/USD · 402 | ICP/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 62 | arbitrum | ARB | ARB/USD · 402 | ARB/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 63 | htx-dao | HTX | — | — | Neither approved venue has exact USD spot pair | BLOCKED: NO_EXACT_SPOT_USD_PAIR |
| 73 | polygon-ecosystem-token | POL (legacy MATIC) | POL/USD · — | POL/USD · 402 | CG identity 429; MATIC→POL migration and identity proof missing | UNVERIFIED: RENAMED_ID / HISTORY_UNJOINED |
| 82 | cosmos | ATOM | ATOM/USD · — | ATOM/USD · 402 | CG identity 429; Coinbase data preliminary, Kraken freshness unproven | IMPLEMENTED / UNVERIFIED |
| 84 | filecoin | FIL | FIL/USD · — | FIL/USD · 402 | CG identity 429; Coinbase data preliminary, Kraken freshness unproven | IMPLEMENTED / UNVERIFIED |
| 94 | aptos | APT | APT/USD · 402 | APT/USD · 402 | CG identity 429; full journey unproven | IMPLEMENTED / UNVERIFIED |
| 137 | optimism | OP | OP/USD · — | OP/USD · 402 | CG ID matched; Coinbase native product link/HTTP count/full journey unproven | IMPLEMENTED / UNVERIFIED |
| 90 | injective-protocol | INJ | INJ/USD · 402 | INJ/USD · 402 | CG ticker ID differs (injective); migration evidence missing | UNVERIFIED: ID_MISMATCH |
| 118 | celestia | TIA | TIA/USD · 402 | TIA/USD · 402 | CG ID matched; native product-ID link/HTTP count/full journey unproven | IMPLEMENTED / UNVERIFIED |

**Operational rule:** Start is permitted only for a registered, fully attested path (even when the engine says WAIT). A fresh public event-time price, actual market precision/limits, canonical decision and applicable risk gates are still required for a BUY or a valid SELL. Outages cannot fabricate an exit or delete positions/history. The present manifest has **no** `verifiedAssetIds`; all new BUYs fail closed. This is a **not-yet-deployed preview change**, not evidence that any 57-coin trade has executed.
