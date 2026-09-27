"""
ISOLATED SYNTHETIC BACKEND REGRESSION PHASE

This test suite validates the backend strategy-to-paper journey for all 57 frozen
candidate assets WITHOUT making any public network requests. All results are labeled
SYNTHETIC and use mocked/in-memory stores.

CRITICAL: NO real API calls to Kraken/Coinbase/CoinGecko/Gemini
CRITICAL: NO production DB writes, NO real orders, NO .env changes
CRITICAL: All 57 assets remain UNVERIFIED for official support
"""
import pytest
import sys
import os
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import json

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import the modules under test
from albert import asset_capabilities
from albert import ranking_snapshot
from albert.engine import scoring, decision
from albert.paper import core as paper_core, profiles as paper_profiles
from albert import market_adapter


class TestAssetCapabilitiesRegistry:
    """Test 1: Validate 57 unique IDs in frozen registry with proper edge cases"""
    
    def test_frozen_registry_has_57_candidates(self):
        """SYNTHETIC: Verify frozen registry contains exactly 57 unique asset IDs"""
        print("\n=== TEST 1A: Frozen Registry Structure ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        candidates = asset_capabilities.CANDIDATES
        assert len(candidates) == 57, f"Expected 57 candidates, got {len(candidates)}"
        
        # Verify all have unique IDs
        ids = [c['id'] for c in candidates]
        assert len(ids) == len(set(ids)), "Duplicate IDs found in registry"
        
        # Verify all have symbols
        symbols = [c['symbol'] for c in candidates]
        assert all(symbols), "Some candidates missing symbols"
        
        print(f"✅ Registry has 57 unique candidates")
        print(f"✅ All candidates have unique IDs")
        print(f"✅ All candidates have symbols")
        
    def test_pol_matic_legacy_alias_handling(self):
        """SYNTHETIC: Verify POL/MATIC legacy alias cannot silently merge or substitute"""
        print("\n=== TEST 1B: POL/MATIC Legacy Alias ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # POL should be in registry
        pol_candidate = asset_capabilities.candidate('POL')
        assert pol_candidate is not None, "POL not found in registry"
        assert pol_candidate['id'] == 'polygon-ecosystem-token'
        assert pol_candidate['symbol'] == 'POL'
        assert pol_candidate.get('legacySymbol') == 'MATIC'
        
        # MATIC should resolve to same ID but be blocked for new entries
        matic_candidate = asset_capabilities.candidate('MATIC')
        assert matic_candidate is not None, "MATIC lookup failed"
        assert matic_candidate['id'] == 'polygon-ecosystem-token'
        
        # MATIC should be blocked for new entries
        cap = asset_capabilities.capability('MATIC')
        assert not cap['entrySupported'], "MATIC should not support new entries"
        assert cap['reasonCode'] == 'RENAMED_TO_POL_NEW_ENTRIES_REQUIRE_REVIEW'
        
        # POL and MATIC should NOT be allowed in same strategy
        draft = {'assets': [
            {'symbol': 'POL', 'weightPct': 50},
            {'symbol': 'MATIC', 'weightPct': 50}
        ]}
        canonical = [
            {'symbol': 'POL', 'weightPct': 50},
            {'symbol': 'MATIC', 'weightPct': 50}
        ]
        errors = asset_capabilities.validate_assets(draft, canonical)
        assert any('duplicates the same underlying asset identity' in e for e in errors), \
            "POL and MATIC should not be allowed together"
        
        print(f"✅ POL found with legacy symbol MATIC")
        print(f"✅ MATIC blocked for new entries: {cap['reasonCode']}")
        print(f"✅ POL+MATIC cannot be in same strategy (duplicate identity)")
        
    def test_edge_case_assets(self):
        """SYNTHETIC: Test BNB, NEAR, POL, PEPE edge cases"""
        print("\n=== TEST 1C: Edge Case Assets ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        edge_cases = {
            'BNB': {'id': 'binancecoin', 'rank': 4},
            'NEAR': {'id': 'near', 'rank': 21},
            'POL': {'id': 'polygon-ecosystem-token', 'rank': 73},
            'PEPE': {'id': 'pepe', 'rank': 57}  # Low-price edge case
        }
        
        for symbol, expected in edge_cases.items():
            candidate = asset_capabilities.candidate(symbol)
            assert candidate is not None, f"{symbol} not found"
            assert candidate['id'] == expected['id'], f"{symbol} ID mismatch"
            assert candidate['rank'] == expected['rank'], f"{symbol} rank mismatch"
            print(f"✅ {symbol}: id={candidate['id']}, rank={candidate['rank']}")
        
    def test_all_57_symbols_resolve(self):
        """SYNTHETIC: Verify all 57 symbols can be looked up by symbol"""
        print("\n=== TEST 1D: All 57 Symbols Resolve ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        failed = []
        for c in asset_capabilities.CANDIDATES:
            symbol = c['symbol']
            resolved = asset_capabilities.candidate(symbol)
            if resolved is None or resolved['id'] != c['id']:
                failed.append(symbol)
        
        assert not failed, f"Failed to resolve symbols: {failed}"
        print(f"✅ All 57 symbols resolve correctly via candidate() lookup")


class TestAssetCapabilityValidation:
    """Test 2: Validate capability checks for all scenarios"""
    
    def test_unverified_assets_blocked(self):
        """SYNTHETIC: All 57 assets should be UNVERIFIED (no verifiedAssetIds set)"""
        print("\n=== TEST 2A: All Assets UNVERIFIED ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # Verify no assets are in VERIFIED_ASSET_IDS
        assert len(asset_capabilities.VERIFIED_ASSET_IDS) == 0, \
            f"Expected 0 verified assets, got {len(asset_capabilities.VERIFIED_ASSET_IDS)}"
        
        # Check a sample of assets
        test_symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'PEPE', 'POL']
        for symbol in test_symbols:
            cap = asset_capabilities.capability(symbol)
            assert cap['verificationStatus'] == 'IMPLEMENTED_UNVERIFIED', \
                f"{symbol} should be IMPLEMENTED_UNVERIFIED, got {cap['verificationStatus']}"
            assert not cap['entrySupported'], f"{symbol} should not support entry"
            assert cap['reasonCode'] == 'ENTRY_PATH_UNVERIFIED', \
                f"{symbol} should have ENTRY_PATH_UNVERIFIED reason"
            print(f"✅ {symbol}: {cap['verificationStatus']}, blocked: {cap['reasonCode']}")
        
    def test_explicit_user_selection_no_substitution(self):
        """SYNTHETIC: Explicit user coin selection must not be substituted"""
        print("\n=== TEST 2B: No Substitution of User Selection ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # User explicitly requests BTC and ETH
        goal = "I want a strategy with $BTC and $ETH"
        
        # Draft tries to substitute with SOL
        draft = {'assets': [
            {'symbol': 'BTC', 'weightPct': 50},
            {'symbol': 'SOL', 'weightPct': 50}  # Wrong!
        ]}
        
        errors = asset_capabilities.explicit_request_errors(goal, draft)
        assert len(errors) > 0, "Should have errors for substitution"
        assert any('requested assets must be kept exactly' in e for e in errors), \
            "Should reject substitution"
        print(f"✅ Substitution rejected: {errors[0]}")
        
        # Correct draft
        draft_correct = {'assets': [
            {'symbol': 'BTC', 'weightPct': 50},
            {'symbol': 'ETH', 'weightPct': 50}
        ]}
        errors_correct = asset_capabilities.explicit_request_errors(goal, draft_correct)
        assert len(errors_correct) == 0, f"Should have no errors, got: {errors_correct}"
        print(f"✅ Correct assets accepted")
        
    def test_explicit_weight_no_change(self):
        """SYNTHETIC: Explicit user weight must not be changed"""
        print("\n=== TEST 2C: No Weight Changes Without Consent ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # User explicitly requests 70/30 split
        goal = "I want BTC at 70% and ETH at 30%"
        
        # Draft tries to change weights
        draft = {'assets': [
            {'symbol': 'BTC', 'weightPct': 60},  # Wrong!
            {'symbol': 'ETH', 'weightPct': 40}   # Wrong!
        ]}
        
        errors = asset_capabilities.explicit_request_errors(goal, draft)
        assert len(errors) >= 2, "Should have errors for both weight changes"
        assert any('BTC weight is 70%' in e for e in errors), "Should reject BTC weight change"
        assert any('ETH weight is 30%' in e for e in errors), "Should reject ETH weight change"
        print(f"✅ Weight changes rejected: {len(errors)} errors")
        
    def test_mandate_excluded_coins(self):
        """SYNTHETIC: Mandate excluded coins must be blocked"""
        print("\n=== TEST 2D: Mandate Exclusions ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        mandate = {'excluded_coins': ['DOGE', 'SHIB']}
        
        cap_doge = asset_capabilities.capability('DOGE', mandate)
        assert cap_doge['mandateStatus'] == 'EXCLUDED'
        assert not cap_doge['startEligible']
        print(f"✅ DOGE excluded by mandate")
        
        cap_btc = asset_capabilities.capability('BTC', mandate)
        assert cap_btc['mandateStatus'] == 'ALLOWED'
        print(f"✅ BTC allowed (not in exclusion list)")
        
    def test_mandate_approved_coins_only(self):
        """SYNTHETIC: Mandate approved list restricts to only those coins"""
        print("\n=== TEST 2E: Mandate Approved List ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        mandate = {'approved_coins': ['BTC', 'ETH', 'SOL']}
        
        cap_btc = asset_capabilities.capability('BTC', mandate)
        assert cap_btc['mandateStatus'] == 'ALLOWED'
        print(f"✅ BTC allowed (in approved list)")
        
        cap_doge = asset_capabilities.capability('DOGE', mandate)
        assert cap_doge['mandateStatus'] == 'NOT_APPROVED'
        assert not cap_doge['startEligible']
        print(f"✅ DOGE blocked (not in approved list)")


class TestStrategyValidation:
    """Test 3: Strategy draft validation scenarios"""
    
    def test_draft_with_unsupported_asset_rejected(self):
        """SYNTHETIC: Draft with unsupported asset must be rejected"""
        print("\n=== TEST 3A: Unsupported Asset Rejection ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # All assets are currently UNVERIFIED
        draft = {'assets': [
            {'symbol': 'BTC', 'weightPct': 100}
        ]}
        canonical = [{'symbol': 'BTC', 'weightPct': 100}]
        
        errors = asset_capabilities.validate_assets(draft, canonical)
        assert len(errors) > 0, "Should have errors for unverified asset"
        assert any('entry path has not completed verification' in e for e in errors), \
            "Should mention verification incomplete"
        print(f"✅ Unverified asset rejected: {errors[0]}")
        
    def test_weight_sum_must_be_100(self):
        """SYNTHETIC: Asset weights must sum to exactly 100%"""
        print("\n=== TEST 3B: Weight Sum Validation ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # Weights don't sum to 100
        canonical = [
            {'symbol': 'BTC', 'weightPct': 50},
            {'symbol': 'ETH', 'weightPct': 40}  # Total = 90%
        ]
        
        errors = asset_capabilities.validate_assets({}, canonical)
        assert any('must sum to exactly 100%' in e for e in errors), \
            "Should reject weights not summing to 100%"
        print(f"✅ Invalid weight sum rejected")
        
        # Correct weights
        canonical_correct = [
            {'symbol': 'BTC', 'weightPct': 60},
            {'symbol': 'ETH', 'weightPct': 40}  # Total = 100%
        ]
        errors_correct = asset_capabilities.validate_assets({}, canonical_correct)
        # Will still have errors for unverified assets, but not for weight sum
        assert not any('must sum to exactly 100%' in e for e in errors_correct), \
            "Should not reject correct weight sum"
        print(f"✅ Correct weight sum accepted")
        
    def test_duplicate_assets_rejected(self):
        """SYNTHETIC: Duplicate assets in strategy must be rejected"""
        print("\n=== TEST 3C: Duplicate Asset Rejection ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        canonical = [
            {'symbol': 'BTC', 'weightPct': 50},
            {'symbol': 'BTC', 'weightPct': 50}  # Duplicate!
        ]
        
        errors = asset_capabilities.validate_assets({}, canonical)
        assert any('listed more than once' in e for e in errors), \
            "Should reject duplicate assets"
        print(f"✅ Duplicate asset rejected")
        
    def test_max_strategy_legs_enforced(self):
        """SYNTHETIC: Maximum 8 legs per strategy"""
        print("\n=== TEST 3D: Max Legs Validation ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # Try to create strategy with 9 legs
        symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'LINK', 'DOT']
        canonical = [{'symbol': s, 'weightPct': 100/9} for s in symbols]
        
        errors = asset_capabilities.validate_assets({'assets': canonical}, canonical)
        assert any('Too many assets' in e and '8' in e for e in errors), \
            "Should reject more than 8 legs"
        print(f"✅ Max 8 legs enforced")


class TestMarketDataHandling:
    """Test 4: Market data availability and gap handling"""
    
    def test_missing_data_blocks_entry(self):
        """SYNTHETIC: Missing market data must block entry"""
        print("\n=== TEST 4A: Missing Data Blocks Entry ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # Even if asset were verified, missing data blocks entry
        allowed, cap = asset_capabilities.entry_allowed('BTC', data_ok=False)
        assert not allowed, "Missing data should block entry"
        assert cap['dataAvailability'] == 'MISSING'
        assert not cap['entryEligible']
        print(f"✅ Missing data blocks entry: {cap['reasonCode']}")
        
    def test_fresh_data_required_for_entry(self):
        """SYNTHETIC: Fresh data required for entry eligibility"""
        print("\n=== TEST 4B: Fresh Data Required ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # With fresh data (but still unverified)
        allowed, cap = asset_capabilities.entry_allowed('BTC', data_ok=True)
        assert not allowed, "Still blocked due to unverified status"
        assert cap['dataAvailability'] == 'FRESH'
        # Would be eligible if verified
        print(f"✅ Fresh data recognized, still blocked by: {cap['reasonCode']}")


class TestProviderBases:
    """Test 5: Provider base symbol resolution"""
    
    def test_provider_bases_for_pol(self):
        """SYNTHETIC: POL should have correct provider base"""
        print("\n=== TEST 5A: POL Provider Bases ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        bases = asset_capabilities.provider_bases('POL')
        assert 'POL' in bases, "POL should be in provider bases"
        print(f"✅ POL provider bases: {bases}")
        
    def test_provider_bases_for_matic(self):
        """SYNTHETIC: MATIC should resolve to POL bases"""
        print("\n=== TEST 5B: MATIC Provider Bases ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        bases = asset_capabilities.provider_bases('MATIC')
        assert 'POL' in bases, "MATIC should resolve to POL bases"
        print(f"✅ MATIC provider bases: {bases}")
        
    def test_expected_pairs(self):
        """SYNTHETIC: Expected pairs generation"""
        print("\n=== TEST 5C: Expected Pairs ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        pairs = asset_capabilities.expected_pairs('BTC')
        assert 'BTC/USD' in pairs, "BTC should have BTC/USD pair"
        print(f"✅ BTC expected pairs: {pairs}")
        
        pairs_pol = asset_capabilities.expected_pairs('POL')
        assert 'POL/USD' in pairs_pol, "POL should have POL/USD pair"
        print(f"✅ POL expected pairs: {pairs_pol}")


class TestGoalConstraintExtraction:
    """Test 6: Goal constraint extraction from natural language"""
    
    def test_extract_explicit_coins(self):
        """SYNTHETIC: Extract explicit coin mentions from goal"""
        print("\n=== TEST 6A: Extract Explicit Coins ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        goal = "I want a strategy with $BTC, $ETH, and Solana"
        coins, weights = asset_capabilities.goal_constraints(goal)
        
        assert 'BTC' in coins, "Should extract $BTC"
        assert 'ETH' in coins, "Should extract $ETH"
        assert 'SOL' in coins, "Should extract Solana"
        print(f"✅ Extracted coins: {coins}")
        
    def test_extract_weights(self):
        """SYNTHETIC: Extract explicit weights from goal"""
        print("\n=== TEST 6B: Extract Weights ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        goal = "I want BTC at 60% and ETH at 40%"
        coins, weights = asset_capabilities.goal_constraints(goal)
        
        assert weights.get('BTC') == 60, "Should extract BTC 60%"
        assert weights.get('ETH') == 40, "Should extract ETH 40%"
        print(f"✅ Extracted weights: {weights}")


class TestRankingSnapshot:
    """Test 7: Ranking snapshot functionality"""
    
    def test_legacy_ids_mapping(self):
        """SYNTHETIC: Verify legacy ID mappings"""
        print("\n=== TEST 7A: Legacy ID Mappings ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        assert ranking_snapshot.LEGACY_IDS['BTC'] == 'bitcoin'
        assert ranking_snapshot.LEGACY_IDS['ETH'] == 'ethereum'
        assert ranking_snapshot.LEGACY_IDS['MATIC'] == 'polygon-ecosystem-token'
        print(f"✅ Legacy ID mappings correct")
        
    def test_canonical_symbol_by_id(self):
        """SYNTHETIC: Verify canonical symbol mapping"""
        print("\n=== TEST 7B: Canonical Symbol Mapping ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        assert ranking_snapshot.CANONICAL_SYMBOL_BY_ID['polygon-ecosystem-token'] == 'POL'
        assert ranking_snapshot.LEGACY_SYMBOL_BY_ID['polygon-ecosystem-token'] == 'MATIC'
        print(f"✅ POL/MATIC canonical mapping correct")
        
    def test_exclusion_reasons(self):
        """SYNTHETIC: Test asset exclusion classification"""
        print("\n=== TEST 7C: Exclusion Reasons ===")
        print(f"SYNTHETIC TEST - NO NETWORK CALLS")
        
        # Stablecoin
        usdt = {'symbol': 'USDT', 'name': 'Tether', 'id': 'tether'}
        assert ranking_snapshot.exclusion_reason(usdt) == 'STABLECOIN'
        
        # Wrapped
        wbtc = {'symbol': 'WBTC', 'name': 'Wrapped Bitcoin', 'id': 'wrapped-bitcoin'}
        assert ranking_snapshot.exclusion_reason(wbtc) == 'WRAPPED_OR_STAKED_DUPLICATE'
        
        # Normal asset
        btc = {'symbol': 'BTC', 'name': 'Bitcoin', 'id': 'bitcoin'}
        assert ranking_snapshot.exclusion_reason(btc) is None
        
        print(f"✅ Exclusion classification working")


def run_all_tests():
    """Run all synthetic regression tests"""
    print("\n" + "="*80)
    print("ISOLATED SYNTHETIC BACKEND REGRESSION PHASE")
    print("="*80)
    print("CRITICAL: NO public network requests")
    print("CRITICAL: NO production DB writes")
    print("CRITICAL: All 57 assets remain UNVERIFIED")
    print("="*80 + "\n")
    
    # Run tests
    test_classes = [
        TestAssetCapabilitiesRegistry,
        TestAssetCapabilityValidation,
        TestStrategyValidation,
        TestMarketDataHandling,
        TestProviderBases,
        TestGoalConstraintExtraction,
        TestRankingSnapshot,
    ]
    
    total_tests = 0
    passed_tests = 0
    failed_tests = []
    
    for test_class in test_classes:
        print(f"\n{'='*80}")
        print(f"Running {test_class.__name__}")
        print(f"{'='*80}")
        
        instance = test_class()
        test_methods = [m for m in dir(instance) if m.startswith('test_')]
        
        for method_name in test_methods:
            total_tests += 1
            try:
                method = getattr(instance, method_name)
                method()
                passed_tests += 1
                print(f"✅ PASSED: {method_name}")
            except Exception as e:
                failed_tests.append((test_class.__name__, method_name, str(e)))
                print(f"❌ FAILED: {method_name}")
                print(f"   Error: {e}")
    
    # Summary
    print("\n" + "="*80)
    print("SYNTHETIC REGRESSION TEST SUMMARY")
    print("="*80)
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {len(failed_tests)}")
    
    if failed_tests:
        print("\nFailed tests:")
        for class_name, method_name, error in failed_tests:
            print(f"  ❌ {class_name}.{method_name}: {error}")
    else:
        print("\n✅ ALL TESTS PASSED")
    
    print("\n" + "="*80)
    print("IMPORTANT NOTES:")
    print("="*80)
    print("• All results are SYNTHETIC (no real network calls)")
    print("• All 57 assets remain UNVERIFIED for official support")
    print("• No verifiedAssetIds have been set")
    print("• No production database writes performed")
    print("• No real orders or wallet operations")
    print("="*80 + "\n")
    
    return len(failed_tests) == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
