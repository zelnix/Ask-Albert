"""Observable analysis refreshes. No trading commands or model training.

Mongo leases coordinate manual and scheduled calls across server processes. Engine
callbacks must return an explicit outcome; returning None is never success.
"""
import datetime as dt
import hashlib
import re
import threading
import time
import uuid
from contextlib import contextmanager

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

SCOPES = {'market', 'engine', 'news', 'strategy', 'full'}
ACTIVE = {'queued', 'running'}
TERMINAL = {'succeeded', 'partially_succeeded', 'failed'}


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def refresh_scope(message):
    """Recognise an explicit request before asking the language model to explain it."""
    text = str(message).split('\n\nFor this dashboard answer:', 1)[0].lower().strip()
    if re.search(r"\b(don't|do not|without|never)\b.{0,35}\b(refresh|reassess|run|update)\b", text):
        return None
    if re.search(r'\b(how|why|when|did|has|is|what happened)\b.{0,45}\b(refresh|reassess|run|update)\b', text):
        return None
    action = re.search(r'\b(refresh|reassess|rerun|re-run|update|kick\s*off|run|check)\b', text)
    target = re.search(r'\b(data|engines?|analysis|market|news|strategies|strategy|everything|all)\b', text)
    if not (action and target):
        return None
    # Updating or running a strategy has its own reviewed workflow. Only an
    # explicit refresh/reassessment should turn that request into analysis.
    if action.group() in ('update', 'run', 'check') and not re.search(
            r'\b(data|engines?|analysis|market|news|refresh|reassess|evaluation)\b', text):
        return None
    if re.search(r'\b(full|all|everything)\b', text) or ('data' in text and 'engine' in text):
        return 'full'
    if 'engine' in text:
        return 'engine'
    if 'news' in text:
        return 'news'
    if re.search(r'\bstrateg(y|ies)\b', text):
        return 'strategy'
    return 'market'


def normalise(scope, symbols):
    if scope not in SCOPES:
        raise ValueError('Choose market, engine, news, strategy or full.')
    symbols = [symbols] if isinstance(symbols, str) else symbols
    if not isinstance(symbols, (list, tuple)) or not 1 <= len(symbols) <= 8:
        raise ValueError('Provide one to eight asset symbols.')
    if any(not isinstance(s, str) or not re.fullmatch(r'[A-Za-z0-9]{1,12}', s.strip()) for s in symbols):
        raise ValueError('Invalid asset symbol.')
    return scope, sorted(set(s.strip().upper() for s in symbols))


def summary(job):
    status = job.get('status')
    prefix = {'queued': 'Refresh queued.', 'running': 'Refresh is running.',
              'succeeded': 'Refresh completed.', 'partially_succeeded': 'Refresh partly completed.',
              'failed': 'Refresh failed.'}.get(status, 'Refresh status is unavailable.')
    problems = [f"{r['label']}: {r.get('message') or r['status']}"
                for r in job.get('steps', []) if r.get('status') not in ('succeeded', 'queued', 'running')]
    return prefix + (' ' + job['error'] if job.get('error') else '') + (' ' + ' '.join(problems) if problems else '')


class AnalysisJobs:
    LEASE_SECONDS = 120

    def __init__(self, collection, executor):
        self.col = collection
        self.executor = executor

    def _claim(self, key, token):
        try:
            doc = self.col.find_one_and_update(
                {'_id': key, '$or': [{'until': {'$lt': time.time()}}, {'token': None}]},
                {'$set': {'token': token, 'until': time.time() + self.LEASE_SECONDS}},
                upsert=True, return_document=ReturnDocument.AFTER)
            return bool(doc and doc.get('token') == token)
        except DuplicateKeyError:
            return False

    @contextmanager
    def _lease(self, key, token):
        stop = threading.Event()

        def renew():
            while not stop.wait(30):
                try:
                    self.col.update_one({'_id': key, 'token': token},
                                        {'$set': {'until': time.time() + self.LEASE_SECONDS}})
                except Exception:
                    # A database outage must not become a fabricated successful run.
                    break
        heartbeat = threading.Thread(target=renew, daemon=True)
        heartbeat.start()
        try:
            yield
        finally:
            stop.set()
            self.col.update_one({'_id': key, 'token': token}, {'$set': {'token': None, 'until': 0}})

    def request(self, scope, symbols, pid, source, steps):
        scope, symbols = normalise(scope, symbols)
        if not pid:
            raise ValueError('An authenticated owner is required.')
        digest = hashlib.sha256(f'{pid}:{scope}:{symbols}'.encode()).hexdigest()
        lock = 'analysis:request:' + digest
        job_id = 'ar_' + uuid.uuid4().hex
        if not self._claim(lock, job_id):
            current = self.col.find_one({'_id': lock}) or {}
            job = self.get(current.get('token'), pid)
            return {**(job or {'jobId': current.get('token'), 'status': 'queued', 'steps': [],
                              'message': 'An equivalent refresh is queued.'}), 'joined': True}
        stamp = now_iso()
        job = {'_id': job_id, 'kind': 'analysis_run', 'pid': pid, 'scope': scope,
               'symbols': symbols, 'source': source, 'status': 'queued',
               'requestedAt': stamp, 'queuedAt': stamp, 'startedAt': None, 'completedAt': None,
               'lock': lock, 'steps': [{'engine': key, 'label': label, 'status': 'queued'}
                                     for key, label, _ in steps]}
        try:
            self.col.insert_one(job)
            self.executor.submit(self._run, job_id, pid, lock, steps)
        except Exception:
            self.col.update_one({'_id': job_id}, {'$set': {'status': 'failed',
                'completedAt': now_iso(), 'error': 'The refresh worker could not start.'}})
            self.col.update_one({'_id': lock, 'token': job_id}, {'$set': {'token': None, 'until': 0}})
        return {**self.get(job_id, pid), 'joined': False}

    def _run(self, job_id, pid, lock, steps):
        lease = self.col.find_one({'_id': lock, 'token': job_id, 'until': {'$gte': time.time()}})
        pending = self.col.find_one({'_id': job_id, 'status': 'queued'})
        if not lease or not pending:
            self.get(job_id, pid)
            return
        with self._lease(lock, job_id):
            self.col.update_one({'_id': job_id}, {'$set': {'status': 'running', 'startedAt': now_iso()}})
            rows = [{'engine': key, 'label': label, 'status': 'queued'} for key, label, _ in steps]
            try:
                for i, (key, label, work) in enumerate(steps):
                    current = self.col.find_one({'_id': lock, 'token': job_id, 'until': {'$gte': time.time()}})
                    if not current:
                        raise RuntimeError('Refresh worker no longer owns this run.')
                    rows[i]['status'] = 'running'
                    self.col.update_one({'_id': job_id}, {'$set': {'steps': rows}})
                    rows[i] = {**self.execute_engine(key, work, owner=pid if key == 'strategy' else None),
                               'engine': key, 'label': label}
                    self.col.update_one({'_id': job_id}, {'$set': {'steps': rows}})
                statuses = [r['status'] for r in rows]
                status = ('succeeded' if all(s == 'succeeded' for s in statuses) else
                          'partially_succeeded' if any(s in ('succeeded', 'partial') for s in statuses) else 'failed')
                self.col.update_one({'_id': job_id, 'status': 'running'}, {'$set': {'status': status, 'completedAt': now_iso()}})
            except Exception:
                self.col.update_one({'_id': job_id}, {'$set': {'status': 'failed', 'completedAt': now_iso(),
                    'error': 'The refresh worker stopped before all results were recorded.'}})

    def execute_engine(self, engine, work, owner=None):
        key = f'analysis:engine:{owner or "shared"}:{engine}'
        token = uuid.uuid4().hex
        stamp = now_iso()
        if not self._claim(key, token):
            return {'status': 'busy', 'startedAt': stamp, 'completedAt': now_iso(),
                    'message': 'Already running; this request did not start another run.'}
        with self._lease(key, token):
            self.col.update_one({'_id': key, 'token': token}, {'$set': {
                'kind': 'analysis_engine', 'engine': engine, 'owner': owner,
                'status': 'running', 'lastAttemptedAt': stamp, 'message': None}})
            try:
                result = work()
                if not isinstance(result, dict) or result.get('status') not in ('succeeded', 'partial', 'failed', 'skipped'):
                    result = {'status': 'failed', 'message': 'The engine returned no completion evidence.'}
            except Exception:
                result = {'status': 'failed', 'message': 'The engine failed; its previous published result is retained.'}
            finished = now_iso()
            state = {**result, 'completedAt': finished}
            if result['status'] == 'succeeded':
                state['lastSuccessfulAt'] = finished
            # Observation dates come only from the source, never from this clock.
            self.col.update_one({'_id': key, 'token': token}, {'$set': state})
            return {**result, 'startedAt': stamp, 'completedAt': finished}

    def get(self, job_id, pid):
        doc = self.col.find_one({'_id': job_id, 'kind': 'analysis_run', 'pid': pid})
        if not doc:
            return None
        lease = self.col.find_one({'_id': doc['lock']}) or {}
        if doc['status'] in ACTIVE and (lease.get('token') != job_id or lease.get('until', 0) < time.time()):
            doc.update(status='failed', completedAt=now_iso(), error='Refresh worker stopped; completion was not confirmed.')
            self.col.update_one({'_id': job_id, 'status': {'$in': list(ACTIVE)}},
                                {'$set': {k: doc[k] for k in ('status', 'completedAt', 'error')}})
        result = {k: v for k, v in doc.items() if k not in ('_id', 'pid', 'lock', 'kind')}
        result.update(jobId=job_id, message=summary(doc))
        return result

    def latest(self, pid):
        doc = self.col.find_one({'kind': 'analysis_run', 'pid': pid}, sort=[('requestedAt', -1)])
        return self.get(doc['_id'], pid) if doc else None

    def engine_status(self, pid):
        rows = self.col.find({'kind': 'analysis_engine', 'owner': {'$in': [None, pid]}})
        result = {}
        for row in rows:
            if row.get('status') == 'running' and row.get('until', 0) < time.time():
                row.update(status='failed', message='Worker stopped; completion was not confirmed.')
            result[row['engine']] = {k: v for k, v in row.items() if k not in ('_id', 'token', 'until', 'owner', 'kind')}
        return result
