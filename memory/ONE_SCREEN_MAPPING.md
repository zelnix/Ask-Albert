# One-Screen Dashboard · route and data-source mapping

All listed app routes use the existing `/?section=...` state router and preserve browser Back/Forward. Detail screens are retained, not copied into the dashboard.

| Surface | Source | Destination |
| --- | --- | --- |
| Published stamp | BTC `/api/v1/dashboard.created_at` (actual run publication, local display); absent -> time unavailable | Brief (`briefing`) |
| BTC quote | `/api/v1/ticker`, source + `ts` + change24h | `market-intel` |
| BTC dominance | `/api/v1/dashboard.dominance`, run `created_at`; BTC cap / CoinGecko covered total cap | `crossmarket` |
| Altcoin breadth | `/api/v1/albert/state-of-play.marketStreams.phaseAssessment` (+ `/market-streams` universe exclusions), window/denominator/assessedAt | `market-intel` |
| ETF net flow | `/api/v1/etf-flows.net_1d/latest_date`, reported session only | `institutional` |
| Market stance | Owner-scoped `/api/v1/albert/state-of-play.market` and bound briefing claim | `briefing` |
| Seven-day historical scenario | Owner-scoped `/api/v1/albert/scenario-outlooks/preview` (P7D), band availability gate, observed history | `scenarios` (existing two-stream detail) |
| Forecast performance | The same scenario response's `validation.evaluation` (walk-forward; not the historical range) | `scenario-evaluation` |
| Albert's Brief | Owner-scoped SOP `briefing.claims`, immutable evidence refs | `briefing`, `dataaudit` |
| Paper Trading | Owner-scoped `/api/v1/albert/paper/overview`, canonical per-strategy ledger totals and `recentFills` from full owner ledgers filtered to economic `BUY/SELL FILL`, newest two; value-minus-starting-cash is backend-computed. Per-fill position evidence via existing read-only `/paper/trades/{positionId}/evidence` | `paper`, `paperengine` |
| Portfolio & Risk | Same paper overview's owner-scoped positions, combined `cashTotal/cashPct` and `openRiskUsd/openRiskPct/openRiskLimitPct` versus **paper-profile cap**. SOP owner mandate drawdown is a separate limit. Unknown marks withhold percentages; stale marks are labelled and paper P/L is withheld. | `paper`, `risk`, `leverage`, `events`, `smartmoney` |
| BTC Bull & Bear | Same scenario preview/history + daily `dashboard.chart.sr_levels` as-of `dashboard.as_of`; stale run levels withheld from current chart | `scenarios`, `forecasts`, `scenario-evaluation` |
| Market Intelligence | `/api/v1/albert/market-driver/btc`; BTC/ETH observed closed-candle histories from scenario preview, rebased at the first shared date; missing dates remain line gaps | `overview`, `forecasts`, `market-intel`, `drivers`, `crossmarket`, `analogs` |
| News, Macro & Policy | `/api/v1/news.cards` with published/source/verification and available causal summary; no unsourced event time | `news`, `macro`, `events` |
| Evidence & Engines | SOP dataQuality + paper ledger + scenario validation | `performance`, `paperengine`, `alert-engine`, `scenario-evaluation`, `dataaudit`, `checkup` |
| On-Chain & Flows | `/api/v1/albert/market-streams.participants`, `/api/v1/etf-flows` | `whales`, `institutional`, `network`, `timemachine` |
| Opportunity Radar | `/api/v1/albert/market-streams.researchFindings`, confirmed/invalidation conditions; no trade implied | `opportunities` (research detail), `strategies`, `paper` |

`scenarios` retains the pre-existing detailed Two-Stream Home; `opportunities` is a focused research detail with the existing findings component, and `scenario-evaluation` is a focused read-only report. All reads are session-scoped where owner data is involved; no client pid is passed. Empty, stale and failed optional sources degrade only their own cards. Ticker and cards share one mounted snapshot hook, rather than fetching duplicate values. Reads never run the paper worker.
