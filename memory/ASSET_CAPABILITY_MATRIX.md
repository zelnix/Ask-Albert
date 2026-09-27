# Ask Albert — frozen 57-asset simulation capability matrix

**Product boundary:** Simulation only. `backend/albert/frozen_coingecko_universe.json` pins 50 selected CoinGecko IDs plus seven original assets (USDC is reserve cash, not a strategy leg). This table distinguishes an **implemented code path** from a coin's **verified complete paper workflow**. It does not certify live trading, exchange accounts, venue listings, venue order precision/limits, or any future execution capability.

**Interpretation:** “Implemented” means the registered symbol has an ID-bound CoinGecko price/history route, canonical strategy validation/decision path and simulated paper guards in code. It is **not** evidence that CoinGecko currently serves sufficient data for that coin or that its draft → Start → BUY/WAIT → exit → ledger → backtest sequence has been fully observed. “Not demonstrated” means the complete per-coin workflow has not been verified in this matrix; isolated backend tests and BTC paper evidence are narrower. A matching exchange ticker/USD pair provides no CoinGecko identity proof, so the paper adapter never uses Kraken/Coinbase prices or history as a fallback. No exchange certification is part of paper trading.

| Symbol | Frozen CoinGecko ID | Simulation code path | Full per-coin paper workflow |
|---|---|---|---|
| BTC | bitcoin | Implemented | Not demonstrated |
| ETH | ethereum | Implemented | Not demonstrated |
| BNB | binancecoin | Implemented | Not demonstrated |
| XRP | ripple | Implemented | Not demonstrated |
| SOL | solana | Implemented | Not demonstrated |
| TRX | tron | Implemented | Not demonstrated |
| ZEC | zcash | Implemented | Not demonstrated |
| FIGR_HELOC | figure-heloc | Implemented | Not demonstrated |
| HYPE | hyperliquid | Implemented | Not demonstrated |
| DOGE | dogecoin | Implemented | Not demonstrated |
| LINK | chainlink | Implemented | Not demonstrated |
| XMR | monero | Implemented | Not demonstrated |
| WBT | whitebit | Implemented | Not demonstrated |
| ADA | cardano | Implemented | Not demonstrated |
| RAIN | rain | Implemented | Not demonstrated |
| LEO | leo-token | Implemented | Not demonstrated |
| XLM | stellar | Implemented | Not demonstrated |
| NEAR | near | Implemented | Not demonstrated |
| BCH | bitcoin-cash | Implemented | Not demonstrated |
| UNI | uniswap | Implemented | Not demonstrated |
| LTC | litecoin | Implemented | Not demonstrated |
| CC | canton-network | Implemented | Not demonstrated |
| SUI | sui | Implemented | Not demonstrated |
| AVAX | avalanche-2 | Implemented | Not demonstrated |
| GRAM | the-open-network | Implemented | Not demonstrated |
| HBAR | hedera-hashgraph | Implemented | Not demonstrated |
| TAO | bittensor | Implemented | Not demonstrated |
| SHIB | shiba-inu | Implemented | Not demonstrated |
| CRO | crypto-com-chain | Implemented | Not demonstrated |
| BTW | bitway | Implemented | Not demonstrated |
| M | memecore | Implemented | Not demonstrated |
| ENA | ethena | Implemented | Not demonstrated |
| XAUT | tether-gold | Implemented | Not demonstrated |
| ONDO | ondo-finance | Implemented | Not demonstrated |
| QNT | quant-network | Implemented | Not demonstrated |
| OKB | okb | Implemented | Not demonstrated |
| AAVE | aave | Implemented | Not demonstrated |
| MNT | mantle | Implemented | Not demonstrated |
| DOT | polkadot | Implemented | Not demonstrated |
| PUMP | pump-fun | Implemented | Not demonstrated |
| WLD | worldcoin-wld | Implemented | Not demonstrated |
| ASTER | aster-2 | Implemented | Not demonstrated |
| MORPHO | morpho | Implemented | Not demonstrated |
| PAXG | pax-gold | Implemented | Not demonstrated |
| PEPE | pepe | Implemented | Not demonstrated |
| WLFI | world-liberty-financial | Implemented | Not demonstrated |
| SKY | sky | Implemented | Not demonstrated |
| ICP | internet-computer | Implemented | Not demonstrated |
| ARB | arbitrum | Implemented | Not demonstrated |
| HTX | htx-dao | Implemented | Not demonstrated |
| POL | polygon-ecosystem-token | Implemented | Not demonstrated |
| ATOM | cosmos | Implemented | Not demonstrated |
| FIL | filecoin | Implemented | Not demonstrated |
| APT | aptos | Implemented | Not demonstrated |
| OP | optimism | Implemented | Not demonstrated |
| INJ | injective-protocol | Implemented | Not demonstrated |
| TIA | celestia | Implemented | Not demonstrated |

**Operational rule:** A registered, mandate-allowed strategy can be drafted, saved and Started while market data is unavailable; its engine action is WAIT, never a fabricated BUY. A simulated BUY needs an available, correctly ID-bound CoinGecko price, sufficient actual history for the strategy's indicators, a canonical BUY, user approval or Autopilot and the existing mandate/risk checks. If price is unavailable, show **Waiting for a price**, leave virtual cash and holdings unchanged and try again on the next normal paper-trading cycle—no order queue. Existing positions can SELL only with a usable verified price; losing entry eligibility does not erase a holding, force a sell or rewrite its ledger. Paper quantities/fees/slippage use the app's simulation model, not exchange orders, precision, limits or failure rules. The legacy MATIC alias maps to POL's frozen ID for existing lots; new MATIC entries require explicit POL review. Previous exchange inventory files are historical observations, not support criteria or full-workflow evidence.
