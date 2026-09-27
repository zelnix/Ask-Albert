#!/usr/bin/env python3
"""
Comprehensive test for NEW Leverage engine endpoint: GET /api/v1/leverage?timeframe={1H|4H|1D|7D}
Tests via external base URL + /api prefix.
Core metrics are REAL (OKX public API); liquidations, liquidation heatmap, estimated-leverage 
percentile and positioning.position_ratio are DERIVED/DEMO and flagged demo=true.
"""
import requests
import sys
import time

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_leverage_timeframe(timeframe):
    """Test leverage endpoint for a specific timeframe"""
    print(f"\n{'='*80}")
    print(f"TESTING TIMEFRAME: {timeframe}")
    print(f"{'='*80}")
    
    url = f"{BASE_URL}/v1/leverage?timeframe={timeframe}"
    print(f"GET {url}")
    
    try:
        r = requests.get(url, timeout=30)
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            return False
        
        data = r.json()
        
        # 1. Check status == 'ready' (NO 500s)
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status={data.get('status')}, expected 'ready'")
            return False
        print(f"✅ status='ready'")
        
        # 2. Response 'timeframe' echoes the requested value
        if data.get('timeframe') != timeframe:
            print(f"❌ FAILED: timeframe={data.get('timeframe')}, expected '{timeframe}'")
            return False
        print(f"✅ timeframe='{timeframe}' (echoes request)")
        
        # 3. price is numeric
        price = data.get('price')
        if not isinstance(price, (int, float)) or price is None:
            print(f"❌ FAILED: price={price} is not numeric")
            return False
        print(f"✅ price={price} (numeric)")
        
        # 4. open_interest validation
        oi = data.get('open_interest', {})
        if not isinstance(oi, dict):
            print(f"❌ FAILED: open_interest is not a dict")
            return False
        
        # value_usd numeric
        if not isinstance(oi.get('value_usd'), (int, float)):
            print(f"❌ FAILED: open_interest.value_usd={oi.get('value_usd')} is not numeric")
            return False
        print(f"✅ open_interest.value_usd={oi.get('value_usd')} (numeric)")
        
        # change_tf_pct numeric
        if not isinstance(oi.get('change_tf_pct'), (int, float)):
            print(f"❌ FAILED: open_interest.change_tf_pct={oi.get('change_tf_pct')} is not numeric")
            return False
        print(f"✅ open_interest.change_tf_pct={oi.get('change_tf_pct')} (numeric)")
        
        # state in [Rising,Falling,Stable]
        if oi.get('state') not in ['Rising', 'Falling', 'Stable']:
            print(f"❌ FAILED: open_interest.state={oi.get('state')} not in [Rising,Falling,Stable]")
            return False
        print(f"✅ open_interest.state='{oi.get('state')}' (valid)")
        
        # series is a non-empty list
        if not isinstance(oi.get('series'), list) or len(oi.get('series', [])) == 0:
            print(f"❌ FAILED: open_interest.series is not a non-empty list")
            return False
        # Check items have t and oi
        sample = oi['series'][0]
        if 't' not in sample or 'oi' not in sample:
            print(f"❌ FAILED: open_interest.series items missing 't' or 'oi'")
            return False
        print(f"✅ open_interest.series has {len(oi['series'])} items with t and oi")
        
        # 5. funding validation
        funding = data.get('funding', {})
        if not isinstance(funding, dict):
            print(f"❌ FAILED: funding is not a dict")
            return False
        
        # rate numeric
        if not isinstance(funding.get('rate'), (int, float)):
            print(f"❌ FAILED: funding.rate={funding.get('rate')} is not numeric")
            return False
        print(f"✅ funding.rate={funding.get('rate')} (numeric)")
        
        # direction in [Positive,Negative,Flat]
        if funding.get('direction') not in ['Positive', 'Negative', 'Flat']:
            print(f"❌ FAILED: funding.direction={funding.get('direction')} not in [Positive,Negative,Flat]")
            return False
        print(f"✅ funding.direction='{funding.get('direction')}' (valid)")
        
        # bias in [Long Bias,Neutral,Short Bias]
        if funding.get('bias') not in ['Long Bias', 'Neutral', 'Short Bias']:
            print(f"❌ FAILED: funding.bias={funding.get('bias')} not in [Long Bias,Neutral,Short Bias]")
            return False
        print(f"✅ funding.bias='{funding.get('bias')}' (valid)")
        
        # exchanges non-empty (contains OKX)
        exchanges = funding.get('exchanges', [])
        if not isinstance(exchanges, list) or len(exchanges) == 0:
            print(f"❌ FAILED: funding.exchanges is not a non-empty list")
            return False
        okx_found = any(ex.get('name') == 'OKX' for ex in exchanges)
        if not okx_found:
            print(f"❌ FAILED: funding.exchanges does not contain OKX")
            return False
        print(f"✅ funding.exchanges contains OKX ({len(exchanges)} exchanges)")
        
        # series non-empty
        if not isinstance(funding.get('series'), list) or len(funding.get('series', [])) == 0:
            print(f"❌ FAILED: funding.series is not a non-empty list")
            return False
        print(f"✅ funding.series has {len(funding['series'])} items")
        
        # 6. positioning validation
        positioning = data.get('positioning', {})
        if not isinstance(positioning, dict):
            print(f"❌ FAILED: positioning is not a dict")
            return False
        
        # long_pct + short_pct ≈ 100 (within 1)
        long_pct = positioning.get('long_pct')
        short_pct = positioning.get('short_pct')
        if not isinstance(long_pct, (int, float)) or not isinstance(short_pct, (int, float)):
            print(f"❌ FAILED: long_pct or short_pct not numeric")
            return False
        total = long_pct + short_pct
        if abs(total - 100) > 1:
            print(f"❌ FAILED: long_pct + short_pct = {total}, expected ≈100 (within 1)")
            return False
        print(f"✅ long_pct={long_pct}, short_pct={short_pct}, sum={total} (≈100)")
        
        # account_ratio numeric
        if not isinstance(positioning.get('account_ratio'), (int, float)):
            print(f"❌ FAILED: positioning.account_ratio not numeric")
            return False
        print(f"✅ positioning.account_ratio={positioning.get('account_ratio')} (numeric)")
        
        # account_ratio_prev numeric
        if not isinstance(positioning.get('account_ratio_prev'), (int, float)):
            print(f"❌ FAILED: positioning.account_ratio_prev not numeric")
            return False
        print(f"✅ positioning.account_ratio_prev={positioning.get('account_ratio_prev')} (numeric)")
        
        # ratio_change_tf numeric
        if not isinstance(positioning.get('ratio_change_tf'), (int, float)):
            print(f"❌ FAILED: positioning.ratio_change_tf not numeric")
            return False
        print(f"✅ positioning.ratio_change_tf={positioning.get('ratio_change_tf')} (numeric)")
        
        # trend is a string
        if not isinstance(positioning.get('trend'), str):
            print(f"❌ FAILED: positioning.trend not a string")
            return False
        print(f"✅ positioning.trend='{positioning.get('trend')}' (string)")
        
        # series non-empty
        if not isinstance(positioning.get('series'), list) or len(positioning.get('series', [])) == 0:
            print(f"❌ FAILED: positioning.series is not a non-empty list")
            return False
        print(f"✅ positioning.series has {len(positioning['series'])} items")
        
        # 7. summary validation
        summary = data.get('summary', {})
        if not isinstance(summary, dict):
            print(f"❌ FAILED: summary is not a dict")
            return False
        
        # pressure in [LOW,MODERATE,ELEVATED,HIGH,EXTREME]
        if summary.get('pressure') not in ['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'EXTREME']:
            print(f"❌ FAILED: summary.pressure={summary.get('pressure')} not in [LOW,MODERATE,ELEVATED,HIGH,EXTREME]")
            return False
        print(f"✅ summary.pressure='{summary.get('pressure')}' (valid)")
        
        # pressure_score between 0 and 100
        ps = summary.get('pressure_score')
        if not isinstance(ps, (int, float)) or ps < 0 or ps > 100:
            print(f"❌ FAILED: summary.pressure_score={ps} not in [0,100]")
            return False
        print(f"✅ summary.pressure_score={ps} (0-100)")
        
        # bias in [Long Dominant,Short Dominant,Balanced]
        if summary.get('bias') not in ['Long Dominant', 'Short Dominant', 'Balanced']:
            print(f"❌ FAILED: summary.bias={summary.get('bias')} not in [Long Dominant,Short Dominant,Balanced]")
            return False
        print(f"✅ summary.bias='{summary.get('bias')}' (valid)")
        
        # squeeze in [Long Squeeze Risk,Short Squeeze Risk,Neutral]
        if summary.get('squeeze') not in ['Long Squeeze Risk', 'Short Squeeze Risk', 'Neutral']:
            print(f"❌ FAILED: summary.squeeze={summary.get('squeeze')} not in [Long Squeeze Risk,Short Squeeze Risk,Neutral]")
            return False
        print(f"✅ summary.squeeze='{summary.get('squeeze')}' (valid)")
        
        # interpretation non-empty string
        if not isinstance(summary.get('interpretation'), str) or len(summary.get('interpretation', '')) == 0:
            print(f"❌ FAILED: summary.interpretation is not a non-empty string")
            return False
        print(f"✅ summary.interpretation present ({len(summary['interpretation'])} chars)")
        
        # 8. squeeze validation
        squeeze = data.get('squeeze', {})
        if not isinstance(squeeze, dict):
            print(f"❌ FAILED: squeeze is not a dict")
            return False
        
        # long_risk and short_risk are ints 0-100
        lr = squeeze.get('long_risk')
        sr = squeeze.get('short_risk')
        if not isinstance(lr, int) or lr < 0 or lr > 100:
            print(f"❌ FAILED: squeeze.long_risk={lr} not int 0-100")
            return False
        if not isinstance(sr, int) or sr < 0 or sr > 100:
            print(f"❌ FAILED: squeeze.short_risk={sr} not int 0-100")
            return False
        print(f"✅ squeeze.long_risk={lr}, short_risk={sr} (ints 0-100)")
        
        # long_label and short_label in [Low,Moderate,Elevated,High]
        if squeeze.get('long_label') not in ['Low', 'Moderate', 'Elevated', 'High']:
            print(f"❌ FAILED: squeeze.long_label={squeeze.get('long_label')} not in [Low,Moderate,Elevated,High]")
            return False
        if squeeze.get('short_label') not in ['Low', 'Moderate', 'Elevated', 'High']:
            print(f"❌ FAILED: squeeze.short_label={squeeze.get('short_label')} not in [Low,Moderate,Elevated,High]")
            return False
        print(f"✅ squeeze.long_label='{squeeze.get('long_label')}', short_label='{squeeze.get('short_label')}' (valid)")
        
        # long_explain/short_explain non-empty
        if not isinstance(squeeze.get('long_explain'), str) or len(squeeze.get('long_explain', '')) == 0:
            print(f"❌ FAILED: squeeze.long_explain is not a non-empty string")
            return False
        if not isinstance(squeeze.get('short_explain'), str) or len(squeeze.get('short_explain', '')) == 0:
            print(f"❌ FAILED: squeeze.short_explain is not a non-empty string")
            return False
        print(f"✅ squeeze.long_explain and short_explain present")
        
        # 9. estimated_leverage.demo == true
        el = data.get('estimated_leverage', {})
        if not isinstance(el, dict):
            print(f"❌ FAILED: estimated_leverage is not a dict")
            return False
        if el.get('demo') != True:
            print(f"❌ FAILED: estimated_leverage.demo={el.get('demo')}, expected True")
            return False
        print(f"✅ estimated_leverage.demo=True (DERIVED/DEMO as expected)")
        
        # Check ratio, percentile, status, series present
        if not isinstance(el.get('ratio'), (int, float)):
            print(f"❌ FAILED: estimated_leverage.ratio not numeric")
            return False
        if not isinstance(el.get('percentile'), int):
            print(f"❌ FAILED: estimated_leverage.percentile not int")
            return False
        if not isinstance(el.get('status'), str):
            print(f"❌ FAILED: estimated_leverage.status not string")
            return False
        if not isinstance(el.get('series'), list):
            print(f"❌ FAILED: estimated_leverage.series not list")
            return False
        print(f"✅ estimated_leverage has ratio={el.get('ratio')}, percentile={el.get('percentile')}, status='{el.get('status')}', series ({len(el.get('series', []))} items)")
        
        # 10. liquidations.demo == true
        liq = data.get('liquidations', {})
        if not isinstance(liq, dict):
            print(f"❌ FAILED: liquidations is not a dict")
            return False
        if liq.get('demo') != True:
            print(f"❌ FAILED: liquidations.demo={liq.get('demo')}, expected True")
            return False
        print(f"✅ liquidations.demo=True (DERIVED/DEMO as expected)")
        
        # Check long_1h/short_1h/long_4h/short_4h/long_24h/short_24h numeric
        for key in ['long_1h', 'short_1h', 'long_4h', 'short_4h', 'long_24h', 'short_24h']:
            if not isinstance(liq.get(key), (int, float)):
                print(f"❌ FAILED: liquidations.{key}={liq.get(key)} not numeric")
                return False
        print(f"✅ liquidations has all 6 numeric fields (long_1h={liq.get('long_1h')}, short_1h={liq.get('short_1h')}, long_4h={liq.get('long_4h')}, short_4h={liq.get('short_4h')}, long_24h={liq.get('long_24h')}, short_24h={liq.get('short_24h')})")
        
        # net_pressure string
        if not isinstance(liq.get('net_pressure'), str):
            print(f"❌ FAILED: liquidations.net_pressure not string")
            return False
        print(f"✅ liquidations.net_pressure='{liq.get('net_pressure')}' (string)")
        
        # 11. heatmap.demo == true
        hm = data.get('heatmap', {})
        if not isinstance(hm, dict):
            print(f"❌ FAILED: heatmap is not a dict")
            return False
        if hm.get('demo') != True:
            print(f"❌ FAILED: heatmap.demo={hm.get('demo')}, expected True")
            return False
        print(f"✅ heatmap.demo=True (DERIVED/DEMO as expected)")
        
        # zones non-empty, each with price, side in [long,short], intensity, distance_pct
        zones = hm.get('zones', [])
        if not isinstance(zones, list) or len(zones) == 0:
            print(f"❌ FAILED: heatmap.zones is not a non-empty list")
            return False
        sample_zone = zones[0]
        if not isinstance(sample_zone.get('price'), (int, float)):
            print(f"❌ FAILED: heatmap.zones[0].price not numeric")
            return False
        if sample_zone.get('side') not in ['long', 'short']:
            print(f"❌ FAILED: heatmap.zones[0].side={sample_zone.get('side')} not in [long,short]")
            return False
        if not isinstance(sample_zone.get('intensity'), (int, float)):
            print(f"❌ FAILED: heatmap.zones[0].intensity not numeric")
            return False
        if not isinstance(sample_zone.get('distance_pct'), (int, float)):
            print(f"❌ FAILED: heatmap.zones[0].distance_pct not numeric")
            return False
        print(f"✅ heatmap.zones has {len(zones)} items with price, side, intensity, distance_pct")
        
        # 12. albert_call validation
        ac = data.get('albert_call', {})
        if not isinstance(ac, dict):
            print(f"❌ FAILED: albert_call is not a dict")
            return False
        
        # impact_points is an int in [-15,15]
        ip = ac.get('impact_points')
        if not isinstance(ip, int) or ip < -15 or ip > 15:
            print(f"❌ FAILED: albert_call.impact_points={ip} not int in [-15,15]")
            return False
        print(f"✅ albert_call.impact_points={ip} (int in [-15,15])")
        
        # impact_label present
        if not isinstance(ac.get('impact_label'), str):
            print(f"❌ FAILED: albert_call.impact_label not string")
            return False
        print(f"✅ albert_call.impact_label='{ac.get('impact_label')}' (string)")
        
        # explanation non-empty
        if not isinstance(ac.get('explanation'), str) or len(ac.get('explanation', '')) == 0:
            print(f"❌ FAILED: albert_call.explanation is not a non-empty string")
            return False
        print(f"✅ albert_call.explanation present ({len(ac['explanation'])} chars)")
        
        # 13. bitmark validation
        bm = data.get('bitmark', {})
        if not isinstance(bm, dict):
            print(f"❌ FAILED: bitmark is not a dict")
            return False
        
        # observations is a list of ~5 non-empty strings
        obs = bm.get('observations', [])
        if not isinstance(obs, list) or len(obs) < 3:
            print(f"❌ FAILED: bitmark.observations is not a list with at least 3 items")
            return False
        for i, o in enumerate(obs):
            if not isinstance(o, str) or len(o) == 0:
                print(f"❌ FAILED: bitmark.observations[{i}] is not a non-empty string")
                return False
        print(f"✅ bitmark.observations has {len(obs)} non-empty strings")
        
        # assessment_title and assessment_text present
        if not isinstance(bm.get('assessment_title'), str) or len(bm.get('assessment_title', '')) == 0:
            print(f"❌ FAILED: bitmark.assessment_title is not a non-empty string")
            return False
        if not isinstance(bm.get('assessment_text'), str) or len(bm.get('assessment_text', '')) == 0:
            print(f"❌ FAILED: bitmark.assessment_text is not a non-empty string")
            return False
        print(f"✅ bitmark.assessment_title='{bm.get('assessment_title')}', assessment_text present ({len(bm['assessment_text'])} chars)")
        
        # 14. sources is a non-empty list
        sources = data.get('sources', [])
        if not isinstance(sources, list) or len(sources) == 0:
            print(f"❌ FAILED: sources is not a non-empty list")
            return False
        print(f"✅ sources has {len(sources)} items")
        
        # 15. disclaimer is present
        if not isinstance(data.get('disclaimer'), str) or len(data.get('disclaimer', '')) == 0:
            print(f"❌ FAILED: disclaimer is not a non-empty string")
            return False
        print(f"✅ disclaimer present ({len(data['disclaimer'])} chars)")
        
        print(f"\n✅ ALL VALIDATIONS PASSED FOR TIMEFRAME {timeframe}")
        return True
        
    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_refresh():
    """Test refresh=1 on one timeframe (should still return status='ready')"""
    print(f"\n{'='*80}")
    print(f"TESTING REFRESH=1 (timeframe=4H)")
    print(f"{'='*80}")
    
    url = f"{BASE_URL}/v1/leverage?timeframe=4H&refresh=1"
    print(f"GET {url}")
    
    try:
        r = requests.get(url, timeout=30)
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            return False
        
        data = r.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status={data.get('status')}, expected 'ready'")
            return False
        
        print(f"✅ refresh=1 works, status='ready'")
        return True
        
    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_dashboard_regression():
    """Quick REGRESSION check that GET /api/v1/dashboard still returns status='ready'"""
    print(f"\n{'='*80}")
    print(f"REGRESSION TEST: GET /api/v1/dashboard")
    print(f"{'='*80}")
    
    url = f"{BASE_URL}/v1/dashboard"
    print(f"GET {url}")
    
    try:
        r = requests.get(url, timeout=30)
        print(f"Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {r.status_code}")
            return False
        
        data = r.json()
        
        if data.get('status') != 'ready':
            print(f"❌ FAILED: status={data.get('status')}, expected 'ready'")
            return False
        
        print(f"✅ Dashboard still returns status='ready'")
        return True
        
    except Exception as e:
        print(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("="*80)
    print("LEVERAGE ENGINE COMPREHENSIVE TEST")
    print("Testing NEW endpoint: GET /api/v1/leverage?timeframe={1H|4H|1D|7D}")
    print("="*80)
    
    results = {}
    
    # Test all 4 timeframes
    for tf in ['1H', '4H', '1D', '7D']:
        results[tf] = test_leverage_timeframe(tf)
        time.sleep(1)  # Brief pause between tests
    
    # Test refresh=1
    results['refresh'] = test_refresh()
    time.sleep(1)
    
    # Test dashboard regression
    results['dashboard'] = test_dashboard_regression()
    
    # Summary
    print(f"\n{'='*80}")
    print("TEST SUMMARY")
    print(f"{'='*80}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for key, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{key}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED - Leverage engine is working correctly")
        sys.exit(0)
    else:
        print(f"\n❌ {total - passed} TEST(S) FAILED")
        sys.exit(1)


if __name__ == '__main__':
    main()
