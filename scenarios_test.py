#!/usr/bin/env python3
"""
Backend test for Albert If-Then Scenario Playbook + Contradiction Resolution
Tests decision.scenarios_block structure and regression endpoints
"""

import requests
import json
import sys

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_dashboard_scenarios_block():
    """
    Test 1: GET /api/v1/dashboard - validate decision.scenarios_block structure
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/dashboard - decision.scenarios_block validation")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print(f"✅ HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check status
        if data.get('status') != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{data.get('status')}'")
            return False
        print(f"✅ status='ready'")
        
        # Check decision object exists
        if 'decision' not in data:
            print(f"❌ FAILED: 'decision' object not found in response")
            return False
        print(f"✅ decision object present")
        
        decision = data['decision']
        
        # Check scenarios_block exists
        if 'scenarios_block' not in decision:
            print(f"❌ FAILED: 'scenarios_block' not found in decision")
            return False
        print(f"✅ decision.scenarios_block present")
        
        scenarios_block = decision['scenarios_block']
        
        # Validate scenarios_block is not null
        if scenarios_block is None:
            print(f"❌ FAILED: scenarios_block is null")
            return False
        print(f"✅ scenarios_block is not null")
        
        # Check required fields in scenarios_block
        required_fields = ['price', 'regime', 'regime_label', 'scenarios', 'contradiction']
        for field in required_fields:
            if field not in scenarios_block:
                print(f"❌ FAILED: '{field}' not found in scenarios_block")
                return False
            print(f"✅ scenarios_block.{field} present")
        
        # Validate price is a number
        price = scenarios_block['price']
        if not isinstance(price, (int, float)) or price <= 0:
            print(f"❌ FAILED: price should be a positive number, got {price}")
            return False
        print(f"✅ price={price} (valid number > 0)")
        
        # Validate regime is a string
        regime = scenarios_block['regime']
        if not isinstance(regime, str) or not regime:
            print(f"❌ FAILED: regime should be a non-empty string, got {regime}")
            return False
        print(f"✅ regime='{regime}' (non-empty string)")
        
        # Validate regime_label is a string
        regime_label = scenarios_block['regime_label']
        if not isinstance(regime_label, str) or not regime_label:
            print(f"❌ FAILED: regime_label should be a non-empty string, got {regime_label}")
            return False
        print(f"✅ regime_label='{regime_label}' (non-empty string)")
        
        # Validate scenarios is a list of 2
        scenarios = scenarios_block['scenarios']
        if not isinstance(scenarios, list):
            print(f"❌ FAILED: scenarios should be a list, got {type(scenarios)}")
            return False
        if len(scenarios) != 2:
            print(f"❌ FAILED: scenarios should have exactly 2 items, got {len(scenarios)}")
            return False
        print(f"✅ scenarios is a list with 2 items")
        
        # Validate scenario types
        if scenarios[0].get('type') != 'bull':
            print(f"❌ FAILED: scenarios[0].type should be 'bull', got '{scenarios[0].get('type')}'")
            return False
        print(f"✅ scenarios[0].type='bull'")
        
        if scenarios[1].get('type') != 'bear':
            print(f"❌ FAILED: scenarios[1].type should be 'bear', got '{scenarios[1].get('type')}'")
            return False
        print(f"✅ scenarios[1].type='bear'")
        
        # Validate each scenario structure
        for i, scenario in enumerate(scenarios):
            scenario_type = scenario.get('type')
            print(f"\n--- Validating {scenario_type} scenario (scenarios[{i}]) ---")
            
            required_scenario_fields = [
                'label', 'trigger', 'trigger_level', 'target', 
                'target_level', 'probability', 'move_pct', 'rationale'
            ]
            
            for field in required_scenario_fields:
                if field not in scenario:
                    print(f"❌ FAILED: '{field}' not found in {scenario_type} scenario")
                    return False
            
            # Validate label
            label = scenario['label']
            if not isinstance(label, str) or not label:
                print(f"❌ FAILED: {scenario_type}.label should be non-empty string, got {label}")
                return False
            print(f"✅ {scenario_type}.label='{label}'")
            
            # Validate trigger
            trigger = scenario['trigger']
            if not isinstance(trigger, str) or not trigger:
                print(f"❌ FAILED: {scenario_type}.trigger should be non-empty string, got {trigger}")
                return False
            print(f"✅ {scenario_type}.trigger='{trigger}' (non-empty string)")
            
            # Validate trigger_level
            trigger_level = scenario['trigger_level']
            if not isinstance(trigger_level, (int, float)):
                print(f"❌ FAILED: {scenario_type}.trigger_level should be a number, got {trigger_level}")
                return False
            print(f"✅ {scenario_type}.trigger_level={trigger_level} (number)")
            
            # Validate target
            target = scenario['target']
            if not isinstance(target, str) or not target:
                print(f"❌ FAILED: {scenario_type}.target should be non-empty string, got {target}")
                return False
            print(f"✅ {scenario_type}.target='{target}' (non-empty string)")
            
            # Validate target_level
            target_level = scenario['target_level']
            if not isinstance(target_level, (int, float)):
                print(f"❌ FAILED: {scenario_type}.target_level should be a number, got {target_level}")
                return False
            print(f"✅ {scenario_type}.target_level={target_level} (number)")
            
            # Validate probability
            probability = scenario['probability']
            if not isinstance(probability, int) or probability < 15 or probability > 85:
                print(f"❌ FAILED: {scenario_type}.probability should be int 15-85, got {probability}")
                return False
            print(f"✅ {scenario_type}.probability={probability} (int 15-85)")
            
            # Validate move_pct
            move_pct = scenario['move_pct']
            if not isinstance(move_pct, (int, float)):
                print(f"❌ FAILED: {scenario_type}.move_pct should be a number, got {move_pct}")
                return False
            print(f"✅ {scenario_type}.move_pct={move_pct} (number)")
            
            # Validate rationale
            rationale = scenario['rationale']
            if not isinstance(rationale, str) or not rationale:
                print(f"❌ FAILED: {scenario_type}.rationale should be non-empty string, got {rationale}")
                return False
            print(f"✅ {scenario_type}.rationale='{rationale[:50]}...' (non-empty string)")
            
            # Validate trigger_level vs price logic
            if scenario_type == 'bull':
                # Bull: trigger_level should be > price OR very close
                if trigger_level < price * 0.98:  # Allow 2% tolerance for "very close"
                    print(f"⚠️  WARNING: Bull trigger_level ({trigger_level}) should be > price ({price}) or very close")
                else:
                    print(f"✅ Bull trigger_level ({trigger_level}) > price ({price}) or very close")
                
                # Bull: target_level should be >= trigger_level
                if target_level < trigger_level:
                    print(f"❌ FAILED: Bull target_level ({target_level}) should be >= trigger_level ({trigger_level})")
                    return False
                print(f"✅ Bull target_level ({target_level}) >= trigger_level ({trigger_level})")
            
            elif scenario_type == 'bear':
                # Bear: trigger_level should be < price
                if trigger_level >= price:
                    print(f"❌ FAILED: Bear trigger_level ({trigger_level}) should be < price ({price})")
                    return False
                print(f"✅ Bear trigger_level ({trigger_level}) < price ({price})")
                
                # Bear: target_level should be <= trigger_level
                if target_level > trigger_level:
                    print(f"❌ FAILED: Bear target_level ({target_level}) should be <= trigger_level ({trigger_level})")
                    return False
                print(f"✅ Bear target_level ({target_level}) <= trigger_level ({trigger_level})")
        
        # Validate contradiction object
        print(f"\n--- Validating contradiction object ---")
        contradiction = scenarios_block['contradiction']
        
        if not isinstance(contradiction, dict):
            print(f"❌ FAILED: contradiction should be a dict, got {type(contradiction)}")
            return False
        
        required_contradiction_fields = ['present', 'winner', 'summary']
        for field in required_contradiction_fields:
            if field not in contradiction:
                print(f"❌ FAILED: '{field}' not found in contradiction")
                return False
        
        # Validate present is bool
        present = contradiction['present']
        if not isinstance(present, bool):
            print(f"❌ FAILED: contradiction.present should be bool, got {type(present)}")
            return False
        print(f"✅ contradiction.present={present} (bool)")
        
        # Validate winner
        winner = contradiction['winner']
        valid_winners = ['bullish', 'bearish', None]
        if winner not in valid_winners:
            print(f"❌ FAILED: contradiction.winner should be in {valid_winners}, got '{winner}'")
            return False
        print(f"✅ contradiction.winner='{winner}' (valid: bullish/bearish/null)")
        
        # Validate summary
        summary = contradiction['summary']
        if not isinstance(summary, str) or not summary:
            print(f"❌ FAILED: contradiction.summary should be non-empty string, got {summary}")
            return False
        print(f"✅ contradiction.summary='{summary[:50]}...' (non-empty string)")
        
        print("\n" + "="*80)
        print("✅ TEST 1 PASSED: decision.scenarios_block fully validated")
        print("="*80)
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Request error: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ FAILED: JSON decode error: {e}")
        return False
    except Exception as e:
        print(f"❌ FAILED: Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dashboard_weights_mode():
    """
    Test 2: GET /api/v1/dashboard - validate decision.weights_mode == "dynamic"
    """
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/dashboard - decision.weights_mode regression")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/dashboard"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print(f"✅ HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if 'decision' not in data:
            print(f"❌ FAILED: 'decision' object not found")
            return False
        
        weights_mode = data['decision'].get('weights_mode')
        if weights_mode != 'dynamic':
            print(f"❌ FAILED: Expected weights_mode='dynamic', got '{weights_mode}'")
            return False
        
        print(f"✅ decision.weights_mode='dynamic'")
        print("\n" + "="*80)
        print("✅ TEST 2 PASSED: weights_mode regression validated")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_forecast_regime():
    """
    Test 3: GET /api/v1/forecast/regime - expect status "ready"
    """
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/forecast/regime - regression test")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/forecast/regime"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print(f"✅ HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        status = data.get('status')
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        
        print(f"✅ status='ready'")
        print("\n" + "="*80)
        print("✅ TEST 3 PASSED: /forecast/regime regression validated")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_data_audit():
    """
    Test 4: GET /api/v1/data-audit - expect status "ready" with 10 feeds
    """
    print("\n" + "="*80)
    print("TEST 4: GET /api/v1/data-audit - regression test (10 feeds)")
    print("="*80)
    
    try:
        url = f"{BASE_URL}/v1/data-audit"
        print(f"Requesting: {url}")
        
        response = requests.get(url, timeout=60)
        print(f"✅ HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected HTTP 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        status = data.get('status')
        if status != 'ready':
            print(f"❌ FAILED: Expected status='ready', got '{status}'")
            return False
        print(f"✅ status='ready'")
        
        feeds = data.get('feeds', [])
        if not isinstance(feeds, list):
            print(f"❌ FAILED: 'feeds' should be a list, got {type(feeds)}")
            return False
        
        feed_count = len(feeds)
        if feed_count != 10:
            print(f"❌ FAILED: Expected 10 feeds, got {feed_count}")
            return False
        
        print(f"✅ feeds count: {feed_count} (expected 10)")
        
        # List feed names
        print(f"\nFeed names:")
        for i, feed in enumerate(feeds, 1):
            feed_name = feed.get('label', 'Unknown')
            feed_status = feed.get('status', 'Unknown')
            print(f"  {i}. {feed_name} (status: {feed_status})")
        
        print("\n" + "="*80)
        print("✅ TEST 4 PASSED: /data-audit regression validated (10 feeds)")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("ALBERT IF-THEN SCENARIO PLAYBOOK + CONTRADICTION RESOLUTION TEST SUITE")
    print("Base URL:", BASE_URL)
    print("="*80)
    
    results = []
    
    # Test 1: Main scenarios_block validation
    results.append(("scenarios_block validation", test_dashboard_scenarios_block()))
    
    # Test 2: weights_mode regression
    results.append(("weights_mode regression", test_dashboard_weights_mode()))
    
    # Test 3: forecast/regime regression
    results.append(("forecast/regime regression", test_forecast_regime()))
    
    # Test 4: data-audit regression
    results.append(("data-audit regression", test_data_audit()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Feature is production-ready!")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
