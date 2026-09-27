# Production RCA — "Ask Albert" chat returns "Network error — please try again"

**Deployment:** quant-features (custom domain: askalbert.app / www.askalbert.app, both verified)
**Active run:** 2fda4dcc-4a77-41a1-b63f-bbfea42b87f1 (status: success) — cluster target-8, tier_0
**Template:** nextjs_mongo_shadcn_base_image, BUT deployed as a **hybrid**: Next.js standalone (:3000) + FastAPI backend (:8001) under supervisor. Entrypoint log: `=== Starting quant-features (Next.js standalone :3000 + FastAPI :8001) ===`.

## Symptom
Floating "Ask Albert" chat panel: every assistant reply (across 3 different messages + Retry) renders exactly `Network error — please try again`. Page itself renders fine with live data.

## Live chat request path
Browser → ingress (askalbert.app) → pod → **FastAPI :8001**. Chat endpoints observed in logs:
- `PUT /api/v1/albert/chat` (send message) → **200 OK** when pod healthy
- `GET /api/v1/albert/chat?pid=...&threadId=...` (history) → 200 OK
- `GET /api/v1/albert/chat/threads?pid=...` → 200 OK
The Gemini call runs in this path — log shows the AFC warning: *"Direct use of automatic function calling (AFC) in Models.generate_content is not recommended..."* interleaved with the chat traffic.

## What is NOT the cause (ruled out with evidence)
- **Not the chat endpoint logic / not a 5xx:** `PUT /api/v1/albert/chat` logs 200 OK repeatedly; no 500/502/503 on the chat path.
- **Not CORS / wrong base URL / custom-domain routing:** the light GET endpoints that populate the dashboard (`/api/v1/dashboard`, `/api/v1/ticker`, `/api/v1/orderflow`, `/api/v1/alerts`, `/api/v1/albert/notifications`) all return 200 and the page renders with live data on the SAME origin. A base-URL/CORS misconfig would break *every* `/api` call from askalbert.app, not just chat. Only the memory-heavy chat path fails.
- **Not the database:** MONGO_URL present; `list_collections` returns 62 collections incl. `albert_chat`, `ask_quant_chat` — DB bound and available.
- **Not a missing key:** `GEMINI_API_KEY` present and non-empty (also `EMERGENT_LLM_KEY` present). Presence only checked; value not revealed.
- **Not the old 520:** custom domain resolves/links (`check_domain_status`: both linked; health probe 200). Prior 520 no longer reproduces.

## Root cause (production-specific): tier_0 memory exhaustion → OOMKill/restart → transport-level failure
`get_pod_events` for the active run:
- Container `last_termination`: **OOMKilled, exit_code 137**, restarts=**1**, finished_at 2026-09-27T07:41:14Z.
- Startup probe failures during the restart: `Get "http://10.x:3000/": connect: connection refused` and `context deadline exceeded` — the pod is **unreachable for ~30–40s** while Next.js + FastAPI reboot.

`get_tier`: tier_0 "Starter" = memory request **200Mi / hard limit 512Mi**, CPU 50m/250m, 2 replicas, no HPA — on a **1.3GB** image running, in ONE 512Mi container:
- FastAPI ML compute (5-fold cross-validation, feature importances)
- `_paper_autopilot_worker` firing every 60s and **overlapping** ("Execution of job _paper_autopilot_worker ... skipped: maximum number of running instances reached (1)")
- Scenario computations calling Yahoo Finance (many `urllib.error.HTTPError: HTTP Error 429: Too Many Requests` from `server.py:744 fetch_yahoo_series` / `server.py:362 _http_json` / `server.py:19106 _scenario_long_closes`)
- Next.js standalone server
- **Gemini chat via AFC generate_content** — the heaviest per-request path

### Failure chain
1. The pod already runs hot against the 512Mi ceiling from background compute (paper-autopilot + scenario/ML).
2. A chat message invokes Gemini `generate_content` with automatic function calling (AFC) — a memory-heavy burst — tipping the container over 512Mi.
3. Kernel OOMKills the container (exit 137). Any in-flight chat request is severed → the browser `fetch()` rejects at the transport layer → the UI's catch block renders `Network error — please try again` (a client transport failure, NOT a server JSON error).
4. The container restarts; startup probe fails (`connection refused` on :3000) for ~30–40s → the pod is unreachable → the user's Retry and subsequent messages land in the same restart window and fail identically → three consecutive "Network error" bubbles.
This also explains why only chat fails while the dashboard's light GET calls succeed: chat is the one endpoint whose per-request memory burst trips (and coincides with) the OOM.

## Confidence / what was verified vs inferred
- **Verified:** OOMKilled exit 137 + restart + startup-probe unreachable window (pod events); tier_0 512Mi limit (get_tier); chat endpoint returns 200 when healthy and light GETs succeed (app logs + live health probe); DB bound (mongo list_collections); GEMINI_API_KEY present (list_secrets).
- **Inferred (not reproduced):** the exact moment a chat request triggers/collides with the OOM. I could NOT (a) live-test an actual chat `PUT` from the askalbert.app origin (health tooling issues GET only), nor (b) boot the eph sandbox to read the frontend's exact fetch URL and the "Network error" catch line (sandbox spawn returned repeated `eph_source_check_failed` / envcore 500). OOM itself is not reproducible in the sandbox (larger resources, no live secrets/DB/Gemini), so this is diagnosed from runtime evidence, not reproduced.

## Recommended fixes
1. **[Primary — User] Raise the tier.** Deployment Panel → Resources: tier_0 (512Mi) → tier_1 "Launch" or higher. 512Mi is insufficient for a hybrid Next.js + FastAPI ML/LLM app; this is the direct remediation for the OOMKill.
2. **[Code — E1] Reduce per-pod memory pressure so chat doesn't OOM the process:**
   - Gate/throttle `_paper_autopilot_worker` (it already overlaps every 60s) and consider moving background/scheduled jobs (paper autopilot, scenario/Yahoo recompute, ML CV) off the request-serving process or behind a concurrency guard.
   - Cache/limit the Yahoo scenario fetches — they are 429-storming (`server.py` `_scenario_long_closes` → `fetch_yahoo_series` → `_http_json`) and add CPU/memory churn.
   - Make the chat handler resilient (bounded memory, stream/timeout) so a Gemini AFC burst can't crash the worker.
3. **[Verify — User] Confirm on the live domain.** On askalbert.app open DevTools → Network, send a chat, and capture the failing request's status/timing. Expected: a connection reset / timeout (transport failure) coinciding with a pod restart — not an HTTP 4xx/5xx body — which confirms the OOM-window diagnosis above.

## Explicitly not done (per instructions)
No deploy/redeploy/rollback, no production data writes, no secret changes, no code changes. Secret values never revealed (presence-only).
