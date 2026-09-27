"""Bounded read-only source retrieval for Ask Albert's internal engine checks.

The allowlist is fixed by this server, not by user text. No file paths or source
code leave the API response; selected excerpts are supplied only to the existing
LLM as untrusted evidence. This is inspection, not a test run or a code executor.
"""
import ast
from functools import lru_cache
import hashlib
from pathlib import Path
import re

_BACKEND = Path(__file__).resolve().parents[2]
_ENGINE_ROOT = _BACKEND / 'albert'
_GROUPS = ('engine', 'paper', 'execution', 'market', 'repositories')
_SERVER = _BACKEND / 'server.py'
_SERVER_FUNCTION_PREFIXES = (
    '_albert_decisions', '_decision_', '_paper_', '_scenario_', '_studio_',
    '_risk_', '_regime_', '_mkt_', '_compute_', '_score_', '_signal_',
    'albert_scenario_', 'albert_decision_', 'albert_paper_',
)
_SERVER_CONSTANT_PREFIXES = ('SCENARIO_', 'PAPER_', 'STUDIO_', 'RISK_', 'DECISION_')
# A new file under an engine directory must not silently make auth/config internals
# readable. The reader itself is not trading logic and must not index itself.
_EXCLUDED_FILES = frozenset({'__init__.py', 'code_reader.py', 'config.py', 'auth.py',
                             'security.py', 'secrets.py', 'credentials.py', 'deps.py',
                             'keys.py', 'key.py'})
_SENSITIVE_NAME = re.compile(r'(?i)(?:^|_)(?:auth|oauth|config|credential|secret|'
                             r'security|token|password|passcode|session|keys?)(?:_|$|[A-Z])')
_SENSITIVE = re.compile(
    r'(?i)(api[_-]?key|client[_-]?secret|password|passcode|credential|'
    r'authorization|bearer\s|os\.environ|os\.getenv|dotenv|mongo_url|'
    r'private[_-]?key|session[_-]?token|sk-[A-Za-z0-9_-]{16,}|'
    r'AIza[A-Za-z0-9_-]{20,}|mongodb(?:\+srv)?://[^\s/@]+:[^\s/@]+@)')
_WORD = re.compile(r'[a-z][a-z0-9]{2,}')
_DECISION = re.compile(
    r'(?i)\b(decision|why|buy|sell|hold|trade|trading|signal|engine|'
    r'paper|strategy|risk|score|scoring|size|sizing|mandate|rule|'
    r'code|algorithm|correct|logic|audit|review|scenario|what.if|'
    r'forecast|range|calibrat|backtest|evalua|portfolio|rebalance|'
    r'order|fill|approve|reject|profit|loss|performance)\w*\b')
_SECTION_TOPICS = {
    'forecasts': ('market', 'scenario', 'history', 'evaluation'),
    'analogs': ('market', 'scenario'),
    'risk': ('risk', 'portfolio', 'paper', 'engine'),
    'paper': ('paper', 'execution', 'decision'),
    'paperengine': ('paper', 'execution', 'engine'),
    'strategies': ('engine', 'paper', 'studio'),
    'performance': ('evaluation', 'decision', 'market'),
    'dataaudit': ('market', 'universe', 'history'),
}
_TOPIC_HINTS = {
    'decision': ('engine', 'decision', 'precedence', 'regime', 'scoring'),
    'signal': ('engine', 'decision', 'scoring', 'market'),
    'market': ('engine', 'market', 'decision'),
    'trade': ('paper', 'execution', 'decision', 'order', 'portfolio'),
    'buy': ('paper', 'decision', 'sizing', 'risk'),
    'sell': ('paper', 'decision', 'sell', 'risk'),
    'risk': ('risk', 'paper', 'portfolio', 'sizing', 'mandate'),
    'strategy': ('studio', 'strategy', 'paper', 'engine'),
    'scenario': ('market', 'scenario', 'scenario_v2', 'history'),
    'forecast': ('market', 'scenario', 'history', 'evaluation'),
    'history': ('market', 'history', 'scenario_v2'),
    'calibration': ('market', 'scenario_v2', 'evaluate'),
    'accuracy': ('market', 'scenario_v2', 'evaluate'),
    'paper': ('paper', 'execution', 'portfolio'),
    'order': ('execution', 'paper', 'state_machine'),
    'fill': ('execution', 'ledger', 'paper'),
    'rotation': ('paper', 'portfolio', 'sell'),
    'source': ('engine', 'market', 'paper', 'execution'),
}
_STOP = {'the', 'for', 'and', 'that', 'this', 'with', 'what', 'your', 'from',
         'will', 'have', 'when', 'user', 'about', 'into', 'which', 'should',
         'does', 'then', 'been', 'each', 'than', 'like', 'their', 'where'}
_MAX_CHUNKS = 5
_MAX_CHARS = 5200


def _tokens(value):
    value = re.sub(r'([a-z])([A-Z])', r'\1 \2', value).replace('_', ' ')
    return set(_WORD.findall(value.lower())) - _STOP


def _paths():
    for group in _GROUPS:
        root = (_ENGINE_ROOT / group).resolve()
        for path in sorted(root.glob('*.py')):
            resolved = path.resolve()
            if (not path.is_symlink() and resolved.parent == root and
                    resolved.suffix == '.py' and resolved.name not in _EXCLUDED_FILES
                    and not _SENSITIVE_NAME.search(resolved.stem)):
                yield resolved, group
    if _SERVER.is_file() and not _SERVER.is_symlink():
        yield _SERVER.resolve(), 'server'


def _allowed_node(node, group):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return (not _SENSITIVE_NAME.search(node.name) and
                (group != 'server' or node.name.startswith(_SERVER_FUNCTION_PREFIXES)))
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        names = [t.id for t in targets if isinstance(t, ast.Name)]
        return bool(names) and all(n.isupper() and (
            group != 'server' or n.startswith(_SERVER_CONSTANT_PREFIXES)) for n in names)
    return False


def _segments(node, lines):
    """Limit each excerpt without pretending a partial function is the full engine."""
    start, end = node.lineno, node.end_lineno or node.lineno
    for first in range(start, end + 1, 44):
        last = min(first + 48, end)
        excerpt = '\n'.join(lines[first - 1:last])
        if excerpt and not _SENSITIVE.search(excerpt):
            yield first, last, excerpt


@lru_cache(maxsize=4)
def _index(stamp):
    chunks = []
    for path, group in _paths():
        try:
            text = path.read_text(encoding='utf-8')
            tree = ast.parse(text, filename=path.name)
        except (OSError, UnicodeError, SyntaxError):
            continue
        lines = text.splitlines()
        nodes = list(tree.body)
        for parent in tree.body:
            if isinstance(parent, ast.ClassDef) and (group != 'server' or
                                                       parent.name.startswith(_SERVER_FUNCTION_PREFIXES)):
                nodes.extend(n for n in parent.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
        for node in nodes:
            if not _allowed_node(node, group):
                continue
            symbol = getattr(node, 'name', None)
            if not symbol:
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                symbol = ','.join(t.id for t in targets if isinstance(t, ast.Name))
            for first, last, excerpt in _segments(node, lines):
                digest = hashlib.sha256((str(path.relative_to(_BACKEND)) + '\n' + excerpt)
                                        .encode('utf-8')).hexdigest()[:16]
                chunks.append({'group': group, 'symbol': symbol,
                               'location': '%s:%d-%d' % (path.relative_to(_BACKEND), first, last),
                               'text': excerpt, 'sourceId': 'engine:' + digest,
                               'tokens': _tokens(symbol + ' ' + excerpt[:1700])})
    return tuple(chunks)


def _source_stamp():
    # A deployment may replace its source without restarting an LLM worker.
    # Content-based IDs change with code; mtime/size invalidate the in-process index.
    return tuple((str(p.relative_to(_BACKEND)), p.stat().st_mtime_ns, p.stat().st_size)
                 for p, _group in _paths())


def engine_related(message, section=None):
    return bool(_DECISION.search(message or '')) or bool(section in _SECTION_TOPICS and
                                                         (message or '').strip())


def select_engine_logic(message, section=None):
    """Select a relevant, bounded cross-section, not an unrestricted file read.

    A model cannot establish whole-system correctness from snippets. `coverage` and
    `testsRun` tell it exactly what was inspected and what was not tested.
    """
    if not engine_related(message, section):
        return {'available': False, 'reason': 'NOT_ENGINE_RELATED', 'context': '',
                'refs': [], 'testsRun': False}
    try:
        chunks = _index(_source_stamp())
    except OSError:
        chunks = ()
    if not chunks:
        return {'available': False, 'reason': 'SOURCE_UNAVAILABLE', 'context': '',
                'refs': [], 'testsRun': False}
    words = _tokens(message or '')
    hints = set(_SECTION_TOPICS.get(section, ()))
    for word in words:
        hints.update(_TOPIC_HINTS.get(word, ()))
        if word.startswith(('trad', 'transact')):
            hints.update(_TOPIC_HINTS['trade'])
        elif word.startswith(('signal', 'decis', 'scor')):
            hints.update(_TOPIC_HINTS['decision'])
        elif word.startswith(('strateg', 'rebalance')):
            hints.update(_TOPIC_HINTS['strategy'])
        elif word.startswith(('scenar', 'analog', 'outlook')):
            hints.update(_TOPIC_HINTS['scenario'])
        elif word.startswith(('calibrat', 'evaluat', 'backtest')):
            hints.update(_TOPIC_HINTS['calibration'])
    explicit = bool(re.search(r'(?i)\b(code|source|implementation|logic|correct|audit|review|mismatch)\b',
                              message or ''))
    if explicit and not hints:
        hints.update(('engine', 'market', 'paper', 'execution'))
    ranked = []
    for chunk in chunks:
        overlap = words & chunk['tokens']
        label = _tokens(chunk['group'] + ' ' + chunk['symbol'])
        match = (4 * len(overlap & label) + len(overlap)
                 + (5 if chunk['group'] in hints else 0)
                 + 3 * len(label & hints))
        if match:
            ranked.append((match, chunk))
    ranked.sort(key=lambda pair: (-pair[0], pair[1]['location']))
    selected, used_symbols, budget = [], set(), _MAX_CHARS
    for _score, chunk in ranked:
        key = (chunk['group'], chunk['symbol'])
        if key in used_symbols or len(selected) >= _MAX_CHUNKS:
            continue
        excerpt = chunk['text'][:1700]
        block = '[INTERNAL ENGINE SOURCE %s] %s\n%s' % (
            chunk['sourceId'], chunk['location'], excerpt)
        if len(block) > budget:
            continue
        selected.append((chunk, block))
        used_symbols.add(key)
        budget -= len(block)
    if not selected:
        return {'available': False, 'reason': 'NO_RELEVANT_SAFE_SOURCE',
                'context': '', 'refs': [], 'testsRun': False}
    refs = [{'sourceId': chunk['sourceId'], 'topic': chunk['group']}
            for chunk, _block in selected]
    return {
        'available': True, 'context': '\n\n'.join(block for _chunk, block in selected),
        'refs': refs, 'testsRun': False, 'partial': True,
        'sourceDigest': hashlib.sha256('|'.join(r['sourceId'] for r in refs)
                                       .encode('utf-8')).hexdigest()[:16],
        'coverage': sorted(set(chunk['group'] for chunk, _block in selected)),
    }
