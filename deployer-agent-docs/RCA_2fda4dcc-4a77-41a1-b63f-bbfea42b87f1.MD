# CORRECTED RCA — askalbert.app FloatingAlbert widget "Network error — please try again."

Supersedes the causal attribution in the earlier RCA for run `2fda4dcc-4a77-41a1-b63f-bbfea42b87f1`.
Deployment `quant-features` → https://quant-features.emergent.host (custom domains askalbert.app / www.askalbert.app, both verified). Template `nextjs_mongo_shadcn_base_image`, tier_0, cluster target-8. Live run: `2fda4dcc-4a77-41a1-b63f-bbfea42b87f1` (status success, active).

## What the previous RCA got wrong
- It attributed the screenshot to **PUT /api/v1/albert/chat** and inferred a transport-level OOM causal link **without a captured failing request**.
- The floating widget (`/app/app/components/FloatingAlbert.js` L68–107) actually calls **POST `${API_BASE}/v1/chat`** → backend **POST /api/v1/chat** (`/app/backend/server.py:12180`). This is a DIFFERENT endpoint from `PUT /api/v1/albert/chat` (the studio chat). The two must not be conflated.

## Evidence gathered from LIVE production (run 2fda4dcc)

### 1. The widget endpoint exists and is POST-only — probe returns JSON, not HTML
`GET https://quant-features.emergent.host/api/v1/chat` → **405 Method Not Allowed**, `Content-Type: application/json`, body `{"detail":"Method Not Allowed"}` (429 ms).
- Confirms the route `/api/v1/chat` is registered and rejects non-POST (so the widget's POST path is the correct one).
- Confirms that, **right now**, the ingress/CDN passes the backend's JSON error through unmodified — it is NOT rewriting to an HTML error page for this path at probe time.

### 2. No `POST /api/v1/chat` request is present in production logs
Searched app logs for the live run across the full available window (since_minutes=1440), filters `chat`, then `POST|/v1/chat|429|500|502|503|Traceback|error|rate`:
- The only chat-family lines are `GET /api/v1/albert/chat` (200), `GET /api/v1/albert/chat/threads` (200), `PUT /api/v1/albert/chat` (200). **Zero occurrences of `POST /api/v1/chat`.**
- No 5xx and no 429 recorded against the chat endpoint. Observed non-200s were `422` on `POST /api/v1/albert/studio/save` (validation) — unrelated.

**⇒ The exact request that produced the screenshot ("Network error — please try again.") is UNVERIFIED.** There is no matching server-side log line for `POST /api/v1/chat`. Either the screenshot pre-dates the 24h log window (Loki max lookback is 1440 min — cannot look further back with available tooling), or the request never reached the backend (dropped before it was logged).

Because it is unverified, **the following cannot be ruled out** and remain open possibilities consistent with the widget code:
- A `fetch` rejection at the transport layer (connection dropped/refused) → catch → "Network error". This would leave no backend access-log line.
- A non-JSON / HTML 5xx from ingress/CDN during a pod-down window → `await r.json()` throws → same catch → "Network error". (Note the widget sets a DIFFERENT string for AbortError/timeout and for 429, so those two are excluded as the source of THIS exact string.)

### 3. The 429s in the logs are OUTBOUND (Yahoo Finance), not the chat endpoint
Many `Traceback ... urllib.error.HTTPError: HTTP Error 429: Too Many Requests` lines originate from `fetch_yahoo_series` in `_scenario_long_closes` (`/app/backend/server.py:19106`), driven by `POST /api/v1/albert/scenario-outlooks/preview`. Those are the backend calling Yahoo and being rate-limited; the endpoint still returns **200** (the error is caught). **Unrelated to the chat widget** — do not attribute the screenshot to these.

### 4. OOMKill is VERIFIED but NOT causally linked to the screenshot
Pod events (get_pod_events, run 2fda4dcc): container `r-2fda4dcc...` **OOMKilled (exit 137)** at **2026-09-27T07:41:14Z**, `restart_count=1`; surrounding startup-probe failures (`connection refused` / `context deadline exceeded` on :3000). The pod recovered and is currently `Running`/`ready`. tier_0 = 512Mi ceiling.
- This OOM is real and there WAS a pod-down/restart window (~07:41Z) during which any in-flight request would have failed at the transport/ingress layer.
- **However, no chat POST is logged at or near that timestamp, so the link between the OOM and the screenshot remains an UNVERIFIED hypothesis, not a proven cause.** Keep the verified OOM fact and the unverified screenshot-causation strictly separate.

## Corrected conclusion
- Screenshot source endpoint = **POST /api/v1/chat** (floating widget), NOT PUT /api/v1/albert/chat.
- The **exact failing request is unverified** — no matching production log line in the last 24h. Do not assert a transport-level OOM cause for it.
- Verified independently: (a) route exists, POST-only, returns JSON on error at probe time; (b) a real OOMKill/restart window existed at 07:41:14Z on tier_0; (c) outbound Yahoo 429s exist but belong to the scenario-outlooks endpoint, not chat.
- HTML/non-JSON 5xx from ingress during a pod-down window is NOT ruled out.

## Recommended next steps (no code or prod changes made)
1. **Capture the failing request live** (DevTools → Network → the `POST /api/v1/chat` call): record HTTP status, response `Content-Type`, and whether the body is JSON or HTML. This is the single missing piece that will confirm transport-reject vs HTML-5xx vs backend-500. Note the wall-clock time so it can be correlated with pod events.
2. **Correlate that timestamp** against pod OOM/restart events to confirm or refute the OOM hypothesis for chat specifically.
3. **tier_0 (512Mi) is at risk** — a verified OOMKill already occurred. Raising the tier reduces the pod-down windows that could manifest as "Network error" for any endpoint. Offer as risk reduction, NOT as a confirmed fix for this screenshot.
4. Optional (Code, for future diagnosability): the widget collapses fetch-reject AND `r.json()` parse-failure into one identical "Network error" string, which erased the signal here. Surfacing `r.status` / `Content-Type` (or logging them) would let the next occurrence be attributed precisely.
