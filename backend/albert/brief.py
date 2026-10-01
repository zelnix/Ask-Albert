"""
Albert's Brief — two-step evidence-led market report generator.

Step 1 (Flash + Google Search): gather existing Ask Albert data, identify gaps,
        research genuine gaps via grounded search.
Step 2 (Pro, no search tools): synthesise the structured brief from all evidence.

This module is ONLY used by Albert's Brief.  It does not touch chat, strategies,
paper trading, decisions or any other feature.
"""
import datetime, json, traceback, uuid, hashlib, time

_BRIEF_SECTION_TOPICS = [
    'price_structure',
    'etf_institutional',
    'onchain_activity',
    'macro_equities',
    'support_resistance',
    'volume_participation',
    'derivatives_leverage',
    'altcoin_breadth',
    'market_news',
]

_MAX_DASHBOARD_SECTIONS = 4

# ── Brief response schema (used by Pro structured output) ──────────────────
# Defined as a plain dict so it can be passed to GenerateContentConfig.response_schema.

BRIEF_SECTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "id":                     {"type": "STRING"},
        "title":                  {"type": "STRING"},
        "dashboard_summary":      {"type": "STRING"},
        "full_commentary":        {"type": "STRING"},
        "key_evidence":           {"type": "ARRAY", "items": {"type": "STRING"}},
        "why_it_matters":         {"type": "STRING"},
        "confirmation_condition": {"type": "STRING"},
        "invalidation_condition": {"type": "STRING"},
        "source_ids":             {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["id", "title", "dashboard_summary", "full_commentary",
                 "key_evidence", "why_it_matters", "confirmation_condition",
                 "invalidation_condition", "source_ids"],
}

BRIEF_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "headline":               {"type": "STRING"},
        "overall_thesis":         {"type": "STRING"},
        "market_call":            {"type": "STRING"},
        "conviction":             {"type": "STRING"},
        "executive_summary":      {"type": "STRING"},
        "dashboard_section_ids":  {"type": "ARRAY", "items": {"type": "STRING"}},
        "sections":               {"type": "ARRAY", "items": BRIEF_SECTION_SCHEMA},
        "conclusion":             {"type": "STRING"},
        "bullish_confirmation":   {"type": "STRING"},
        "bearish_invalidation":   {"type": "STRING"},
        "watch_next":             {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["headline", "overall_thesis", "market_call", "conviction",
                 "executive_summary", "dashboard_section_ids", "sections",
                 "conclusion", "bullish_confirmation", "bearish_invalidation",
                 "watch_next"],
}


# ── Step 1: Gather evidence ────────────────────────────────────────────────

def gather_existing_evidence(brief_context_fn):
    """Collect all data already available from Ask Albert's screens/services.
    Returns (evidence_text, data_cutoff_iso, evidence_topics_covered)."""
    try:
        ctx, as_of = brief_context_fn()
        if not ctx or not ctx.strip():
            return '', None, set()
        topics_covered = set()
        ctx_upper = ctx.upper()
        if 'DECISION:' in ctx_upper and 'COMING SOON' not in ctx_upper.split('DECISION:')[1][:40]:
            topics_covered.add('price_structure')
        if 'ETF FLOW:' in ctx_upper and 'COMING SOON' not in ctx_upper.split('ETF FLOW:')[1][:40]:
            topics_covered.add('etf_institutional')
        if 'TRACKED WALLETS:' in ctx_upper and 'COMING SOON' not in ctx_upper.split('TRACKED WALLETS:')[1][:40]:
            topics_covered.add('onchain_activity')
        if 'EXCHANGE FLOW:' in ctx_upper and 'COMING SOON' not in ctx_upper.split('EXCHANGE FLOW:')[1][:40]:
            topics_covered.add('onchain_activity')
        if 'LEVERAGE:' in ctx_upper and 'COMING SOON' not in ctx_upper.split('LEVERAGE:')[1][:40]:
            topics_covered.add('derivatives_leverage')
        if 'SENTIMENT:' in ctx_upper and 'COMING SOON' not in ctx_upper.split('SENTIMENT:')[1][:40]:
            topics_covered.add('market_news')
        if 'NETWORK:' in ctx_upper:
            topics_covered.add('onchain_activity')
        return ctx, as_of, topics_covered
    except Exception:
        traceback.print_exc()
        return '', None, set()


def identify_gaps(topics_covered):
    """Return topic IDs that still need evidence from external research."""
    gaps = []
    for topic in _BRIEF_SECTION_TOPICS:
        if topic not in topics_covered:
            gaps.append(topic)
    return gaps


_TOPIC_RESEARCH_QUERIES = {
    'price_structure': 'Bitcoin BTC price action technical structure momentum today',
    'etf_institutional': 'Bitcoin spot ETF flows institutional inflows outflows today',
    'onchain_activity': 'Bitcoin on-chain activity holder behaviour addresses today',
    'macro_equities': 'Bitcoin correlation S&P 500 equities macro risk today',
    'support_resistance': 'Bitcoin key support resistance levels technical analysis today',
    'volume_participation': 'Bitcoin trading volume spot market participation today',
    'derivatives_leverage': 'Bitcoin derivatives funding rate open interest leverage today',
    'altcoin_breadth': 'altcoin market breadth relative strength Bitcoin dominance today',
    'market_news': 'Bitcoin crypto major news events regulatory today',
}


def research_gaps(gaps, genai_client, research_model, timeout=45):
    """Use Flash + Google Search grounding to fill evidence gaps.
    Returns (research_text, sources_list).
    Each source: {id, title, url, publisher, retrieved_at}."""
    if not gaps:
        return '', []

    from google.genai import types

    query_parts = []
    for g in gaps[:6]:  # cap at 6 topics per search
        q = _TOPIC_RESEARCH_QUERIES.get(g, f'Bitcoin {g.replace("_", " ")} market analysis today')
        query_parts.append(f"- {g}: {q}")

    prompt = (
        "You are a crypto market research assistant. For EACH topic below, find "
        "the most current, factual data from credible public sources (exchanges, "
        "ETF issuers, regulators, market-data publishers, established crypto analytics). "
        "For each finding, state: the topic, the key data point or metric, its value, "
        "the source name, and any relevant date or observation time.\n\n"
        "Topics to research:\n" + "\n".join(query_parts) + "\n\n"
        "Return structured findings. Do not fabricate values. If a topic has no "
        "credible current data, say 'No credible data found for [topic]'."
    )

    try:
        resp = genai_client.models.generate_content(
            model=research_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.1,
            ),
        )

        research_text = ''
        if resp.candidates and resp.candidates[0].content and resp.candidates[0].content.parts:
            research_text = '\n'.join(
                p.text for p in resp.candidates[0].content.parts if hasattr(p, 'text') and p.text
            )

        # Extract grounding sources from metadata
        sources = []
        now_iso = datetime.datetime.utcnow().isoformat()
        try:
            gm = resp.candidates[0].grounding_metadata
            if gm and hasattr(gm, 'grounding_chunks') and gm.grounding_chunks:
                for i, chunk in enumerate(gm.grounding_chunks):
                    web = getattr(chunk, 'web', None)
                    if web:
                        src_id = f"src_{i+1:02d}"
                        sources.append({
                            'id': src_id,
                            'title': getattr(web, 'title', '') or '',
                            'url': getattr(web, 'uri', '') or '',
                            'publisher': _extract_publisher(getattr(web, 'uri', '') or ''),
                            'retrieved_at': now_iso,
                        })
            # Also try grounding_supports for search_entry_point
            if gm and hasattr(gm, 'search_entry_point'):
                pass  # search_entry_point is for UI rendering, not needed
        except Exception:
            pass  # grounding metadata extraction is best-effort

        return research_text, sources
    except Exception:
        traceback.print_exc()
        return '', []


def _extract_publisher(url):
    """Extract a clean publisher name from a URL."""
    if not url:
        return 'Unknown'
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc.lower()
        host = host.replace('www.', '')
        # Common mappings
        known = {
            'coindesk.com': 'CoinDesk', 'cointelegraph.com': 'Cointelegraph',
            'bloomberg.com': 'Bloomberg', 'reuters.com': 'Reuters',
            'theblock.co': 'The Block', 'decrypt.co': 'Decrypt',
            'coinglass.com': 'Coinglass', 'glassnode.com': 'Glassnode',
            'tradingview.com': 'TradingView', 'cnbc.com': 'CNBC',
            'coinmarketcap.com': 'CoinMarketCap', 'coingecko.com': 'CoinGecko',
            'farside.co.uk': 'Farside Investors',
            'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)',
        }
        for domain, name in known.items():
            if domain in host:
                return name
        return host.split('.')[0].capitalize()
    except Exception:
        return 'Unknown'


# ── Step 2: Synthesise the brief ──────────────────────────────────────────

_SYNTHESIS_SYSTEM = """You are Albert, a brilliant crypto market analyst writing an evidence-led market brief.

WRITING RULES:
- Be direct, calm, specific, evidence-led, written in plain English.
- Follow: What changed → evidence → why it matters → what confirms or reverses it.
- You may interpret verified evidence but MUST NOT manufacture facts, figures, levels, timestamps or sources.
- Never invent values or replace missing evidence with zero, neutral or fabricated data.
- If a section has no credible evidence, omit it entirely — do not produce filler.
- Reference sources ONLY by the source IDs provided below — do not create new source URLs.
- Dashboard summaries must be one to two sentences: title, strongest metric/level, direction, why it matters.
- The conviction field must be one of: "High", "Moderate", or "Low".

STRUCTURE:
Create a complete market report with:
- A strong, descriptive headline (e.g. "Strength Meets a Wall" or "Momentum Builds Above Support")
- An overall thesis (2-3 sentences framing the current market)
- A clear market call (e.g. "Cautiously Bullish", "Neutral — Waiting for Confirmation", "Bearish Until Support Holds")
- An executive summary (3-5 bullet-style sentences covering the most important findings)
- Evidence-led sections covering topics where evidence exists
- Each section needs: title, dashboard_summary, full_commentary, key_evidence list, why_it_matters, confirmation_condition, invalidation_condition, and source_ids
- A conclusion synthesising everything
- Bullish confirmation conditions (what would confirm upside)
- Bearish invalidation conditions (what would confirm downside)
- What Albert is watching next (3-5 items)

Choose the top 3-4 most market-significant sections for dashboard_section_ids.
Section IDs must be unique lowercase strings (e.g. "price_structure", "etf_flows").

IMPORTANT: Output valid JSON matching the required schema exactly."""


def synthesize_brief(existing_evidence, research_text, sources, genai_client,
                     synthesis_model, timeout=90):
    """Use Pro (no search tools) to create the structured brief.
    Returns the parsed brief dict or None on failure."""
    from google.genai import types

    # Build the source reference block for Pro
    source_block = "AVAILABLE SOURCES (reference by ID only):\n"
    if sources:
        for s in sources:
            source_block += f"  {s['id']}: {s['title']} ({s['publisher']}) — {s['url']}\n"
    else:
        source_block += "  (No external sources — use only Ask Albert data)\n"

    user_prompt = f"""Write Albert's market brief now using ONLY the evidence provided below.

=== ASK ALBERT DATA (primary evidence) ===
{existing_evidence or '(No Ask Albert data available today)'}

=== EXTERNAL RESEARCH (fills gaps in Ask Albert data) ===
{research_text or '(No additional research needed — Ask Albert data is sufficient)'}

{source_block}

Generate the complete structured brief as JSON."""

    try:
        resp = genai_client.models.generate_content(
            model=synthesis_model,
            contents=[
                types.Content(role='user', parts=[
                    types.Part.from_text(text=_SYNTHESIS_SYSTEM + "\n\n" + user_prompt)
                ]),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BRIEF_RESPONSE_SCHEMA,
                temperature=0.1,
            ),
        )

        if not resp.candidates or not resp.candidates[0].content:
            return None

        text = ''
        for part in resp.candidates[0].content.parts:
            if hasattr(part, 'text') and part.text:
                text += part.text

        if not text.strip():
            return None

        brief = json.loads(text)
        return brief

    except json.JSONDecodeError:
        traceback.print_exc()
        return None
    except Exception:
        traceback.print_exc()
        return None


# ── Validation ─────────────────────────────────────────────────────────────

def validate_brief(brief, sources):
    """Validate the brief meets requirements. Returns (valid, brief_or_None, issues)."""
    issues = []
    if not brief or not isinstance(brief, dict):
        return False, None, ['Brief is empty or not a dict']

    # Check required top-level fields
    for field in ['headline', 'overall_thesis', 'market_call', 'conviction',
                  'executive_summary', 'sections', 'conclusion',
                  'bullish_confirmation', 'bearish_invalidation', 'watch_next']:
        val = brief.get(field)
        if not val:
            issues.append(f'Missing or empty: {field}')

    sections = brief.get('sections') or []
    if not sections:
        issues.append('No sections')

    # Check section IDs are unique
    sec_ids = [s.get('id') for s in sections if s.get('id')]
    if len(sec_ids) != len(set(sec_ids)):
        issues.append('Duplicate section IDs')

    # Check dashboard_section_ids reference real sections
    dash_ids = brief.get('dashboard_section_ids') or []
    for did in dash_ids:
        if did not in sec_ids:
            issues.append(f'dashboard_section_ids references unknown section: {did}')

    # Cap dashboard sections at 4
    if len(dash_ids) > _MAX_DASHBOARD_SECTIONS:
        brief['dashboard_section_ids'] = dash_ids[:_MAX_DASHBOARD_SECTIONS]

    # Check source_ids in sections match research sources
    valid_source_ids = {s['id'] for s in sources} if sources else set()
    for sec in sections:
        for sid in (sec.get('source_ids') or []):
            if sid not in valid_source_ids and sources:
                # Remove invalid source references rather than failing
                sec['source_ids'] = [s for s in sec['source_ids'] if s in valid_source_ids]
                break

    # Remove empty sections (no commentary)
    valid_sections = [s for s in sections if s.get('full_commentary') and s.get('title')]
    brief['sections'] = valid_sections

    # Re-validate dashboard_section_ids after section pruning
    remaining_ids = {s['id'] for s in valid_sections}
    brief['dashboard_section_ids'] = [d for d in (brief.get('dashboard_section_ids') or [])
                                       if d in remaining_ids][:_MAX_DASHBOARD_SECTIONS]

    if not valid_sections:
        issues.append('No valid sections after pruning')

    # Fatal issues that prevent saving
    fatal = [i for i in issues if i in ['Brief is empty or not a dict', 'No valid sections after pruning']]
    if fatal:
        return False, None, issues

    return True, brief, issues


# ── Orchestrator ──────────────────────────────────────────────────────────

def generate_brief(brief_context_fn, genai_client, research_model, synthesis_model,
                   timeout_research=45, timeout_synthesis=90):
    """Full two-step brief generation. Returns (brief_doc, error_msg).
    brief_doc includes the brief content plus metadata added by the backend.
    On failure, returns (None, error_string)."""
    now_iso = datetime.datetime.utcnow().isoformat()
    brief_id = f"brief_{datetime.date.today().isoformat()}_{uuid.uuid4().hex[:8]}"

    # Step 1: Gather existing evidence
    existing_evidence, data_cutoff, topics_covered = gather_existing_evidence(brief_context_fn)

    # Identify gaps
    gaps = identify_gaps(topics_covered)

    # Research gaps with Flash + Google Search
    research_text, sources = '', []
    if gaps and genai_client:
        research_text, sources = research_gaps(gaps, genai_client, research_model,
                                                timeout=timeout_research)

    # Step 2: Synthesise with Pro (no search tools)
    brief = synthesize_brief(existing_evidence, research_text, sources,
                              genai_client, synthesis_model,
                              timeout=timeout_synthesis)

    if not brief:
        # One repair attempt with the same evidence
        print("BRIEF: First synthesis attempt failed, retrying...")
        brief = synthesize_brief(existing_evidence, research_text, sources,
                                  genai_client, synthesis_model,
                                  timeout=timeout_synthesis)
        if not brief:
            return None, 'Synthesis failed after retry'

    # Validate
    valid, brief, issues = validate_brief(brief, sources)
    if not valid:
        return None, f'Validation failed: {"; ".join(issues)}'
    if issues:
        print(f"BRIEF: Validation warnings: {issues}")

    # Backend adds metadata (not Gemini)
    doc = {
        'brief_id': brief_id,
        'generated_at': now_iso,
        'data_cutoff': data_cutoff or now_iso,
        'headline': brief.get('headline', ''),
        'overall_thesis': brief.get('overall_thesis', ''),
        'market_call': brief.get('market_call', ''),
        'conviction': brief.get('conviction', ''),
        'executive_summary': brief.get('executive_summary', ''),
        'dashboard_section_ids': brief.get('dashboard_section_ids', []),
        'sections': brief.get('sections', []),
        'conclusion': brief.get('conclusion', ''),
        'bullish_confirmation': brief.get('bullish_confirmation', ''),
        'bearish_invalidation': brief.get('bearish_invalidation', ''),
        'watch_next': brief.get('watch_next', []),
        'sources': sources,
        'research_model': research_model,
        'synthesis_model': synthesis_model,
        'topics_from_albert': list(topics_covered),
        'topics_researched': gaps,
    }

    return doc, None
