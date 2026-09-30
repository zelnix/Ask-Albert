"""Central configuration for the CryptoMarkAI backend.

Holds environment loading, the MongoDB connection, all collection handles, and the
API keys / model names. Extracted from server.py as part of the Option A refactor
(no behaviour changes — same env vars, same collection names, same defaults).
"""
import logging
import os

from pymongo import MongoClient
from dotenv import load_dotenv, dotenv_values

load_dotenv('/app/.env')

# --- Google auth: make /app/.env authoritative -------------------------------
# The deployment platform can inject a STALE GOOGLE_CLIENT_ID (and related keys) as a
# real container environment variable. Because load_dotenv() above uses override=False,
# that stale injected value would win over the current /app/.env — which is exactly how
# production kept serving an old OAuth client id across redeploys, causing Google
# `origin_mismatch`. Force ONLY the Google auth keys from /app/.env to take precedence.
# We deliberately do NOT override platform-managed secrets (MONGO_URL / DB_NAME /
# NEXT_PUBLIC_BASE_URL) — those must keep coming from the deployment injection.
_ENV_FILE = dotenv_values('/app/.env')
for _k in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID'):
    _v = (_ENV_FILE.get(_k) or '').strip()
    if _v:
        os.environ[_k] = _v

logger = logging.getLogger("askalbert.config")

# --- environment sanity check -------------------------------------------------
# MONGO_URL / DB_NAME are injected by the deployment platform from the app secrets.
# Previously a missing injection silently fell back to mongodb://localhost:27017 and a
# database literally named "your_database_name", so the service booted "healthy" while
# talking to the wrong (or no) database. Now it is impossible to miss.
REQUIRED_ENV = ('MONGO_URL', 'DB_NAME')
_missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
if _missing:
    _msg = (
        'Missing required environment variable(s): %s. These are normally injected by '
        'the deployment platform from this app\'s secrets. Falling back to local '
        'development defaults - data will NOT be where you expect. Set STRICT_ENV=1 to '
        'refuse to start instead.' % ', '.join(_missing)
    )
    if os.environ.get('STRICT_ENV', '0').lower() in ('1', 'true', 'yes'):
        raise RuntimeError(_msg)
    logger.error('[config] %s', _msg)
    print('[config] ERROR: ' + _msg, flush=True)
else:
    logger.info('[config] all required environment variables present')
# ------------------------------------------------------------------------------

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'your_database_name')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

runs_col = db['btc_runs']
signals_col = db['live_signals']
dominance_col = db['dominance_hist']
news_col = db['news']
chat_col = db['ask_quant_chat']
predictions_col = db['predictions']
bitmark_col = db['bitmark_snapshots']
smart_alerts_col = db['smart_alerts']
audit_col = db['forecast_audit']
rate_col = db['rate_limits']  # cluster-wide per-client rate limiter (shared across replicas)
try:
    # Auto-expire hits after 25h so the 24h daily window is always fully covered.
    rate_col.create_index('ts', expireAfterSeconds=90000)
    rate_col.create_index([('key', 1), ('ts', 1)])
except Exception:  # noqa
    pass
insights_col = db['albert_insights']  # cache for AI-generated section insights
compare_col = db['compare_coins']  # cache for per-coin comparison summaries
coin_dash_col = db['coin_dashboards']  # cache for per-coin full dashboards (altcoins)
coin_news_col = db['coin_news']  # cache for per-coin news (altcoins)
coin_dom_col = db['coin_dominance_hist']  # per-coin market-cap dominance history
markets_col = db['markets_cache']  # per-coin vs traditional-markets comparison, cached daily
analogs_col = db['analogs_cache']  # historical-analog engine (Bitcoin), cached daily
glassnode_col = db['glassnode_cache']  # cached Glassnode on-chain metrics (Smart Money panel)
# Additional feature-engine / cache collections (consolidated here from server.py)
onchain_col = db['onchain_engine']
lev_col = db['leverage_engine']
misc_col = db['misc_cache']
usage_col = db['usage_stats']
etf_col = db['etf_flows']
whale_col = db['whale_wallets']
whale_hist_col = db['whale_history']
whale_tx_col = db['whale_tx_feed']
regime_col = db['regime_state']  # Dynamic Regime-Switching HMM: persisted model + latest analysis
portfolio_col = db['user_portfolios']  # server-side per-client portfolio (holdings + avg entry)
mandate_col = db['user_mandates']  # per-user Trading Mandate (goals, risk limits, USDC reserve, universe)
price_watch_col = db['price_watches']  # "alert me at $X" watches created from Albert chat
albert_calls_col = db['albert_calls']  # Albert's self-logged buy/sell calls + graded outcomes (track record)
recap_col = db['albert_recap']  # cached weekly recap note
# Phase D: auditable decision-change history (BUY/HOLD/SELL/WAIT transitions per asset, scoped by pid)
decision_history_col = db['albert_decision_history']
# Phase D2: append-only immutable decision snapshots (referenced by history) + latest-per-asset pointer
decision_snapshots_col = db['albert_decision_snapshots']
decision_current_col = db['albert_decision_current']
try:
    decision_history_col.create_index([('pid', 1), ('asset', 1), ('changedAt', -1)])
    decision_history_col.create_index([('pid', 1), ('newDecisionId', 1)])
    decision_history_col.create_index([('pid', 1), ('newSnapshotId', 1)])
    decision_snapshots_col.create_index([('pid', 1), ('asset', 1), ('createdAt', -1)])
    decision_snapshots_col.create_index('decisionId')
    decision_snapshots_col.create_index('snapshotId')
    decision_current_col.create_index([('pid', 1), ('asset', 1)])
except Exception:  # noqa
    pass

# Phase E: paper-only Execution Safety Layer (Paper Order Manager)
order_intents_col = db['albert_order_intents']       # frozen OrderIntents + state
order_ledger_col = db['albert_paper_ledger']         # append-only paper fills
order_audit_col = db['albert_order_audit']           # append-only state-transition audit trail
paper_portfolio_col = db['albert_paper_portfolio']   # materialized paper portfolio (baseline + ledger); engine reads this when present
try:
    order_intents_col.create_index([('idempotencyScope', 1)], unique=True)
    order_intents_col.create_index([('pid', 1), ('state', 1), ('createdAt', -1)])
    order_ledger_col.create_index([('pid', 1), ('accountId', 1), ('ts', 1)])
    order_audit_col.create_index([('orderIntentId', 1), ('ts', 1)])
    paper_portfolio_col.create_index('pid')
except Exception:  # noqa
    pass

# Phase G: Portfolio-Level Risk & Drawdown Protection — stateful per-pid protection
# record (high-water mark, protection mode + hysteresis, breach anchor). Persisted so
# a backend restart cannot accidentally clear an active protection state.
portfolio_risk_col = db['albert_portfolio_risk']
try:
    portfolio_risk_col.create_index('pid')
except Exception:  # noqa
    pass

# Phase I: Top-100 Discovery — append-only universe snapshots (audit of what the
# market-cap-ranked universe + scores looked like at a point in time).
discovery_snapshots_col = db['albert_discovery_snapshots']
try:
    discovery_snapshots_col.create_index([('generatedAt', -1)])
except Exception:  # noqa
    pass

# Discovery Watchlist — assets a user has PINNED from the discovery feed. Pinning is
# purely a bookmark: it is NOT permission to buy — mandate eligibility gates still apply.
discovery_watchlist_col = db['albert_discovery_watchlist']
try:
    discovery_watchlist_col.create_index([('pid', 1), ('symbol', 1)], unique=True)
    discovery_watchlist_col.create_index([('pid', 1), ('pinnedAt', -1)])
except Exception:  # noqa
    pass

# Watchlist Alerts — records when a PINNED coin's Albert call flips (e.g. WAIT -> BUY)
# so the user never misses a shift. Detected lazily when the watchlist is evaluated.
watchlist_alerts_col = db['albert_watchlist_alerts']
try:
    watchlist_alerts_col.create_index([('pid', 1), ('seen', 1), ('at', -1)])
except Exception:  # noqa
    pass

# Unified per-pid notification "seen" ledger — tracks which derived notifications
# (paper fills, drawdown recoveries) a user has acknowledged in the header bell.
# Watchlist flips keep their own seen flag on watchlist_alerts_col. Doc: {_id: pid, ids: [...]}.
albert_notif_seen_col = db['albert_notif_seen']
try:
    albert_notif_seen_col.create_index('pid')
except Exception:  # noqa
    pass

# Portfolio Equity History — one idempotent UTC daily equity snapshot per user.
# Powers genuine drawdown/volatility in the performance module. Never fabricated
# from today's holdings; collection begins the first time a user's equity is read.
# Doc: {_id: '<pid>|<YYYY-MM-DD>', pid, date, equity, cash, holdingsValue,
#       prices: {ASSET: spot}, dataQuality, sources: [...], ts}.
equity_snapshots_col = db['albert_equity_snapshots']
try:
    equity_snapshots_col.create_index([('pid', 1), ('date', 1)], unique=True)
    equity_snapshots_col.create_index([('pid', 1), ('date', -1)])
except Exception:  # noqa
    pass

# Market-Driver alerts — opt-in, per horizon. Subscriptions + last-committed state
# (for hysteresis / duplicate suppression) + the emitted alert feed for the bell.
driver_alert_subs_col = db['albert_driver_alert_subs']    # {_id:'<pid>|<hz>', pid, horizon, enabled}
driver_alert_state_col = db['albert_driver_alert_state']  # {_id:'<pid>|<hz>', committed{}, pending{}}
driver_alerts_col = db['albert_driver_alerts']            # emitted alerts (bell feed)
try:
    driver_alerts_col.create_index([('pid', 1), ('ts', -1)])
    driver_alerts_col.create_index([('id', 1)], unique=True)
except Exception:  # noqa
    pass

# App Diagnosis & Checkup — deterministic health runs + shareable support reports.
diagnostics_runs_col = db['albert_diagnostics_runs']      # {_id: run_id, ...full result}
diagnostics_reports_col = db['albert_diagnostics_reports']  # {_id: report_id, run_id, expiresAt}
try:
    diagnostics_runs_col.create_index([('createdAt', -1)])
    diagnostics_runs_col.create_index([('ownerPid', 1), ('createdAt', -1)])
    # TTL: expire (auto-delete) shareable support reports at their expiresAt.
    diagnostics_reports_col.create_index('expiresAt', expireAfterSeconds=0)
    diagnostics_reports_col.create_index([('ownerPid', 1), ('createdAt', -1)])
except Exception:  # noqa
    pass

# Paper Autopilot owner notifications (surfaced via the existing notifications feed).
paper_notif_col = db['albert_paper_notifications']
try:
    paper_notif_col.create_index([('pid', 1), ('ts', -1)])
except Exception:  # noqa
    pass

# Paper-Trading Bot (paper-only; NO exchange keys, NO live orders ever).
paper_accounts_col = db['albert_paper_accounts']
paper_orders_col = db['albert_paper_orders']
paper_positions_col = db['albert_paper_positions']
paper_ledger_col = db['albert_paper_ledger']
try:
    paper_accounts_col.create_index([('ownerId', 1), ('createdAt', -1)])
    paper_ledger_col.create_index([('paperAccountId', 1), ('accountSequence', 1)], unique=True)
except Exception:  # noqa
    pass

# Ask-Albert chat persistence — one conversation per user (pid), stored so it
# survives navigation/expand and follows the user across devices.
# Doc: {_id: pid, sessionId, messages: [...], updatedAt}.
albert_chat_col = db['albert_chat']
try:
    albert_chat_col.create_index('pid')
except Exception:  # noqa
    pass

# Phase E constants
ORDER_TTL_SECONDS = 300              # 5-minute TTL from intent createdAt
DEFAULT_SLIPPAGE_BPS = 50            # 0.50% default price tolerance

# ---- Native Google Sign-In (GIS ID-token flow) ----
users_col = db['users']            # {_id(uuid), google_sub, email, name, picture, created_at, updated_at}
auth_sessions_col = db['auth_sessions']  # {_id(uuid), token, user_id, created_at, expires_at}
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
try:
    users_col.create_index('google_sub', unique=True)
    users_col.create_index('email')
    auth_sessions_col.create_index('token', unique=True)
    auth_sessions_col.create_index('expires_at', expireAfterSeconds=0)
except Exception:  # noqa
    pass

# Glassnode on-chain data (Smart Money panel). Advanced Light tier: 14d daily history, low call budget.
GLASSNODE_API_KEY = os.environ.get('GLASSNODE_API_KEY')
# Admin passcode gate for manual forecast runs (Stage-1: passcode instead of full auth).
# Default to empty so an unset env var DENIES access (fail-closed) rather than using a known default.
ADMIN_PASSCODE = os.environ.get('ADMIN_PASSCODE', '')

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-3-flash-preview')
# Ask Quant conversational model — Gemini 3 Flash (direct google-genai SDK)
CHAT_MODEL = os.environ.get('CHAT_MODEL', 'gemini-3-flash-preview')
# Interactive "Ask Albert" mentor model — deeper reasoning; grounded (Google
# Search) requests auto-route to Flash. Called directly via the google-genai SDK.
ALBERT_CHAT_MODEL = os.environ.get('ALBERT_CHAT_MODEL', 'gemini-3.1-pro-preview')

# ---- Google AI Studio Gemini TTS (Albert's spoken voice) ----
# Uses a dedicated Google AI Studio API key (NOT the Emergent key). Key lives in
# /app/.env and is never exposed to the browser (audio is generated backend-side).
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_TTS_MODEL = os.environ.get('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts')
# Albert's prebuilt voice — "Charon" is a deep, informative male voice that suits a
# seasoned professor. Overridable via env without a code change.
GEMINI_TTS_VOICE = os.environ.get('GEMINI_TTS_VOICE', 'Charon')

# ---- Resend transactional email (daily Alert Digest) ----
# Key/from live in /app/.env; never exposed to the browser (all sending is backend-side).
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
RESEND_FROM = os.environ.get('RESEND_FROM', 'CryptoMarkAI <onboarding@resend.dev>')
DIGEST_TZ = os.environ.get('DIGEST_TZ', 'Australia/Sydney')
try:
    DIGEST_HOUR = int(os.environ.get('DIGEST_HOUR', '8'))
    DIGEST_MINUTE = int(os.environ.get('DIGEST_MINUTE', '0'))
except Exception:  # noqa
    DIGEST_HOUR, DIGEST_MINUTE = 8, 0
email_recipients_col = db['email_recipients']  # admin-managed digest recipient list
email_log_col = db['email_log']  # sent-email audit + per-day digest idempotency guard
email_settings_col = db['email_settings']  # instant-alert severity threshold, etc.
# Base URL used in email links (unsubscribe). Falls back to the app's public URL.
PUBLIC_BASE_URL = (os.environ.get('EMAIL_BASE_URL') or os.environ.get('NEXT_PUBLIC_BASE_URL') or '').rstrip('/')
UNSUB_SECRET = os.environ.get('UNSUB_SECRET') or ADMIN_PASSCODE or 'btciq-unsub'
try:
    WEEKLY_HOUR = int(os.environ.get('WEEKLY_HOUR', '17'))
    WEEKLY_MINUTE = int(os.environ.get('WEEKLY_MINUTE', '0'))
except Exception:  # noqa
    WEEKLY_HOUR, WEEKLY_MINUTE = 17, 0
