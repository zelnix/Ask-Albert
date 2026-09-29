# Albert refresh repair — 29 September 2026

## Ownership

Codex owns the trace, refresh plumbing, status UI, and verification (original steps 1–5 and 7). The developer owns the engine repairs below (step 6) and deployment to the Emergent preview. The developer should implement and deploy these repairs, then return the commit and preview URL. Codex will run the targeted checks and UAT; do not commission another developer checking or testing round.

## Confirmed findings

Inspected base commit: `9e5c33845d7ffa2209305f848793085ecafe3a5f`.

- The dashboard and current Ask Albert workspace POST to `/api/v1/albert/ask`. That handler did not call `request_analysis`, although its model prompt advertised refresh capability. Only the older `/api/v1/chat` handler dispatched refreshes.
- Legacy IDs (`aj:scope:symbols`) overwrote previous runs and deduplicated across owners. Status reads did not check the requesting owner.
- `_run_analysis_job` marked the whole run completed after subtask errors. Its background callees also caught exceptions or returned early without reporting outcomes, so even the subtask success labels were unreliable.
- The legacy `full` scope invoked `_strategy_eval_job` across all active owners. That worker mutates targets, positions and strategy state. It is inappropriate for an analysis-only request.
- Evidence & Engines read Prediction Ledger and Data Audit from the old daily dashboard snapshot. A live audit endpoint and current scorecard endpoint already exist.
- Scenario `lastEvaluatedAt` is the last historical sample in the evaluation. Alert `ts` is an alert event timestamp. Neither is a worker execution timestamp. The earlier UI evidence did not establish that those two engines stopped on those dates.
- The live preview baseline on 29 September showed the 7 September core snapshot. A fresh request through the dashboard at approximately 13:50 AWST returned “I cannot reach the evidence service right now” and no run ID. The precise runtime cause of that response is not established; production logs were not available.

## Implemented in this branch

- Both chat routes dispatch explicit refresh requests before a Gemini call. Model text cannot start jobs or establish completion. Status follow-ups read the owner’s real run record.
- New unique run IDs, retained run history, timestamps, owner checks, equivalent-request joining, a dedicated refresh executor, and Mongo leases shared by scheduled and manual feed/snapshot calls.
- Explicit succeeded/partial/failed/skipped/busy outcomes. Missing callback evidence fails. Interrupted or expired queued runs cannot later masquerade as successful work.
- Reuses the existing market-feed, news, snapshot, and live audit functions. The strategy step recomputes only the signed-in owner’s read-only assessment.
- The three missing engine adapters remain visible as **Not run**, with reasons. A full refresh cannot be reported as wholly successful while those gaps remain.
- Status polling in dashboard chat, current Ask Albert, legacy chat, and Evidence & Engines. Run IDs and per-step timing sit under “Refresh details.” A manual full-refresh button is available in Evidence & Engines.
- Execution timestamps are separate from observations and publication dates. Missing observation times say “Not confirmed.” Existing source dates are not replaced with the current clock.
- Evidence & Engines reads the live audit and scorecard. Scenario and alert dates have accurate labels.

## Developer changes — step 6

Work in `backend/server.py`, using the existing engine functions and the new `AnalysisJobs` tracker. Keep one implementation of each engine.

### 1. Prediction Ledger and the old core snapshot

`compute()` currently groups model training, prediction recording, grading, data audit and dashboard publication. The lightweight five-minute job does not update that daily run document. `resolve_predictions()` and `compute_scorecard()` already exist independently.

- Create a synchronous grading work function that obtains current **closed** candle observations, calls `resolve_predictions(close_by_date, latest_date)`, then publishes the current scorecard with an explicit completion outcome and the actual latest candle date.
- Replace the `prediction_ledger` skipped callback in `_analysis_steps` with that work function. Use the same work function for the appropriate scheduled grading run.
- A successful run with no newly matured forecasts must say so and keep the existing forecast count. Do not seed backtest records or invent fresh forecasts to move a timestamp.
- Separate current deterministic data refresh/publication from expensive model training. Connect refreshable core inputs to the existing lightweight cycle. Keep training on its own schedule or explicit retrain action.
- Correct any scheduler/worker exception that has prevented the daily core snapshot from advancing. Preserve the failed attempt and error rather than copying a recent read time onto the 7 September model output.

### 2. Scenario Evaluation

The existing v1 path uses `_scenario_eval_start`, `_scenario_eval_bg`, daily keys and `$setOnInsert`. A completed **failed** row blocks another attempt that day. V2 has its own history/data-hash evaluation path.

- Add a synchronous work adapter for the registered provider/version, asset and horizon. Obtain the current canonical history, run that provider’s evaluation, and return its real outcome after publication.
- Replace the `scenario_evaluation` skipped callback. Reuse the same tracked work path for scheduled/prewarm execution; retain the provider’s canonical history hash, model version and evaluation key.
- Allow an explicitly requested retry after a failed evaluation. Preserve the earlier run’s failure record.
- Publish `computedAt`/completion separately from `lastEvaluatedAt` (historical sample end) and source-history observation time. A repeat run may legitimately produce identical values.
- Preserve the existing calibration/predictive-validation rules and “Historical scenario range” wording. A new run must not upgrade validation without the required measured result.

### 3. Alert Engine

`_alert_engine_job()` scans the watchlist but returns no scan outcome, and catches per-symbol errors. The evidence snapshot warmer is a different function; rebuilding that snapshot does not establish that the alert scanner ran.

- Extract a synchronous scan work function that returns successful scan count, failed symbols, actual candle observation times and newly emitted alert count.
- Treat **zero new alerts after successful scans** as a successful run. Treat a disabled engine as skipped with a reason. Report partial/all-symbol failures explicitly.
- Replace the `alert_engine` skipped callback with this function. Route the hourly scheduled scanner through `_analysis_jobs.execute_engine('alert_engine', work)`; pass the raw work function to `_analysis_steps` to avoid acquiring the same lock twice.
- Preserve existing alert deduplication. Maintain `lastSuccessfulAt` independently from the timestamp of the newest alert event.

### 4. Data Audit source truth

The refresh now runs the existing live audit and the screen now displays it. Its source-health logic still needs these corrections:

- In `compute_data_health`, remove the assumption `core_iso = core_iso or now_iso` for a missing core run.
- A missing/unparseable source timestamp must not become `live` with confidence 95. Report unknown freshness and keep it out of any calculation that would treat missing evidence as healthy.
- Use per-feed source observation and cache-fetch times independently. A successful audit means the audit ran; it does not mean every underlying feed is fresh.
- Publish refreshed core data through the separated deterministic path from item 1, so the audit can correctly report which inputs remain old or unavailable.

### Adapter contract

Each work function returns a dictionary after its work and publication complete:

```python
{
    'status': 'succeeded',  # or partial, failed, skipped
    'message': 'Plain explanation of what happened.',
    'dataObservedAt': actual_source_time_or_none,
    'publishedAt': actual_output_publication_time_or_none,
}
```

Let `AnalysisJobs` record start/finish/last-success times. Do not call the all-owner strategy mutation worker, paper autopilot, or order execution from a refresh. Do not substitute a wrapper returning normally for evidence that the engine succeeded.

## Verification owned by Codex — step 7

### Completed locally

- 34 targeted tests pass in `backend/tests/test_analysis_refresh.py`.
- Tests execute the actual `/albert/ask`, `/chat`, and refresh route bodies in an isolated FastAPI harness, using an in-memory Mongo implementation and controlled work functions. They cover model-independent dispatch, unique IDs, duplicate joining, shared execution locks, cross-owner denial, partial/failed/skipped runs, interrupted queues, submission failure, invalid input, and status follow-ups.
- Python compile checks and `git diff --check` pass.
- All six changed frontend files pass Next’s Babel parser.
- The production `yarn build` completes successfully, including compilation, type/lint checks and static page generation.

These are isolated tests, not a claim that production Mongo, live providers, or deployed engines have been verified. The changes are not deployed to the Emergent preview. Deployment and the live completion/failure check remain pending.

### After the developer’s repairs are deployed

Codex will submit one full refresh through dashboard Albert and one through the main Ask workspace, record the actual run IDs, inspect per-engine results and source dates, and verify the displayed final status. Codex will also exercise a controlled failure and duplicate request in a test environment, check no trade/strategy mutation was caused by the refresh, and confirm a page reload restores the recorded run. An unchanged historical result is acceptable when the tracked engine really completed on identified inputs.

No successful live refresh is claimed until that run evidence exists.

## Delivery status

The repair is committed locally on `fix/albert-refresh-tracking`. Direct push lacked credentials; the connected GitHub integration rejected the write with HTTP 403, “Resource not accessible by integration.” No remote branch, PR, merge or deployment was created. The delivery archive contains the exact Git patch and this handoff. Apply the patch on base commit `9e5c33845d7ffa2209305f848793085ecafe3a5f` or integrate it into the developer’s current branch, then complete step 6 and deploy for Codex’s live verification.
