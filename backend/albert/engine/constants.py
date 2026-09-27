"""Engine constants for the deterministic Albert decision engine.

These are versioned WITH the engine: any change to a threshold, ceiling, or the
universe should bump ALBERT_ENGINE_VERSION so that immutable decision snapshots
remain reproducible.
"""

ALBERT_ENGINE_VERSION = 'albert-decide-v4'  # v4: simulation-only source-neutral marks, 200d trend, optional 1y high

# Regime-sensitive BUY entry thresholds (opportunity score must be >= this).
REGIME_BUY_THRESHOLD = {'BULL': 72, 'RANGE': 78, 'BEAR': 85}

# Fraction of *deployable* USDC the engine is willing to put to work in a regime.
REGIME_DEPLOY_CEILING = {'BULL': 0.60, 'RANGE': 0.35, 'BEAR': 0.15}

# Liquid v1 discovery universe (held coins are always evaluated too). Strategy
# capability checks reuse the same list rather than keeping a second allow-list.
from albert.asset_capabilities import ENGINE_DISCOVERY_ASSETS
ALBERT_UNIVERSE = list(ENGINE_DISCOVERY_ASSETS)

# Stablecoins are never scored as opportunities.
STABLES = {'USDC', 'USDT', 'DAI', 'USD', 'TUSD', 'FDUSD', 'BUSD'}

# ---------------------------------------------------------------------------
# Phase D1: SELL engine + decision precedence
# ---------------------------------------------------------------------------
# BUY hysteresis bands (versioned WITH the engine). Enter BUY at the regime
# threshold; a held/last BUY position REMAINS a BUY down to the lower band, and
# only loses BUY status below it (or on an explicit risk/invalidation trigger).
# This prevents Albert bouncing between BUY and WAIT on a 71.9 -> 72.1 wobble.
REGIME_BUY_ENTER = dict(REGIME_BUY_THRESHOLD)                 # {'BULL':72,'RANGE':78,'BEAR':85}
REGIME_BUY_REMAIN = {'BULL': 68, 'RANGE': 74, 'BEAR': 81}    # enter - 4 (hysteresis floor)

# Canonical SELL reason codes — ordered by severity elsewhere. PORTFOLIO_DRAWDOWN_RISK
# (Phase G) is a portfolio-level class that sits JUST under EMERGENCY_EXIT in precedence.
SELL_REASON_CODES = ('EMERGENCY_EXIT', 'PORTFOLIO_DRAWDOWN_RISK', 'THESIS_INVALIDATION', 'RISK_REDUCTION', 'REBALANCE', 'PROFIT_TAKE')

# The ONLY permitted SELL actions. Deterministic severity chooses among them;
# a reason code is never hard-bound to a single fixed percentage.
SELL_PERMITTED_FRACTIONS = (0.10, 0.25, 0.50, 1.00)

# EMERGENCY: a held position down worse than this (unrealized %) is a full exit.
EMERGENCY_LOSS_PCT = 35.0

# RISK_REDUCTION: trim only when a position's risk-at-stop exceeds this multiple
# of the mandated per-trade risk budget (avoids trimming on every wobble).
RISK_BREACH_MULT = 1.5

# REBALANCE: ignore tiny allocation overshoots below this many percentage points.
REBALANCE_TOL_PCT = 2.0

# PROFIT_TAKE ladder: (unrealized-gain%% >= threshold) -> trim fraction. Highest
# qualifying tier wins. Staged 10 / 25 / 50 per the spec.
PROFIT_LADDER = ((200.0, 0.50), (100.0, 0.25), (50.0, 0.10))

# Full deterministic decision precedence (1 = highest). A high opportunity score
# can NEVER overpower a risk exit. Phase G inserts PORTFOLIO_DRAWDOWN_RISK directly
# beneath EMERGENCY_EXIT so portfolio survival outranks individual-position triggers
# (an individual EMERGENCY_EXIT still retains the highest precedence).
PRECEDENCE_ORDER = {
    'EMERGENCY_EXIT': 1,
    'PORTFOLIO_DRAWDOWN_RISK': 2,
    'THESIS_INVALIDATION': 3,
    'RISK_REDUCTION': 4,          # position-level risk reduction
    'REBALANCE': 5,
    'PROFIT_TAKE': 6,
    'BUY': 7,
    'HOLD': 8,
    'WAIT': 9,
}

# ---------------------------------------------------------------------------
# Phase G: Portfolio-Level Risk & Drawdown Protection (versioned WITH the engine)
# ---------------------------------------------------------------------------
# Recovery hysteresis: once protection activates on a max-drawdown breach it stays
# active until drawdown recovers to/under maxDrawdown * this ratio (ratio-based so
# it scales across mandates: 20% -> 16%, 10% -> 8%, 30% -> 24%).
PORTFOLIO_DRAWDOWN_RECOVERY_RATIO = 0.80

# Continuous severity -> target portfolio risk-reduction fraction curve.
#   severity = (drawdownPct - maxDrawdownPct) / maxDrawdownPct
#   severity <= 0            -> 0.0   (in protection but not over the limit: no new cuts)
#   0 < severity <= FLOOR    -> FLOOR (a breach always warrants at least this reduction)
#   FLOOR < severity <= 1.0  -> severity (linear)
#   severity > 1.0           -> 1.0   (drawdown-risk layer may recommend exiting risk)
PORTFOLIO_RISK_SEVERITY_FLOOR = 0.25

# Fallback per-position stop distance used for risk-contribution weighting when an
# asset has no reliable invalidation/price (records reductionBasis=PORTFOLIO_WEIGHT_FALLBACK).
PORTFOLIO_RISK_DEFAULT_STOP_DIST = 0.20

# ---------------------------------------------------------------------------
# Phase D2: flip conditions + immutable snapshot + eligibility + history
# ---------------------------------------------------------------------------
# Data-confidence floor referenced by flip conditions ("BUY -> WAIT if data
# confidence becomes insufficient"). NOT a hard gate on existing calls (added to
# avoid changing Phase C/D1 behaviour) — only surfaced in flip conditions.
CONFIDENCE_MIN = 50

# riskFlag thresholds (display / audit only — do not alter the call).
NEAR_INVALIDATION_PCT = 5.0     # price within this %% above invalidation
LARGE_LOSS_FLAG_PCT = 20.0      # unrealized loss worse than this flags LARGE_UNREALIZED_LOSS

# Canonical eligibility reason codes (discovery vs eligibility separation).
ELIGIBILITY_REASONS = (
    'EXCLUDED_BY_MANDATE', 'NOT_IN_APPROVED_UNIVERSE', 'MANDATE_INCOMPLETE', 'STALE_DATA',
)

# How many immutable snapshots to retain per (pid, asset) before trimming oldest.
DECISION_SNAPSHOT_RETENTION = 200
# How many change-history events to return by default.
DECISION_HISTORY_DEFAULT_LIMIT = 50
