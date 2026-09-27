#!/usr/bin/env python3
"""
BTCIQ Backend Testing Script - Stage 3 Features
Tests via Next.js proxy at external base URL with /api/v1/... prefix
Data is REAL (ccxt Kraken + Yahoo Finance for historical scenarios)
"""
import os
import sys
import time
import json
import requests
from datetime import datetime

# Load base URL from .env
BASE_URL = os.environ.get('NEXT_PUBLIC_BASE_URL', 'https://what-if-sandbox.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api/v1"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_curated_scenarios():
    """1) Curated Time Machine scenarios — GET /api/v1/scenarios"""
    log("=" * 80)
    log("TEST 1: Curated Time Machine Scenarios")
    log("=" * 80)
    
    try:
        log("Testing GET /api/v1/scenarios...")
        r = requests.get(f"{API_BASE}/scenarios", timeout=60)
        log(f"Status: {r.status_code}")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        
        data = r.json()
        log(f"Response keys: {list(data.keys())}")
        assert data.get('status') == 'ready', f"Expected status='ready', got {data.get('status')}"
        
        # Check scenarios array
        assert 'scenarios' in data, "Missing 'scenarios' field"
        scenarios = data['scenarios']
        assert isinstance(scenarios, list), "scenarios must be a list"
        log(f"Total scenarios: {len(scenarios)}")
        assert len(scenarios) == 8, f"Expected 8 scenarios, got {len(scenarios)}"
        
        ready_count = 0
        ready_with_window = 0
        
        # Validate each scenario
        for i, scn in enumerate(scenarios):
            log(f"\n--- Scenario {i+1}: {scn.get('title')} ---")
            
            # Required fields for all scenarios
            required_base = ['id', 'title', 'date', 'category', 'description']
            for field in required_base:
                assert field in scn, f"Scenario {i+1} missing required field: {field}"
            
            log(f"  id: {scn['id']}")
            log(f"  title: {scn['title']}")
            log(f"  date: {scn['date']}")
            log(f"  category: {scn['category']}")
            log(f"  status: {scn.get('status', 'N/A')}")
            
            # Validate date format (YYYY-MM-DD)
            try:
                datetime.strptime(scn['date'], '%Y-%m-%d')
            except Exception:
                raise AssertionError(f"Scenario {i+1} has invalid date format: {scn['date']}")
            
            # For status='ready' scenarios, validate additional fields
            if scn.get('status') == 'ready':
                ready_count += 1
                log(f"  ✓ Status: ready")
                
                # price_at_event must be a number > 0
                assert 'price_at_event' in scn, f"Scenario {i+1} (ready) missing 'price_at_event'"
                price = scn['price_at_event']
                assert isinstance(price, (int, float)), f"price_at_event must be number, got {type(price)}"
                assert price > 0, f"price_at_event must be > 0, got {price}"
                log(f"  price_at_event: ${price:,.2f}")
                
                # window must be a non-empty list
                assert 'window' in scn, f"Scenario {i+1} (ready) missing 'window'"
                window = scn['window']
                assert isinstance(window, list), f"window must be list, got {type(window)}"
                assert len(window) > 0, f"window must be non-empty, got {len(window)}"
                log(f"  window: {len(window)} data points")
                
                # Each window element must have {date, close, is_pick}
                for j, w in enumerate(window[:3]):  # Check first 3
                    assert 'date' in w, f"Window item {j} missing 'date'"
                    assert 'close' in w, f"Window item {j} missing 'close'"
                    assert 'is_pick' in w, f"Window item {j} missing 'is_pick'"
                    assert isinstance(w['is_pick'], bool), f"is_pick must be bool, got {type(w['is_pick'])}"
                
                # EXACTLY ONE element must have is_pick=true
                pick_count = sum(1 for w in window if w.get('is_pick') == True)
                assert pick_count == 1, f"Expected exactly 1 is_pick=true, got {pick_count}"
                log(f"  ✓ Exactly 1 is_pick=true in window")
                
                # outcomes must have keys 30d/90d/365d (each a number or null)
                assert 'outcomes' in scn, f"Scenario {i+1} (ready) missing 'outcomes'"
                outcomes = scn['outcomes']
                assert isinstance(outcomes, dict), f"outcomes must be dict, got {type(outcomes)}"
                
                for period in ['30d', '90d', '365d']:
                    assert period in outcomes, f"outcomes missing '{period}'"
                    val = outcomes[period]
                    if val is not None:
                        assert isinstance(val, (int, float)), f"outcomes.{period} must be number or null, got {type(val)}"
                        log(f"  outcomes.{period}: {val}%")
                    else:
                        log(f"  outcomes.{period}: null")
                
                # model must be an object with boolean 'available'
                assert 'model' in scn, f"Scenario {i+1} (ready) missing 'model'"
                model = scn['model']
                assert isinstance(model, dict), f"model must be dict, got {type(model)}"
                assert 'available' in model, f"model missing 'available' field"
                assert isinstance(model['available'], bool), f"model.available must be bool, got {type(model['available'])}"
                log(f"  model.available: {model['available']}")
                
                # For historic 2020-2024 dates, model.available should be false with a 'note'
                year = int(scn['date'][:4])
                if 2020 <= year <= 2024:
                    if model['available'] == False:
                        assert 'note' in model, f"model with available=false should have 'note' field"
                        assert isinstance(model['note'], str), f"model.note must be string"
                        assert len(model['note']) > 0, f"model.note must be non-empty"
                        log(f"  model.note: {model['note'][:80]}...")
                
                ready_with_window += 1
        
        # At least 6 of the 8 scenarios must be status='ready' with non-empty window and numeric price_at_event
        log(f"\n--- Summary ---")
        log(f"Total scenarios: {len(scenarios)}")
        log(f"Ready scenarios: {ready_count}")
        log(f"Ready with valid window and price: {ready_with_window}")
        
        assert ready_with_window >= 6, f"Expected at least 6 ready scenarios with window and price, got {ready_with_window}"
        
        log("\n✅ TEST 1 PASSED: Curated Time Machine Scenarios")
        return True
        
    except AssertionError as e:
        log(f"\n❌ TEST 1 FAILED: {e}")
        return False
    except Exception as e:
        log(f"\n❌ TEST 1 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_news_clustering():
    """2) News clustering — POST /api/v1/news/refresh, then poll GET /api/v1/news"""
    log("\n" + "=" * 80)
    log("TEST 2: News Clustering + Verification + Forecast Impact")
    log("=" * 80)
    
    try:
        # Trigger news refresh
        log("Step 1: POST /api/v1/news/refresh...")
        r1 = requests.post(f"{API_BASE}/news/refresh", timeout=30)
        log(f"Status: {r1.status_code}")
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}"
        
        data1 = r1.json()
        log(f"Response: {data1}")
        assert data1.get('status') == 'started', f"Expected status='started', got {data1.get('status')}"
        
        # Poll GET /api/v1/news until status='ready' (allow up to ~60s)
        log("\nStep 2: Polling GET /api/v1/news until status='ready'...")
        max_attempts = 12  # 12 * 5s = 60s
        attempt = 0
        news_data = None
        
        while attempt < max_attempts:
            attempt += 1
            log(f"  Attempt {attempt}/{max_attempts}...")
            
            r2 = requests.get(f"{API_BASE}/news", timeout=30)
            assert r2.status_code == 200, f"Expected 200, got {r2.status_code}"
            
            news_data = r2.json()
            status = news_data.get('status')
            log(f"  Status: {status}")
            
            if status == 'ready':
                log("  ✓ News ready!")
                break
            elif status in ['computing', 'error']:
                if attempt < max_attempts:
                    time.sleep(5)
                else:
                    raise AssertionError(f"News did not become ready after {max_attempts} attempts, final status: {status}")
            else:
                raise AssertionError(f"Unexpected status: {status}")
        
        assert news_data is not None, "Failed to get news data"
        assert news_data.get('status') == 'ready', f"Expected status='ready', got {news_data.get('status')}"
        
        # Validate cards array
        log("\nStep 3: Validating news cards...")
        assert 'cards' in news_data, "Missing 'cards' field"
        cards = news_data['cards']
        assert isinstance(cards, list), f"cards must be list, got {type(cards)}"
        log(f"Total cards: {len(cards)}")
        assert len(cards) > 0, "Expected at least one news card"
        
        # Track titles to check for duplicates
        titles = []
        max_n_sources = 0
        
        # Validate each card
        for i, card in enumerate(cards):
            log(f"\n--- Card {i+1}: {card.get('title', 'N/A')[:60]}... ---")
            
            # NEW FIELDS: verification, n_sources, sources, forecast_impact
            
            # 1. verification (one of 'Confirmed'/'Unconfirmed'/'Single-source')
            assert 'verification' in card, f"Card {i+1} missing 'verification'"
            verification = card['verification']
            valid_verifications = ['Confirmed', 'Unconfirmed', 'Single-source']
            assert verification in valid_verifications, f"Invalid verification: {verification}, expected one of {valid_verifications}"
            log(f"  verification: {verification}")
            
            # 2. n_sources (int >= 1)
            assert 'n_sources' in card, f"Card {i+1} missing 'n_sources'"
            n_sources = card['n_sources']
            assert isinstance(n_sources, int), f"n_sources must be int, got {type(n_sources)}"
            assert n_sources >= 1, f"n_sources must be >= 1, got {n_sources}"
            log(f"  n_sources: {n_sources}")
            max_n_sources = max(max_n_sources, n_sources)
            
            # 3. sources (non-empty list; each has source, link, credibility)
            assert 'sources' in card, f"Card {i+1} missing 'sources'"
            sources = card['sources']
            assert isinstance(sources, list), f"sources must be list, got {type(sources)}"
            assert len(sources) > 0, f"sources must be non-empty"
            log(f"  sources: {len(sources)} items")
            
            # Validate first source structure
            src = sources[0]
            assert 'source' in src, "source item missing 'source' field"
            assert 'link' in src, "source item missing 'link' field"
            assert 'credibility' in src, "source item missing 'credibility' field"
            assert isinstance(src['credibility'], (int, float)), f"credibility must be number, got {type(src['credibility'])}"
            log(f"    source[0]: {src['source']} (credibility: {src['credibility']})")
            
            # 4. forecast_impact object
            assert 'forecast_impact' in card, f"Card {i+1} missing 'forecast_impact'"
            fi = card['forecast_impact']
            assert isinstance(fi, dict), f"forecast_impact must be dict, got {type(fi)}"
            
            # forecast_impact.direction (str)
            assert 'direction' in fi, "forecast_impact missing 'direction'"
            direction = fi['direction']
            assert isinstance(direction, str), f"direction must be str, got {type(direction)}"
            valid_directions = ['bullish', 'bearish', 'mixed', 'neutral']
            assert direction in valid_directions, f"Invalid direction: {direction}, expected one of {valid_directions}"
            log(f"  forecast_impact.direction: {direction}")
            
            # forecast_impact.nudge_pts (number)
            assert 'nudge_pts' in fi, "forecast_impact missing 'nudge_pts'"
            nudge_pts = fi['nudge_pts']
            assert isinstance(nudge_pts, (int, float)), f"nudge_pts must be number, got {type(nudge_pts)}"
            log(f"  forecast_impact.nudge_pts: {nudge_pts}")
            
            # forecast_impact.horizons (list)
            assert 'horizons' in fi, "forecast_impact missing 'horizons'"
            horizons = fi['horizons']
            assert isinstance(horizons, list), f"horizons must be list, got {type(horizons)}"
            log(f"  forecast_impact.horizons: {horizons}")
            
            # forecast_impact.note (str)
            assert 'note' in fi, "forecast_impact missing 'note'"
            note = fi['note']
            assert isinstance(note, str), f"note must be str, got {type(note)}"
            assert len(note) > 0, f"note must be non-empty"
            log(f"  forecast_impact.note: {note[:60]}...")
            
            # EXISTING FIELDS: title, impact, impact_label, ai.summary, ai.direction
            
            # title
            assert 'title' in card, f"Card {i+1} missing 'title'"
            title = card['title']
            assert isinstance(title, str), f"title must be str, got {type(title)}"
            assert len(title) > 0, f"title must be non-empty"
            titles.append(title)
            
            # impact (int)
            assert 'impact' in card, f"Card {i+1} missing 'impact'"
            impact = card['impact']
            assert isinstance(impact, int), f"impact must be int, got {type(impact)}"
            log(f"  impact: {impact}")
            
            # impact_label
            assert 'impact_label' in card, f"Card {i+1} missing 'impact_label'"
            impact_label = card['impact_label']
            assert isinstance(impact_label, str), f"impact_label must be str, got {type(impact_label)}"
            log(f"  impact_label: {impact_label}")
            
            # ai object
            assert 'ai' in card, f"Card {i+1} missing 'ai'"
            ai = card['ai']
            assert isinstance(ai, dict), f"ai must be dict, got {type(ai)}"
            
            # ai.summary
            assert 'summary' in ai, "ai missing 'summary'"
            summary = ai['summary']
            assert isinstance(summary, str), f"ai.summary must be str, got {type(summary)}"
            assert len(summary) > 0, f"ai.summary must be non-empty"
            log(f"  ai.summary: {summary[:60]}...")
            
            # ai.direction
            assert 'direction' in ai, "ai missing 'direction'"
            ai_direction = ai['direction']
            assert isinstance(ai_direction, str), f"ai.direction must be str, got {type(ai_direction)}"
            assert ai_direction in valid_directions, f"Invalid ai.direction: {ai_direction}"
            log(f"  ai.direction: {ai_direction}")
        
        # Check for duplicate titles (clustering should dedupe)
        log(f"\n--- Checking for duplicate titles ---")
        unique_titles = set(titles)
        log(f"Total cards: {len(cards)}")
        log(f"Unique titles: {len(unique_titles)}")
        assert len(unique_titles) == len(titles), f"Found duplicate titles! {len(titles) - len(unique_titles)} duplicates"
        log("  ✓ No duplicate titles (clustering working)")
        
        # Report max n_sources
        log(f"\n--- Max n_sources seen: {max_n_sources} ---")
        if max_n_sources > 1:
            log("  ✓ Clustering is grouping multiple sources (at least one card has n_sources > 1)")
        else:
            log("  ⚠️  All cards have n_sources=1 (no multi-source clustering observed)")
        
        log("\n✅ TEST 2 PASSED: News Clustering + Verification + Forecast Impact")
        return True
        
    except AssertionError as e:
        log(f"\n❌ TEST 2 FAILED: {e}")
        return False
    except Exception as e:
        log(f"\n❌ TEST 2 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression():
    """REGRESSION: GET /api/v1/dashboard, /api/v1/scorecard, /api/v1/health"""
    log("\n" + "=" * 80)
    log("TEST 3: REGRESSION - Core Endpoints")
    log("=" * 80)
    
    try:
        # Test GET /api/v1/dashboard
        log("Testing GET /api/v1/dashboard...")
        r1 = requests.get(f"{API_BASE}/dashboard", timeout=30)
        log(f"Status: {r1.status_code}")
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}"
        
        dash = r1.json()
        assert dash.get('status') == 'ready', f"Expected status='ready', got {dash.get('status')}"
        
        # Check required fields
        required_fields = ['risk', 'smart_money', 'institutional', 'smart_alerts', 'prediction_ledger']
        log("\nChecking dashboard fields:")
        for field in required_fields:
            assert field in dash, f"Missing required field: {field}"
            log(f"  ✓ {field}")
        
        # Test GET /api/v1/scorecard
        log("\nTesting GET /api/v1/scorecard...")
        r2 = requests.get(f"{API_BASE}/scorecard", timeout=30)
        log(f"Status: {r2.status_code}")
        assert r2.status_code == 200, f"Expected 200, got {r2.status_code}"
        
        scorecard = r2.json()
        assert scorecard.get('status') == 'ready', f"Expected status='ready', got {scorecard.get('status')}"
        
        # Check ledger and by_regime
        assert 'ledger' in scorecard or 'recent' in scorecard, "Missing ledger/recent field"
        assert 'by_regime' in scorecard, "Missing by_regime field"
        log("  ✓ ledger present")
        log("  ✓ by_regime present")
        
        # Test GET /api/v1/health
        log("\nTesting GET /api/v1/health...")
        r3 = requests.get(f"{API_BASE}/health", timeout=30)
        log(f"Status: {r3.status_code}")
        assert r3.status_code == 200, f"Expected 200, got {r3.status_code}"
        
        health = r3.json()
        assert health.get('status') == 'ok', f"Expected status='ok', got {health.get('status')}"
        log(f"  ✓ Health: {health}")
        
        log("\n✅ TEST 3 PASSED: REGRESSION")
        return True
        
    except AssertionError as e:
        log(f"\n❌ TEST 3 FAILED: {e}")
        return False
    except Exception as e:
        log(f"\n❌ TEST 3 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    log("=" * 80)
    log("BTCIQ BACKEND TESTING - STAGE 3 FEATURES")
    log(f"Base URL: {BASE_URL}")
    log(f"API Base: {API_BASE}")
    log("=" * 80)
    
    results = {}
    
    # Run all tests
    results['1_curated_scenarios'] = test_curated_scenarios()
    results['2_news_clustering'] = test_news_clustering()
    results['3_regression'] = test_regression()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        log(f"{test_name}: {status}")
    
    log(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        log("\n🎉 ALL STAGE 3 TESTS PASSED!")
        return 0
    else:
        log(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
