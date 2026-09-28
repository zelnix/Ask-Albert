import {
  LayoutDashboard, Target, Scale, BarChart3, Globe, History, Waves, Fish, Landmark,
  Gauge, Newspaper, ShieldAlert, CalendarClock, Trophy, MessageCircle, Bell, Activity,
  Database, Cpu, ShieldCheck, Sparkles, CandlestickChart, ClipboardList, Info, Crosshair, Radar, Users, Stethoscope, FlaskConical,
  Home, Wrench, GitBranch, Microscope,
} from 'lucide-react';

const SECTIONS = [
  { id: 'briefing', label: 'Albert’s Morning Brief', icon: Sparkles,
    blurb: 'The full, evidence-linked market and portfolio brief behind the one-screen dashboard.' },
  { id: 'scenarios', label: 'BTC Scenarios', icon: GitBranch,
    blurb: 'Observed history, conditional bull/bear outcomes, walk-forward validation and the underlying research. Historical ranges are not forecasts.' },
  { id: 'scenario-evaluation', label: 'Scenario Evaluation', icon: Microscope,
    blurb: 'Walk-forward report card for the scenario provider: checked outcomes, predictive skill versus no change, and calibration.' },
  { id: 'opportunities', label: 'Opportunity Research', icon: Radar,
    blurb: 'Falsifiable research findings with confirmation and invalidation, not trading proposals or fills.' },
  { id: 'ask', label: 'Ask Albert', icon: MessageCircle,
    blurb: 'Chat with Albert, Ask Albert’s HuCentAI Quant Analyst, in plain English — "Why did the score fall?", "What could move Bitcoin next?" — grounded strictly in the live dashboard numbers. He never invents data.' },
  { id: 'strategies', label: 'Trading Strategies', icon: Crosshair,
    blurb: 'Strategies Albert builds and babysits for you — each with an entry, profit targets, a stop and if-this-then-that rules on price, time and signals. Albert nudges you when it’s time to act, paper-tracks the P&L, and keeps a history of how past plays performed. Per coin.' },
  { id: 'alert-engine', label: 'Alert Engine', icon: Radar,
    blurb: 'Daily technical signal detectors — GMMA trend crossovers, trend pullback dip-buys, Bollinger volatility squeezes and RSI exhaustion — refined by volume, funding-rate, exchange-netflow and Fear & Greed filters. Scans your watchlist hourly and fires in-app alerts when a signal triggers.' },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard,
    blurb: 'Your 10-second snapshot of Bitcoin right now: the price, the market "mood", one simple score, the near-term odds, how risky things are and how sure the model is. Start here.' },
  { id: 'forecasts', label: 'Forecasts', icon: Target,
    blurb: 'CryptoMarkAI’s probability-based price forecasts from 1 week to 5 years — always shown as odds and price ranges (bull / base / bear), never a single guaranteed number. Longer horizons show wider uncertainty.' },
  { id: 'compare', label: 'Compare Coins', icon: Scale,
    blurb: 'Run the same quant engine across Bitcoin, Ethereum and Solana side by side — score, market mood, near-term odds and key levels — so you can see how the majors stack up. Each coin computes its own model on first view, then caches.' },
  { id: 'market-intel', label: 'Market Intelligence', icon: BarChart3,
    blurb: 'The technical picture behind the score: chart structure and key levels, where Bitcoin sits in its 4-year cycle, and the raw indicators the model reads.' },
  { id: 'drivers', label: 'Market Drivers', icon: Users,
    blurb: 'Who is actually moving Bitcoin right now — the first mover, the current leader, who is confirming or resisting, and who could rotate in next. A deterministic read across intraday, swing and cycle horizons, honest about what is observed versus inferred. Proposes posture; your portfolio rules decide any action.' },
  { id: 'crossmarket', label: 'Cross-Market', icon: Globe,
    blurb: 'How this coin stacks up against traditional markets — S&P 500, Nasdaq, Dow, Nikkei, European indices, Gold and the US Dollar. See rebased performance, returns, correlation (is crypto moving with stocks or breaking away?) and volatility.' },
  { id: 'analogs', label: 'Happening Again', icon: History,
    blurb: "Finds which past Bitcoin trend episode today's conditions most resemble — using macro rates, the US dollar, equity & gold correlation, volatility, drawdown, momentum and halving-cycle position — then shows what happened next. Adjust the sliders to weight what matters to you. Educational pattern-matching, not a prediction." },
  { id: 'smartmoney', label: 'Smart Money', icon: Waves,
    blurb: 'On-chain "smart money" behaviour — valuation (MVRV, SOPR), network activity, holder accumulation and sentiment. Powered by real on-chain data (BGeometrics, blockchain.com, Glassnode) and Fear & Greed.' },
  { id: 'whales', label: 'Whale Watch', icon: Fish,
    blurb: 'Live balances of the largest, publicly-labeled Bitcoin wallets — major exchanges, ETF/treasury custody, governments and famous whales. Track who is accumulating or distributing, with balances fetched live on-chain. Names are curated from public labels.' },
  { id: 'institutional', label: 'Institutional & Derivatives', icon: Landmark,
    blurb: 'Institutional and derivatives observations. Paper decisions use the approved strategy, not this narrative feed.' },
  { id: 'etf', label: 'ETF Flows', icon: Landmark,
    blurb: 'Observed US spot Bitcoin ETF fund flows and source freshness. Market context, never a paper order.' },
  { id: 'leverage', label: 'Leverage', icon: Gauge,
    blurb: 'Long & short positioning, market leverage and liquidation pressure — is leverage high or low, are traders leaning long or short, and where is the greater squeeze/liquidation risk right now.' },
  { id: 'macro', label: 'Macro & Policy', icon: Globe,
    blurb: 'Are global money conditions helping or hurting Bitcoin? Central-bank policy, a liquidity gauge, cross-market correlations and a regulation tracker.' },
  { id: 'news', label: 'News', icon: Newspaper,
    blurb: 'The news, explained: what happened, why it matters for Bitcoin, the likely direction and an impact score — with links to the original source.' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert,
    blurb: 'How bumpy conditions are right now — kept separate from direction. Expected move, key support/resistance zones, event risk and data reliability. A positive outlook can still be high risk.' },
  { id: 'events', label: 'Events', icon: CalendarClock,
    blurb: 'A countdown calendar of the macro, derivatives and on-chain events that could move Bitcoin next — each with importance and expected volatility.' },
  { id: 'performance', label: 'Performance', icon: Trophy,
    blurb: 'The receipts. Every forecast is logged before the outcome is known and graded when it matures — accuracy, calibration and an honest scoreboard, plus the data-trust log. Nothing is hidden.' },
  { id: 'timemachine', label: 'Bitcoin Time Machine', icon: History,
    blurb: 'Replay any day in Bitcoin’s history: see exactly what the model would have predicted then, what actually happened next, and the price path around it — using only the information available at the time.' },
  { id: 'alerts', label: 'Alerts', icon: Bell,
    blurb: 'A running feed of what just changed and what is coming: regime shifts, decision changes, data-trust drops and upcoming high-impact events.' },
  { id: 'network', label: 'Network & Sentiment', icon: Activity,
    blurb: 'Is the network healthy and how does the crowd feel? Live hashrate, mining difficulty, mempool congestion & fees, plus the Crypto Fear & Greed Index with Albert’s read on crowd extremes.' },
  { id: 'dataaudit', label: 'Data Audit', icon: Database,
    blurb: 'Where every number comes from and how much to trust it. A trust-scored composite Bitcoin price (median of Coinbase, Kraken, OKX, CoinGecko with outlier detection), broader cross-asset context, global news tone (GDELT) and US macro (FRED) — each tagged HIGH / MEDIUM / LOW confidence. No fabricated data.' },
  { id: 'settings', label: 'Settings', icon: Cpu,
    blurb: 'Admin passcode for manual forecast runs, plus Ask Albert’s about & compliance information. (Live data-source status now lives in the Admin screen.)' },
  { id: 'paper', label: 'Paper Bot', icon: FlaskConical,
    blurb: 'Your combined paper-trading performance — how every strategy is doing with virtual money, added up. Strategies are started and stopped on the strategy itself, where each one gets its own ring-fenced virtual wallet. No exchange keys, no real orders. Paper results are never mixed with backtests or your real portfolio.' },
  { id: 'paperengine', label: 'Paper Engine', icon: Wrench,
    blurb: 'The engine behind Paper Trading, in full technical detail: background-worker diagnostics, allocation-versus-limit calculations, market-cap ranking provenance, rotation internals, execution assumptions, reconciliation status and the complete fill → strategy version → canonical decision → market-observation evidence chain. Read-only — this screen never places or changes a paper trade.' },
  { id: 'checkup', label: 'App Checkup', icon: Stethoscope,
    blurb: 'Not sure if something is broken? Albert checks the parts of Ask Albert needed for the app to work — connectivity, services, market-data freshness, the engine and your session — then explains in plain English what (if anything) is wrong, how confident he is, and the single best next step. Reads health only; never changes your data.' },
  { id: 'admin', label: 'Admin', icon: ShieldCheck,
    blurb: 'Integrations, data-source freshness, usage, costs and system health for the Ask Albert platform.' },
];

// Legacy section metadata for sub-panels that are now grouped under the new nav
// (their components still look up a blurb/label by id).
const LEGACY_SECTIONS = [
  { id: 'bitmark', label: 'CryptoMarkAI', icon: Sparkles,
    blurb: 'CryptoMarkAI is Ask Albert’s adaptive Bitcoin Price Prediction Engine — probability-based forecasts from one week to five years. Each horizon is weighted differently, updated weekly, on demand, or when a major event hits — and every change is explained. It never gives a single guaranteed price.' },
  { id: 'chart', label: 'Chart Intelligence', icon: CandlestickChart,
    blurb: 'An automatic read of the daily chart in plain language: support and resistance zones, trend, breakouts and momentum — plus how often similar setups played out historically.' },
  { id: 'cycle', label: 'Cycle', icon: Globe,
    blurb: 'Where Bitcoin sits in its ~4-year halving cycle and how money is rotating across the wider crypto market (BTC dominance). Context, not a price rule.' },
  { id: 'policy', label: 'Macro & Policy', icon: Landmark,
    blurb: 'Are global money conditions helping or hurting Bitcoin? Central-bank policy, a liquidity gauge, cross-market correlations and a regulation tracker that separates proposals from enacted law.' },
  { id: 'analysis', label: 'Indicators', icon: BarChart3,
    blurb: 'The evidence behind the score: each indicator category, the raw values the model reads, and which ones matter most right now.' },
  { id: 'scorecard', label: 'Prediction Ledger', icon: ClipboardList,
    blurb: 'Every forecast is permanently logged before the outcome is known, then graded when it matures — directional accuracy, Brier score, error and calibration by horizon. Nothing is deleted.' },
  { id: 'trust', label: 'Data Trust', icon: ShieldCheck,
    blurb: 'Where every number comes from: the source, how fresh it is, and how reliable. If a live feed goes stale the odds are automatically toned down.' },
];
const sec = (id) => SECTIONS.find(s => s.id === id)
  || LEGACY_SECTIONS.find(s => s.id === id)
  || { id, label: id, icon: Info, blurb: '' };

// ============================================================================
// Albert-first primary navigation (spec §3). The sophisticated engines stay as
// Albert's trading desk — reachable inside More → Technical Centre — but the
// everyday journey is Albert / Ask Albert / Strategies / Paper Trading.
// ============================================================================
const PRIMARY_NAV = [
  { id: 'home', label: 'Albert', icon: Home,
    blurb: 'Your personalised home: Albert’s executive briefing, what needs your decision, what he is managing, and what he is waiting for.' },
  { id: 'ask', label: 'Ask Albert', icon: MessageCircle,
    blurb: 'Your context-aware trading companion. Explain, explore and build — grounded strictly in your live state of play.' },
  { id: 'strategies', label: 'Strategies', icon: Crosshair,
    blurb: 'One journey: build a plan with Albert, save it, then start paper trading on it. Each strategy carries its own status, trade approval (review each trade or let Albert autopilot), activity and performance — on its own ring-fenced virtual wallet.' },
  { id: 'paper', label: 'Paper Trading', icon: FlaskConical,
    blurb: 'The scoreboard: combined paper performance across every strategy. Review-only — you start, stop and approve trades on the strategy itself. Paper only, no real orders.' },
];

// More → Technical Centre categories (spec §9.1). Every existing screen is
// preserved here — nothing is deleted, only reorganised for advanced users.
const TECH_GROUPS = [
  { label: 'Market Intelligence', ids: ['briefing', 'scenarios', 'scenario-evaluation', 'overview', 'forecasts', 'market-intel', 'drivers', 'crossmarket', 'analogs', 'news', 'macro'] },
  { label: 'Portfolio & Risk', ids: ['risk', 'leverage', 'events', 'smartmoney'] },
  { label: 'Trading Evidence', ids: ['opportunities', 'performance', 'paperengine', 'alert-engine'] },
  { label: 'On-chain & Flows', ids: ['etf', 'whales', 'institutional', 'network', 'timemachine'] },
  { label: 'Data Trust', ids: ['dataaudit', 'alerts'] },
  { label: 'System', ids: ['admin', 'checkup', 'settings'] },
];

const PRIMARY_IDS = PRIMARY_NAV.map(s => s.id);

// Screen-scope metadata: which screens have a fixed asset scope vs local selector.
// This is informational — it does NOT hide screens from navigation.
const SCREEN_SCOPE = {
  'scenarios': 'BTC',        // BTC scenarios only (for now)
  'scenario-evaluation': 'BTC',
  'smartmoney': 'BTC',
  'whales': 'BTC',
  'etf': 'BTC',
  'leverage': 'BTC',
  'network': 'BTC',
  'timemachine': 'BTC',
  'drivers': 'BTC',
  'macro': 'market',
  'events': 'market',
  'dataaudit': 'market',
  'admin': 'system',
  'checkup': 'system',
  'settings': 'system',
  'paper': 'portfolio',
  'paperengine': 'portfolio',
  'strategies': 'portfolio',
  'ask': 'context',
  'opportunities': 'multi-asset',
};
// Kept for backward compatibility but no longer used to hide sections.
const BTC_ONLY_SECTIONS = [];
// Sections removed from the app entirely (superseded by the global coin picker).
const REMOVED_SECTIONS = ['compare'];

export { SECTIONS, LEGACY_SECTIONS, sec, BTC_ONLY_SECTIONS, REMOVED_SECTIONS, PRIMARY_NAV, TECH_GROUPS, PRIMARY_IDS };
