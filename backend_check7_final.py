"""
CHECK 7 FINAL FOCUSED: Assessment context + unapplied revision + authorized trade
via ACTUAL Autopilot worker (not low-level direct buy).

Requirements:
1. Temp owner with single saved+active ETH Studio strategy
2. Controlled actionable canonical BUY and fresh quote with tokenomics
3. Patch allocator to return ONE deterministic eligible BUY intent (disclosed as allocator untested)
4. Call ACTUAL _autopilot_process_account_multi (NOT patched) under PAPER_AUTOPILOT
5. Verify:
   - assessment.context.macro.source=='existing-event-calendar'
   - tokenomics ratio='40.0' (circulatingSupply=400, maxSupply=1000)
   - proposedRevision.status='SUGGESTED_NOT_APPLIED'
   - strategy version/hash unchanged
   - account cash decreases exactly once
   - lot/ledger gain one fill with strategy version/hash still preapproved
   - no v2 strategy appears
6. Re-run same obs and assert no duplicate fill
7. SECOND subcase: NO macro event but same supply -> tokenomics ALONE causes REVIEW_WEIGHT

Constraints:
- NO real Gemini/CoinGecko/HTTP/provider calls
- NO existing credentials/owners
- NO frontend/browser/screenshots
- NO product code edit
- Patch external calls fail-closed
- Clean ONLY temp owner records with read-back
"""
import os
import sys
import uuid
import datetime
from decimal import Decimal

# Enable paper execution
os.environ['PAPER_EXECUTION_ENABLED'] = 'true'
os.environ['PAPER_AUTOPILOT_ENABLED'] = 'true'

sys.path.insert(0, '/app/backend')
import server
from albert.paper import core as _paper_core
from albert.engine.hashing import short_hash as _studio_short_hash
from config import order_ledger_col

# Collections
paper_accounts_col = server.paper_accounts_col
strategy_contracts_col = server.strategy_contracts_col
strategy_decision_snapshots_col = server.strategy_decision_snapshots_col
runs_col = server.runs_col
mandate_col = server.mandate_col

def cleanup_temp_owner(owner_id):
    """Clean up all temp owner data with read-back verification."""
    print(f"\n🧹 CLEANUP: Deleting temp owner {owner_id} from all collections...")
    
    collections = [
        ('paper_accounts_col', server.paper_accounts_col),
        ('strategy_contracts_col', server.strategy_contracts_col),
        ('strategy_decision_snapshots_col', server.strategy_decision_snapshots_col),
        ('mandate_col', server.mandate_col),
        ('order_ledger_col', order_ledger_col),
    ]
    
    total_deleted = 0
    for name, col in collections:
        result = col.delete_many({'ownerId': owner_id})
        if result.deleted_count > 0:
            print(f"  • {name}: deleted {result.deleted_count} docs")
            total_deleted += result.deleted_count
    
    print(f"✅ Total deleted: {total_deleted} documents")
    
    # Read-back verification
    print("\n🔍 READ-BACK VERIFICATION:")
    for name, col in collections:
        count = col.count_documents({'ownerId': owner_id})
        if count > 0:
            print(f"  ❌ {name}: {count} docs still exist!")
        else:
            print(f"  ✅ {name}: clean")
    
    print("✅ Cleanup complete with read-back verification\n")


def test_check7_final():
    """
    CHECK 7 FINAL: Assessment context + unapplied revision + authorized trade
    via ACTUAL Autopilot worker.
    """
    print("\n" + "="*80)
    print("CHECK 7 FINAL: Assessment Context + Unapplied Revision + Authorized Trade")
    print("="*80)
    
    # Generate temp owner
    owner_id = f"temp_check7_final_{uuid.uuid4().hex[:8]}"
    account_id = f"pa_check7_final_{uuid.uuid4().hex[:8]}"
    strategy_id = f"strat_check7_final_{uuid.uuid4().hex[:8]}"
    
    print(f"\n📋 SETUP:")
    print(f"  • Owner: {owner_id}")
    print(f"  • Account: {account_id}")
    print(f"  • Strategy: {strategy_id}")
    
    # Initialize variables for finally block
    original_runs_find_one = None
    original_canonical_decisions = None
    original_mark = None
    original_live_ranks = None
    original_allocate = None
    original_notify = None
    
    try:
        # 1. Create mandate
        print("\n1️⃣ Creating mandate...")
        server.mandate_col.insert_one({
            '_id': owner_id,
            'ownerId': owner_id,
            'approved_coins': [],
            'excluded_coins': [],
            'max_drawdown_pct': 30,
            'max_alloc_pct': {'ETH': 50},
            'updatedAt': datetime.datetime.utcnow().isoformat()
        })
        print("  ✅ Mandate created")
        
        # 2. Create ETH Studio strategy (saved + active)
        print("\n2️⃣ Creating ETH Studio strategy (saved + active)...")
        contract = {
            'name': 'ETH Strategy',
            'assets': [{'symbol': 'ETH', 'weightPct': 100}],
            'reservePct': 20,
            'riskLimits': {'maxPositions': 5},
            'rules': [],  # No additional rules, rely on canonical BUY
            'timeframe': 'paper cycle',
            'entryRules': 'CANONICAL_BUY_ONLY',
            'exitRules': 'CANONICAL_SELL_OR_INVALIDATION',
            'profitTaking': 'CANONICAL_SELL_ONLY',
            'invalidation': 'CANONICAL_INVALIDATION_ONLY',
            'sizing': 'MAX_REVIEWED_ASSET_WEIGHT',
            'entrySignal': 'canonical',
            'exitSignal': 'canonical',
            'positionSizing': 'reviewed weight'
        }
        contract_hash = _studio_short_hash(contract)
        
        strategy_doc = {
            '_id': f"{strategy_id}_v1",
            'strategyId': strategy_id,
            'ownerId': owner_id,
            'version': 1,
            'latest': True,
            'contract': contract,
            'contractHash': contract_hash,
            'status': 'PAPER_ACTIVE',
            'assignedPaperAccountId': account_id,
            'createdAt': datetime.datetime.utcnow().isoformat(),
            'updatedAt': datetime.datetime.utcnow().isoformat()
        }
        strategy_contracts_col.insert_one(strategy_doc)
        print(f"  ✅ Strategy created: version=1, hash={contract_hash[:16]}..., latest=True, status=PAPER_ACTIVE")
        
        # 3. Create paper account with strategy assigned
        print("\n3️⃣ Creating paper account with strategy assigned...")
        econ = _paper_core.new_account_economics(Decimal('10000'), Decimal('0'))  # No account-level reserve, use strategy reserve
        account_doc = {
            'paperAccountId': account_id,
            'ownerId': owner_id,
            'name': 'Check7 Account',
            'baseCurrency': 'USDC',
            'mode': 'PAPER_AUTOPILOT',
            'runtimeState': 'RUNNING',
            'strategyId': strategy_id,
            'strategyVersion': 1,
            'mandateVersion': 0,
            'version': 0,
            'archivedAt': None,
            'createdAt': datetime.datetime.utcnow().isoformat(),
            **econ
        }
        paper_accounts_col.insert_one(account_doc)
        acct = paper_accounts_col.find_one({'paperAccountId': account_id})
        print(f"  ✅ Account created: cash=${_paper_core.dstr(acct['cash'])}, mode=PAPER_AUTOPILOT, state=RUNNING")
        
        # 4. Prepare controlled inputs
        print("\n4️⃣ Preparing controlled inputs...")
        
        # Synthetic macro event (current-day High)
        today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
        synthetic_run = {
            'created_at': datetime.datetime.utcnow(),
            'event_calendar': {
                'generated': today,
                'events': [
                    {
                        'title': 'Federal Reserve Interest Rate Decision',
                        'category': 'Macro',
                        'importance': 'Very High',
                        'days_until': 2
                    }
                ]
            }
        }
        
        # Controlled canonical BUY decision
        decision_snapshot_id = f"snap_check7_{uuid.uuid4().hex[:8]}"
        canonical_decision = {
            'asset': 'ETH',
            'action': 'BUY',
            'actionable': True,
            'eligible': True,
            'fresh': True,
            'decisionSnapshotId': decision_snapshot_id,
            'decisionId': 'dec_check7',
            'decisionInputsHash': 'hash_check7',
            'engineVersion': 'albert-decide-v2',
            'mandateVersion': 'mv1',
            'score': 75,
            'confidence': 0.8,
            'invalidationPrice': '1500',
            'currentPrice': '2000',
            'recommendedDeployNowUsd': '2000',
            'mandateChecks': {
                'excluded': False,
                'inApprovedUniverse': True,
                'withinCap': True,
                'withinRiskBudget': True,
                'mandateComplete': True
            },
            'decisionTime': datetime.datetime.utcnow().isoformat()
        }
        
        # Fresh ETH quote with tokenomics (circulatingSupply=400, maxSupply=1000 -> 40%)
        obs_id = f"obs_check7_{uuid.uuid4().hex[:8]}"
        eth_observation = {
            'obsId': obs_id,
            'ts': datetime.datetime.utcnow().isoformat(),
            'tokenomics': {
                'assetId': 'ethereum',
                'circulatingSupply': '400',
                'maxSupply': '1000',
                'asOf': datetime.datetime.utcnow().isoformat()
            },
            'execution': {'venue': 'test'}
        }
        
        print(f"  ✅ Synthetic macro event: '{synthetic_run['event_calendar']['events'][0]['title']}' in 2 days")
        print(f"  ✅ Canonical BUY: ETH, actionable=True, eligible=True, fresh=True")
        print(f"  ✅ ETH quote: $2000, fresh=True, obsId={obs_id[:16]}...")
        print(f"  ✅ Tokenomics: circulatingSupply=400, maxSupply=1000 (40.0%)")
        
        # 5. Patch external dependencies
        print("\n5️⃣ Patching external dependencies...")
        
        original_runs_find_one = runs_col.find_one
        original_canonical_decisions = server._paper_canonical_decisions
        original_mark = server._paper_mark
        original_live_ranks = server._paper_live_ranks
        original_allocate = server._paper_portfolio.allocate
        original_notify = server._autopilot_notify
        
        def patched_runs_find_one(*args, **kwargs):
            """Return synthetic macro event."""
            return synthetic_run
        
        def patched_canonical_decisions(pid, **kwargs):
            """Return controlled ETH BUY decision."""
            return [canonical_decision]
        
        def patched_mark(sym):
            """Return fresh ETH quote with tokenomics."""
            if sym == 'ETH':
                return (Decimal('2000'), True, eth_observation)
            return (None, False, {})
        
        def patched_live_ranks():
            """Return controlled rank metadata."""
            ranks = {
                'ETH': {
                    'rank': 2,
                    'source': 'test',
                    'snapshotId': 'snap_test',
                    'observedAt': datetime.datetime.utcnow().isoformat(),
                    'fresh': True
                }
            }
            meta = {
                'available': True,
                'fresh': True,
                'source': 'test',
                'snapshotId': 'snap_test',
                'observedAt': datetime.datetime.utcnow().isoformat(),
                'top10': 10,
                'top50': 50
            }
            return (ranks, meta)
        
        def patched_allocate(acct, equity_info, candidates, regime, marks, holding_scores):
            """
            Return ONE deterministic eligible BUY intent.
            DISCLOSED: Allocator logic is NOT tested in this check.
            """
            # Return a single ETH BUY intent with $2000 notional
            if candidates and candidates[0]['symbol'] == 'ETH' and candidates[0]['action'] == 'BUY':
                return {
                    'intents': [{
                        'symbol': 'ETH',
                        'action': 'BUY',
                        'notional': Decimal('2000'),
                        'reason': 'canonical'
                    }],
                    'trace': ['Controlled allocator: ONE ETH BUY intent']
                }
            return {'intents': [], 'trace': []}
        
        def patched_notify(pid, acct_id, title, msg, severity='info'):
            """No-op notification (temp-owner-safe)."""
            pass
        
        # Apply patches
        runs_col.find_one = patched_runs_find_one
        server._paper_canonical_decisions = patched_canonical_decisions
        server._paper_mark = patched_mark
        server._paper_live_ranks = patched_live_ranks
        server._paper_portfolio.allocate = patched_allocate
        server._autopilot_notify = patched_notify
        
        print("  ✅ Patched: runs_col.find_one (synthetic macro event)")
        print("  ✅ Patched: _paper_canonical_decisions (controlled ETH BUY)")
        print("  ✅ Patched: _paper_mark (fresh ETH quote + tokenomics)")
        print("  ✅ Patched: _paper_live_ranks (controlled ranks)")
        print("  ✅ Patched: _paper_portfolio.allocate (ONE deterministic BUY intent - ALLOCATOR UNTESTED)")
        print("  ✅ Patched: _autopilot_notify (no-op)")
        
        # 6. FIRST RUN: Call ACTUAL _autopilot_process_account_multi
        print("\n6️⃣ FIRST RUN: Calling ACTUAL _autopilot_process_account_multi...")
        
        acct_before = paper_accounts_col.find_one({'paperAccountId': account_id})
        cash_before = _paper_core.D(acct_before['cash'])
        lots_before = len(acct_before.get('lots') or [])
        ledger_before = len([e for e in acct_before.get('ledger') or [] if e.get('side')])
        
        print(f"  📊 BEFORE: cash=${_paper_core.dstr(cash_before)}, lots={lots_before}, ledger={ledger_before}")
        
        # Call ACTUAL worker (NOT patched)
        server._autopilot_process_account_multi(acct_before)
        
        acct_after = paper_accounts_col.find_one({'paperAccountId': account_id})
        cash_after = _paper_core.D(acct_after['cash'])
        lots_after = len(acct_after.get('lots') or [])
        ledger_after = len([e for e in acct_after.get('ledger') or [] if e.get('side')])
        
        print(f"  📊 AFTER: cash=${_paper_core.dstr(cash_after)}, lots={lots_after}, ledger={ledger_after}")
        
        # 7. Verify assessment context
        print("\n7️⃣ VERIFYING ASSESSMENT CONTEXT...")
        
        assessment = acct_after.get('strategyAssessment')
        assert assessment is not None, "❌ No strategyAssessment found"
        print(f"  ✅ Assessment exists: at={assessment.get('at')}")
        print(f"  📊 Assessment state: {assessment.get('state')}")
        
        # Debug: print conditions
        conditions = assessment.get('conditions', [])
        for cond in conditions:
            print(f"  📊 Condition {cond.get('symbol')}: state={cond.get('state')}, reason={cond.get('reason')}")
        
        context = assessment.get('context')
        assert context is not None, "❌ No context in assessment"
        
        # Verify macro event
        macro = context.get('macro')
        assert macro is not None, "❌ No macro in context"
        assert macro.get('source') == 'existing-event-calendar', f"❌ macro.source={macro.get('source')}, expected 'existing-event-calendar'"
        print(f"  ✅ macro.source='existing-event-calendar'")
        print(f"  ✅ macro.title='{macro.get('title')}'")
        print(f"  ✅ macro.daysUntil={macro.get('daysUntil')}")
        
        # Verify tokenomics
        tokenomics = context.get('tokenomics')
        assert tokenomics is not None and len(tokenomics) > 0, "❌ No tokenomics in context"
        eth_token = next((t for t in tokenomics if t.get('symbol') == 'ETH'), None)
        assert eth_token is not None, "❌ No ETH tokenomics found"
        assert eth_token.get('circulatingPctOfMax') == '40.0', f"❌ circulatingPctOfMax={eth_token.get('circulatingPctOfMax')}, expected '40.0'"
        print(f"  ✅ tokenomics: ETH circulatingPctOfMax='40.0'")
        print(f"  ✅ tokenomics: assetId='{eth_token.get('assetId')}'")
        
        # Verify proposedRevision
        proposed = context.get('proposedRevision')
        assert proposed is not None, "❌ No proposedRevision in context"
        assert proposed.get('status') == 'SUGGESTED_NOT_APPLIED', f"❌ proposedRevision.status={proposed.get('status')}, expected 'SUGGESTED_NOT_APPLIED'"
        print(f"  ✅ proposedRevision.status='SUGGESTED_NOT_APPLIED'")
        print(f"  ✅ proposedRevision.type='{proposed.get('type')}'")
        print(f"  ✅ proposedRevision.reason='{proposed.get('reason')[:80]}...'")
        
        # 8. Verify strategy unchanged
        print("\n8️⃣ VERIFYING STRATEGY UNCHANGED...")
        
        assert assessment.get('strategyVersion') == 1, f"❌ strategyVersion={assessment.get('strategyVersion')}, expected 1"
        assert assessment.get('contractHash') == contract_hash, f"❌ contractHash mismatch"
        print(f"  ✅ strategyVersion=1 (unchanged)")
        print(f"  ✅ contractHash={contract_hash[:16]}... (unchanged)")
        
        # Verify no v2 strategy created
        v2_count = strategy_contracts_col.count_documents({'strategyId': strategy_id, 'version': 2})
        assert v2_count == 0, f"❌ Found {v2_count} v2 strategies, expected 0"
        print(f"  ✅ No v2 strategy created")
        
        # 9. Verify trade execution
        print("\n9️⃣ VERIFYING TRADE EXECUTION...")
        
        cash_change = cash_after - cash_before
        lots_change = lots_after - lots_before
        ledger_change = ledger_after - ledger_before
        
        print(f"  📊 Cash change: ${_paper_core.dstr(cash_change)}")
        print(f"  📊 Lots change: {lots_change}")
        print(f"  📊 Ledger change: {ledger_change}")
        
        assert cash_change < 0, f"❌ Cash should decrease, but changed by ${_paper_core.dstr(cash_change)}"
        assert lots_change == 1, f"❌ Expected 1 new lot, got {lots_change}"
        assert ledger_change == 1, f"❌ Expected 1 new ledger entry, got {ledger_change}"
        print(f"  ✅ Cash decreased by ${_paper_core.dstr(-cash_change)}")
        print(f"  ✅ Gained 1 lot")
        print(f"  ✅ Gained 1 ledger entry")
        
        # Verify lot has strategy version/hash
        eth_lot = next((l for l in acct_after.get('lots') or [] if l.get('asset') == 'ETH'), None)
        assert eth_lot is not None, "❌ No ETH lot found"
        assert eth_lot.get('strategyVersion') == 1, f"❌ lot.strategyVersion={eth_lot.get('strategyVersion')}, expected 1"
        assert eth_lot.get('strategyHash') == contract_hash, f"❌ lot.strategyHash mismatch"
        print(f"  ✅ Lot has strategyVersion=1, strategyHash={contract_hash[:16]}...")
        
        # Verify ledger entry has strategy version/hash
        ledger_entry = [e for e in acct_after.get('ledger') or [] if e.get('side') == 'BUY'][-1]
        assert ledger_entry.get('strategyVersion') == 1, f"❌ ledger.strategyVersion={ledger_entry.get('strategyVersion')}, expected 1"
        assert ledger_entry.get('strategyHash') == contract_hash, f"❌ ledger.strategyHash mismatch"
        print(f"  ✅ Ledger entry has strategyVersion=1, strategyHash={contract_hash[:16]}...")
        
        # 10. RE-RUN: Verify no duplicate fill
        print("\n🔁 RE-RUN: Verifying no duplicate fill...")
        
        acct_rerun_before = paper_accounts_col.find_one({'paperAccountId': account_id})
        cash_rerun_before = _paper_core.D(acct_rerun_before['cash'])
        ledger_rerun_before = len([e for e in acct_rerun_before.get('ledger') or [] if e.get('side')])
        
        # Call worker again with SAME observation
        server._autopilot_process_account_multi(acct_rerun_before)
        
        acct_rerun_after = paper_accounts_col.find_one({'paperAccountId': account_id})
        cash_rerun_after = _paper_core.D(acct_rerun_after['cash'])
        ledger_rerun_after = len([e for e in acct_rerun_after.get('ledger') or [] if e.get('side')])
        
        assert cash_rerun_after == cash_rerun_before, f"❌ Cash changed on re-run: ${_paper_core.dstr(cash_rerun_before)} -> ${_paper_core.dstr(cash_rerun_after)}"
        assert ledger_rerun_after == ledger_rerun_before, f"❌ Ledger changed on re-run: {ledger_rerun_before} -> {ledger_rerun_after}"
        print(f"  ✅ No duplicate fill: cash=${_paper_core.dstr(cash_rerun_after)}, ledger={ledger_rerun_after}")
        
        # 11. SECOND SUBCASE: Tokenomics alone causes REVIEW_WEIGHT
        print("\n" + "="*80)
        print("SECOND SUBCASE: Tokenomics alone causes REVIEW_WEIGHT")
        print("="*80)
        
        # Patch runs_col.find_one to return NO macro event
        def patched_runs_no_macro(*args, **kwargs):
            """Return run with NO macro event."""
            return {
                'created_at': datetime.datetime.utcnow(),
                'event_calendar': {
                    'generated': '2020-01-01',  # Old date, no current events
                    'events': []
                }
            }
        
        runs_col.find_one = patched_runs_no_macro
        print("  ✅ Patched: runs_col.find_one (NO macro event)")
        
        # Call _studio_assessment_context directly
        print("\n🔍 Calling _studio_assessment_context with NO macro event but same tokenomics...")
        
        strat = strategy_contracts_col.find_one({'strategyId': strategy_id, 'version': 1})
        observations = {'ETH': eth_observation}
        
        context_no_macro = server._studio_assessment_context(strat, observations)
        
        print(f"\n📊 CONTEXT (NO MACRO):")
        print(f"  • macro: {context_no_macro.get('macro')}")
        print(f"  • tokenomics: {context_no_macro.get('tokenomics')}")
        print(f"  • proposedRevision: {context_no_macro.get('proposedRevision')}")
        
        # Verify NO macro
        assert context_no_macro.get('macro') is None, f"❌ Expected no macro, got {context_no_macro.get('macro')}"
        print(f"  ✅ No macro event in context")
        
        # Verify tokenomics still present
        tokenomics_no_macro = context_no_macro.get('tokenomics')
        assert tokenomics_no_macro is not None and len(tokenomics_no_macro) > 0, "❌ No tokenomics in context"
        eth_token_no_macro = next((t for t in tokenomics_no_macro if t.get('symbol') == 'ETH'), None)
        assert eth_token_no_macro is not None, "❌ No ETH tokenomics found"
        assert eth_token_no_macro.get('circulatingPctOfMax') == '40.0', f"❌ circulatingPctOfMax={eth_token_no_macro.get('circulatingPctOfMax')}, expected '40.0'"
        print(f"  ✅ Tokenomics: ETH circulatingPctOfMax='40.0'")
        
        # Verify proposedRevision is REVIEW_WEIGHT (not REVIEW_RESERVE)
        proposed_no_macro = context_no_macro.get('proposedRevision')
        assert proposed_no_macro is not None, "❌ No proposedRevision in context"
        assert proposed_no_macro.get('type') == 'REVIEW_WEIGHT', f"❌ proposedRevision.type={proposed_no_macro.get('type')}, expected 'REVIEW_WEIGHT'"
        assert proposed_no_macro.get('status') == 'SUGGESTED_NOT_APPLIED', f"❌ proposedRevision.status={proposed_no_macro.get('status')}, expected 'SUGGESTED_NOT_APPLIED'"
        assert proposed_no_macro.get('symbol') == 'ETH', f"❌ proposedRevision.symbol={proposed_no_macro.get('symbol')}, expected 'ETH'"
        print(f"  ✅ proposedRevision.type='REVIEW_WEIGHT' (tokenomics alone)")
        print(f"  ✅ proposedRevision.status='SUGGESTED_NOT_APPLIED'")
        print(f"  ✅ proposedRevision.symbol='ETH'")
        print(f"  ✅ proposedRevision.reason='{proposed_no_macro.get('reason')[:80]}...'")
        
        # Verify no contract or rule mutation
        strat_after = strategy_contracts_col.find_one({'strategyId': strategy_id, 'version': 1})
        assert strat_after['contract'] == contract, "❌ Contract was mutated"
        assert strat_after['contractHash'] == contract_hash, "❌ Contract hash changed"
        print(f"  ✅ No contract mutation")
        print(f"  ✅ No rule mutation")
        
        print("\n" + "="*80)
        print("✅ CHECK 7 FINAL: PASS")
        print("="*80)
        print("\nKEY VALIDATIONS:")
        print("  ✅ Assessment context with synthetic macro event calendar verified")
        print("  ✅ Tokenomics ratio='40.0' (circulatingSupply=400, maxSupply=1000)")
        print("  ✅ proposedRevision.status='SUGGESTED_NOT_APPLIED' (macro event)")
        print("  ✅ Strategy version/hash unchanged before and after assessment")
        print("  ✅ Account cash decreased exactly once (no duplicate fill)")
        print("  ✅ Lot/ledger gained one fill with strategy version/hash still preapproved")
        print("  ✅ No v2 strategy created")
        print("  ✅ Re-run with same observation: no duplicate fill")
        print("  ✅ SECOND SUBCASE: Tokenomics alone causes REVIEW_WEIGHT")
        print("  ✅ SECOND SUBCASE: proposedRevision.status='SUGGESTED_NOT_APPLIED'")
        print("  ✅ SECOND SUBCASE: No contract or rule mutation")
        print("\nDISCLOSURES:")
        print("  ⚠️  Allocator logic NOT tested (patched to return ONE deterministic BUY intent)")
        print("  ⚠️  _paper_canonical_decisions patched (controlled ETH BUY)")
        print("  ⚠️  _paper_mark patched (fresh ETH quote + tokenomics)")
        print("  ⚠️  _paper_live_ranks patched (controlled ranks)")
        print("  ⚠️  _autopilot_notify patched (no-op)")
        print("\nCONSTRAINTS HONORED:")
        print("  ✅ NO real Gemini API calls")
        print("  ✅ NO real CoinGecko API calls (synthetic tokenomics data)")
        print("  ✅ NO real CCXT exchange calls")
        print("  ✅ NO real HTTP calls")
        print("  ✅ NO use of existing credentials")
        print("  ✅ NO modification of application code")
        print("  ✅ NO frontend tests, browser automation, or screenshots")
        
    except AssertionError as e:
        print(f"\n❌ ASSERTION FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Restore original functions
        print("\n🔄 Restoring original functions...")
        if original_runs_find_one:
            runs_col.find_one = original_runs_find_one
        if original_canonical_decisions:
            server._paper_canonical_decisions = original_canonical_decisions
        if original_mark:
            server._paper_mark = original_mark
        if original_live_ranks:
            server._paper_live_ranks = original_live_ranks
        if original_allocate:
            server._paper_portfolio.allocate = original_allocate
        if original_notify:
            server._autopilot_notify = original_notify
        print("  ✅ Original functions restored")
        
        # Cleanup
        cleanup_temp_owner(owner_id)


if __name__ == '__main__':
    test_check7_final()
