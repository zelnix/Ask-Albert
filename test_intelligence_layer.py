#!/usr/bin/env python3
"""
Intelligence Layer Test Suite for Bitcoin Predictive AI Dashboard
Tests NEW intelligence layer fields: quant_score, quant_label, quant_breakdown, regime, forecasts, factors
"""
import os
import sys
import requests
from datetime import datetime

# Load base URL from .env
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://what-if-sandbox.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api/v1"

print(f"Testing intelligence layer at: {API_BASE}")
print("=" * 80)

# ============================================================================
# TEST 1: GET /api/v1/health - Verify compute status
# ============================================================================
print("\n[TEST 1] GET /api/v1/health - Verify compute status")
print("-" * 80)

try:
    resp = requests.get(f"{API_BASE}/health", timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        sys.exit(1)
    
    health = resp.json()
    print(f"Response: {health}")
    
    compute_status = health.get('compute_status')
    runs = health.get('runs', 0)
    
    if compute_status not in ['done', 'running']:
        print(f"⚠️  WARNING: compute_status is '{compute_status}' (expected 'done' or 'running')")
    
    if runs < 1:
        print(f"❌ FAILED: runs={runs} (expected >= 1)")
        sys.exit(1)
    
    print(f"✅ Health check PASSED: compute_status={compute_status}, runs={runs}")
    
except Exception as e:
    print(f"❌ FAILED: Exception during health check: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# TEST 2: GET /api/v1/ticker - Verify live price still works
# ============================================================================
print("\n[TEST 2] GET /api/v1/ticker - Verify live price")
print("-" * 80)

try:
    resp = requests.get(f"{API_BASE}/ticker", timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        sys.exit(1)
    
    ticker = resp.json()
    price = ticker.get('price')
    
    if not isinstance(price, (int, float)) or price <= 0:
        print(f"❌ FAILED: Invalid price: {price}")
        sys.exit(1)
    
    print(f"✅ Ticker PASSED: price=${price:,.2f}")
    
except Exception as e:
    print(f"❌ FAILED: Exception during ticker test: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# TEST 3: GET /api/v1/dashboard - Validate NEW intelligence layer fields
# ============================================================================
print("\n[TEST 3] GET /api/v1/dashboard - Validate intelligence layer fields")
print("-" * 80)

try:
    print("Fetching dashboard...")
    resp = requests.get(f"{API_BASE}/dashboard", timeout=15)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        sys.exit(1)
    
    dash = resp.json()
    
    # Check status
    if dash.get('status') != 'ready':
        print(f"❌ FAILED: Expected status='ready', got '{dash.get('status')}'")
        sys.exit(1)
    
    print("✅ Status: ready")
    
    # --- Verify EXISTING fields still present ---
    print("\n[3.1] Verifying existing fields still present...")
    existing_required = ['signal', 'confidence', 'cv_folds', 'importances', 'performance', 
                        'features', 'scoreboard', 'trades', 'live_record']
    missing_existing = [f for f in existing_required if f not in dash]
    if missing_existing:
        print(f"❌ FAILED: Missing existing fields: {missing_existing}")
        sys.exit(1)
    
    print(f"✅ All existing fields present: {', '.join(existing_required)}")
    
    # --- NEW FIELD 1: quant_score (integer 0-100) ---
    print("\n[3.2] Validating quant_score...")
    quant_score = dash.get('quant_score')
    
    if quant_score is None:
        print(f"❌ FAILED: quant_score is missing")
        sys.exit(1)
    
    if not isinstance(quant_score, int):
        print(f"❌ FAILED: quant_score is not an integer: {type(quant_score)} = {quant_score}")
        sys.exit(1)
    
    if not (0 <= quant_score <= 100):
        print(f"❌ FAILED: quant_score out of range: {quant_score} (expected 0-100)")
        sys.exit(1)
    
    print(f"✅ quant_score: {quant_score} (valid integer 0-100)")
    
    # --- NEW FIELD 2: quant_label (non-empty string) ---
    print("\n[3.3] Validating quant_label...")
    quant_label = dash.get('quant_label')
    
    if not quant_label:
        print(f"❌ FAILED: quant_label is missing or empty: {quant_label}")
        sys.exit(1)
    
    if not isinstance(quant_label, str):
        print(f"❌ FAILED: quant_label is not a string: {type(quant_label)}")
        sys.exit(1)
    
    print(f"✅ quant_label: '{quant_label}' (valid non-empty string)")
    
    # --- NEW FIELD 3: quant_breakdown (list of 9 objects) ---
    print("\n[3.4] Validating quant_breakdown...")
    quant_breakdown = dash.get('quant_breakdown')
    
    if not quant_breakdown:
        print(f"❌ FAILED: quant_breakdown is missing")
        sys.exit(1)
    
    if not isinstance(quant_breakdown, list):
        print(f"❌ FAILED: quant_breakdown is not a list: {type(quant_breakdown)}")
        sys.exit(1)
    
    if len(quant_breakdown) != 9:
        print(f"❌ FAILED: quant_breakdown has {len(quant_breakdown)} items (expected exactly 9)")
        sys.exit(1)
    
    print(f"✅ quant_breakdown has 9 items")
    
    # Validate each breakdown item
    required_breakdown_fields = ['name', 'score', 'weight', 'signal', 'active', 'note']
    active_items = []
    inactive_items = []
    
    for i, item in enumerate(quant_breakdown):
        missing = [f for f in required_breakdown_fields if f not in item]
        if missing:
            print(f"❌ FAILED: quant_breakdown[{i}] missing fields: {missing}")
            sys.exit(1)
        
        name = item['name']
        score = item['score']
        weight = item['weight']
        signal = item['signal']
        active = item['active']
        note = item['note']
        
        if not isinstance(name, str) or not name:
            print(f"❌ FAILED: quant_breakdown[{i}] name invalid: {name}")
            sys.exit(1)
        
        if not isinstance(active, bool):
            print(f"❌ FAILED: quant_breakdown[{i}] active not bool: {active}")
            sys.exit(1)
        
        if not isinstance(signal, str) or not signal:
            print(f"❌ FAILED: quant_breakdown[{i}] signal invalid: {signal}")
            sys.exit(1)
        
        if not isinstance(note, str):
            print(f"❌ FAILED: quant_breakdown[{i}] note not string: {note}")
            sys.exit(1)
        
        if active:
            # Active items must have score 0-100 and weight in {35,30,20,15}
            if score is None or not isinstance(score, int):
                print(f"❌ FAILED: quant_breakdown[{i}] ({name}) active but score invalid: {score}")
                sys.exit(1)
            
            if not (0 <= score <= 100):
                print(f"❌ FAILED: quant_breakdown[{i}] ({name}) score out of range: {score}")
                sys.exit(1)
            
            if weight not in [35, 30, 20, 15]:
                print(f"❌ FAILED: quant_breakdown[{i}] ({name}) weight invalid: {weight} (expected 35, 30, 20, or 15)")
                sys.exit(1)
            
            active_items.append((name, score, weight))
            print(f"  ✅ [{i}] {name}: score={score}, weight={weight}%, signal={signal}, active=True")
        else:
            # Inactive items must have score=null and weight=0
            if score is not None:
                print(f"❌ FAILED: quant_breakdown[{i}] ({name}) inactive but score not null: {score}")
                sys.exit(1)
            
            if weight != 0:
                print(f"❌ FAILED: quant_breakdown[{i}] ({name}) inactive but weight not 0: {weight}")
                sys.exit(1)
            
            inactive_items.append(name)
            print(f"  ✅ [{i}] {name}: score=null, weight=0, signal={signal}, active=False")
    
    # Verify exactly 4 active items
    if len(active_items) != 4:
        print(f"❌ FAILED: Expected exactly 4 active items, got {len(active_items)}")
        sys.exit(1)
    
    # Verify the 4 active items are Trend, Momentum, Volume, Volatility
    active_names = [name for name, _, _ in active_items]
    expected_active = ['Trend', 'Momentum', 'Volume', 'Volatility']
    if set(active_names) != set(expected_active):
        print(f"❌ FAILED: Active items {active_names} != expected {expected_active}")
        sys.exit(1)
    
    # Verify the 5 inactive items
    if len(inactive_items) != 5:
        print(f"❌ FAILED: Expected exactly 5 inactive items, got {len(inactive_items)}")
        sys.exit(1)
    
    expected_inactive = ['Derivatives', 'Liquidity', 'On-chain', 'Sentiment', 'Macro']
    if set(inactive_items) != set(expected_inactive):
        print(f"❌ FAILED: Inactive items {inactive_items} != expected {expected_inactive}")
        sys.exit(1)
    
    print(f"✅ quant_breakdown validated: 4 active ({', '.join(active_names)}), 5 inactive ({', '.join(inactive_items)})")
    
    # --- NEW FIELD 4: regime (object) ---
    print("\n[3.5] Validating regime...")
    regime = dash.get('regime')
    
    if not regime or not isinstance(regime, dict):
        print(f"❌ FAILED: regime missing or not a dict: {regime}")
        sys.exit(1)
    
    required_regime = ['regime', 'description', 'behavior', 'trend30d_pct', 'vol_percentile']
    missing_regime = [f for f in required_regime if f not in regime]
    if missing_regime:
        print(f"❌ FAILED: regime missing fields: {missing_regime}")
        sys.exit(1)
    
    regime_name = regime['regime']
    description = regime['description']
    behavior = regime['behavior']
    trend30d_pct = regime['trend30d_pct']
    vol_percentile = regime['vol_percentile']
    
    if not isinstance(regime_name, str) or not regime_name:
        print(f"❌ FAILED: regime.regime invalid: {regime_name}")
        sys.exit(1)
    
    if not isinstance(description, str):
        print(f"❌ FAILED: regime.description not string: {description}")
        sys.exit(1)
    
    if not isinstance(behavior, str):
        print(f"❌ FAILED: regime.behavior not string: {behavior}")
        sys.exit(1)
    
    if not isinstance(trend30d_pct, (int, float)):
        print(f"❌ FAILED: regime.trend30d_pct not number: {trend30d_pct}")
        sys.exit(1)
    
    if not isinstance(vol_percentile, (int, float)) or not (0 <= vol_percentile <= 100):
        print(f"❌ FAILED: regime.vol_percentile invalid: {vol_percentile} (expected 0-100)")
        sys.exit(1)
    
    print(f"✅ regime: '{regime_name}'")
    print(f"  description: {description[:60]}...")
    print(f"  behavior: {behavior[:60]}...")
    print(f"  trend30d_pct: {trend30d_pct}%")
    print(f"  vol_percentile: {vol_percentile}")
    
    # --- NEW FIELD 5: forecasts (list of 3 objects) ---
    print("\n[3.6] Validating forecasts...")
    forecasts = dash.get('forecasts')
    
    if not forecasts or not isinstance(forecasts, list):
        print(f"❌ FAILED: forecasts missing or not a list: {forecasts}")
        sys.exit(1)
    
    if len(forecasts) != 3:
        print(f"❌ FAILED: forecasts has {len(forecasts)} items (expected exactly 3)")
        sys.exit(1)
    
    print(f"✅ forecasts has 3 items")
    
    # Validate each forecast
    required_forecast_fields = ['horizon', 'higher', 'lower', 'bull', 'base', 'bear',
                               'expected_low', 'expected_high', 'confidence', 'confidence_pct',
                               'accuracy', 'invalidation', 'invalidation_dir', 'lean', 'expiry']
    
    expected_horizons = ['24H', '7D', '30D']
    found_horizons = []
    
    for i, fc in enumerate(forecasts):
        missing = [f for f in required_forecast_fields if f not in fc]
        if missing:
            print(f"❌ FAILED: forecasts[{i}] missing fields: {missing}")
            sys.exit(1)
        
        horizon = fc['horizon']
        higher = fc['higher']
        lower = fc['lower']
        bull = fc['bull']
        base = fc['base']
        bear = fc['bear']
        expected_low = fc['expected_low']
        expected_high = fc['expected_high']
        confidence = fc['confidence']
        confidence_pct = fc['confidence_pct']
        accuracy = fc['accuracy']
        invalidation = fc['invalidation']
        invalidation_dir = fc['invalidation_dir']
        lean = fc['lean']
        expiry = fc['expiry']
        
        # Validate horizon
        if horizon not in expected_horizons:
            print(f"❌ FAILED: forecasts[{i}] horizon invalid: {horizon} (expected one of {expected_horizons})")
            sys.exit(1)
        
        found_horizons.append(horizon)
        
        # Validate higher and lower (0-100, sum ~100)
        if not isinstance(higher, (int, float)) or not (0 <= higher <= 100):
            print(f"❌ FAILED: forecasts[{i}] higher invalid: {higher} (expected 0-100)")
            sys.exit(1)
        
        if not isinstance(lower, (int, float)) or not (0 <= lower <= 100):
            print(f"❌ FAILED: forecasts[{i}] lower invalid: {lower} (expected 0-100)")
            sys.exit(1)
        
        total = higher + lower
        if not (99 <= total <= 101):
            print(f"❌ FAILED: forecasts[{i}] higher+lower={total} (expected ~100)")
            sys.exit(1)
        
        # Validate bull, base, bear (numbers > 0)
        if not isinstance(bull, (int, float)) or bull <= 0:
            print(f"❌ FAILED: forecasts[{i}] bull invalid: {bull} (expected > 0)")
            sys.exit(1)
        
        if not isinstance(base, (int, float)) or base <= 0:
            print(f"❌ FAILED: forecasts[{i}] base invalid: {base} (expected > 0)")
            sys.exit(1)
        
        if not isinstance(bear, (int, float)) or bear <= 0:
            print(f"❌ FAILED: forecasts[{i}] bear invalid: {bear} (expected > 0)")
            sys.exit(1)
        
        # Sanity check: bull > bear
        if bull <= bear:
            print(f"❌ FAILED: forecasts[{i}] bull ({bull}) <= bear ({bear}) (expected bull > bear)")
            sys.exit(1)
        
        # Validate expected_low and expected_high
        if not isinstance(expected_low, (int, float)) or expected_low <= 0:
            print(f"❌ FAILED: forecasts[{i}] expected_low invalid: {expected_low} (expected > 0)")
            sys.exit(1)
        
        if not isinstance(expected_high, (int, float)) or expected_high <= 0:
            print(f"❌ FAILED: forecasts[{i}] expected_high invalid: {expected_high} (expected > 0)")
            sys.exit(1)
        
        # Validate confidence
        if confidence not in ['Low', 'Moderate', 'High']:
            print(f"❌ FAILED: forecasts[{i}] confidence invalid: {confidence} (expected Low/Moderate/High)")
            sys.exit(1)
        
        if not isinstance(confidence_pct, (int, float)):
            print(f"❌ FAILED: forecasts[{i}] confidence_pct not number: {confidence_pct}")
            sys.exit(1)
        
        # Validate accuracy (0-100)
        if not isinstance(accuracy, (int, float)) or not (0 <= accuracy <= 100):
            print(f"❌ FAILED: forecasts[{i}] accuracy invalid: {accuracy} (expected 0-100)")
            sys.exit(1)
        
        # Validate invalidation
        if not isinstance(invalidation, (int, float)) or invalidation <= 0:
            print(f"❌ FAILED: forecasts[{i}] invalidation invalid: {invalidation} (expected > 0)")
            sys.exit(1)
        
        # Validate invalidation_dir
        if invalidation_dir not in ['above', 'below']:
            print(f"❌ FAILED: forecasts[{i}] invalidation_dir invalid: {invalidation_dir} (expected above/below)")
            sys.exit(1)
        
        # Validate lean
        if lean not in ['UP', 'DOWN']:
            print(f"❌ FAILED: forecasts[{i}] lean invalid: {lean} (expected UP/DOWN)")
            sys.exit(1)
        
        # Sanity check: invalidation_dir should be 'below' when lean=='UP' else 'above'
        expected_dir = 'below' if lean == 'UP' else 'above'
        if invalidation_dir != expected_dir:
            print(f"❌ FAILED: forecasts[{i}] lean={lean} but invalidation_dir={invalidation_dir} (expected {expected_dir})")
            sys.exit(1)
        
        # Validate expiry (YYYY-MM-DD format)
        if not isinstance(expiry, str):
            print(f"❌ FAILED: forecasts[{i}] expiry not string: {expiry}")
            sys.exit(1)
        
        try:
            datetime.strptime(expiry, '%Y-%m-%d')
        except Exception as e:
            print(f"❌ FAILED: forecasts[{i}] expiry invalid format: {expiry} ({e})")
            sys.exit(1)
        
        print(f"  ✅ [{i}] {horizon}: higher={higher}%, lower={lower}%, bull=${bull:,.0f}, base=${base:,.0f}, bear=${bear:,.0f}")
        print(f"       expected_low=${expected_low:,.0f}, expected_high=${expected_high:,.0f}")
        print(f"       confidence={confidence} ({confidence_pct}%), accuracy={accuracy}%")
        print(f"       invalidation=${invalidation:,.0f} {invalidation_dir}, lean={lean}, expiry={expiry}")
    
    # Verify all 3 horizons present
    if set(found_horizons) != set(expected_horizons):
        print(f"❌ FAILED: Found horizons {found_horizons} != expected {expected_horizons}")
        sys.exit(1)
    
    print(f"✅ forecasts validated: all 3 horizons present with valid data")
    
    # --- NEW FIELD 6: factors (object with bullish and risk lists) ---
    print("\n[3.7] Validating factors...")
    factors = dash.get('factors')
    
    if not factors or not isinstance(factors, dict):
        print(f"❌ FAILED: factors missing or not a dict: {factors}")
        sys.exit(1)
    
    if 'bullish' not in factors or 'risk' not in factors:
        print(f"❌ FAILED: factors missing bullish or risk: {factors.keys()}")
        sys.exit(1)
    
    bullish = factors['bullish']
    risk = factors['risk']
    
    if not isinstance(bullish, list):
        print(f"❌ FAILED: factors.bullish not a list: {type(bullish)}")
        sys.exit(1)
    
    if not isinstance(risk, list):
        print(f"❌ FAILED: factors.risk not a list: {type(risk)}")
        sys.exit(1)
    
    if len(bullish) == 0:
        print(f"❌ FAILED: factors.bullish is empty")
        sys.exit(1)
    
    if len(risk) == 0:
        print(f"❌ FAILED: factors.risk is empty")
        sys.exit(1)
    
    if len(bullish) > 3:
        print(f"⚠️  WARNING: factors.bullish has {len(bullish)} items (expected up to 3)")
    
    if len(risk) > 3:
        print(f"⚠️  WARNING: factors.risk has {len(risk)} items (expected up to 3)")
    
    # Validate all items are non-empty strings
    for i, item in enumerate(bullish):
        if not isinstance(item, str) or not item:
            print(f"❌ FAILED: factors.bullish[{i}] invalid: {item}")
            sys.exit(1)
    
    for i, item in enumerate(risk):
        if not isinstance(item, str) or not item:
            print(f"❌ FAILED: factors.risk[{i}] invalid: {item}")
            sys.exit(1)
    
    print(f"✅ factors.bullish ({len(bullish)} items):")
    for i, item in enumerate(bullish):
        print(f"  [{i+1}] {item[:80]}...")
    
    print(f"✅ factors.risk ({len(risk)} items):")
    for i, item in enumerate(risk):
        print(f"  [{i+1}] {item[:80]}...")
    
    print("\n✅ TEST 3 PASSED: All intelligence layer fields validated successfully")
    
except Exception as e:
    print(f"❌ FAILED: Exception during dashboard test: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("✅ ALL INTELLIGENCE LAYER TESTS PASSED")
print("=" * 80)
print("\nSummary:")
print("  1. GET /api/v1/health - ✅ compute_status likely 'done', runs >= 1")
print("  2. GET /api/v1/ticker - ✅ Live price working")
print("  3. GET /api/v1/dashboard - ✅ All NEW intelligence layer fields validated:")
print("     - quant_score: integer 0-100 ✅")
print("     - quant_label: non-empty string ✅")
print("     - quant_breakdown: 9 items (4 active, 5 inactive) ✅")
print("     - regime: object with all required fields ✅")
print("     - forecasts: 3 items (24H, 7D, 30D) with all validations ✅")
print("     - factors: bullish and risk lists (non-empty) ✅")
print("     - All existing fields still present ✅")
print("\nNo critical issues found. Intelligence layer working as expected.")
