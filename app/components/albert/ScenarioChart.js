'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Loader2, Maximize2, ChevronDown, MessageCircle, Info, Ban, RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  signedPct, ratioPct, money, shortDate, useElementWidth, EvidenceButton, EvidenceFact,
  Limitations, StatusBadge,
} from './common';

const HORIZONS = [
  { id: 'P7D', label: '7 days' },
  { id: 'P14D', label: '14 days' },
  { id: 'P30D', label: '30 days' },
];

/* ------------------------------ the chart ------------------------------ */
/**
 * The 20th-to-80th percentile band is the VISUAL HERO: it is the only filled shape, it
 * carries the strongest colour, and it is the thing the eye lands on. Observed history is
 * a quiet line to its left, separated by an explicit "Scenario starts" boundary. The
 * median path is drawn only when the user asks for it, because it has no measured skill.
 */
function BandChart({ outlook, showMedian, height = 280, histCount = 45 }) {
  const [wrapRef, width] = useElementWidth(900);
  const band = outlook?.band;
  const bandOk = !!band?.available;

  const geom = useMemo(() => {
    const hist = (outlook?.history || []).slice(-histCount);
    if (hist.length < 2) return null;
    const bull = bandOk ? ((outlook.scenarios || []).find((s) => s.side === 'BULLISH')?.points || []) : [];
    const bear = bandOk ? ((outlook.scenarios || []).find((s) => s.side === 'BEARISH')?.points || []) : [];
    const med = bandOk ? (band.medianPath || []) : [];
    const fwd = Math.min(bull.length, bear.length);
    const pad = { l: 62, r: bandOk ? 76 : 16, t: 26, b: 24 };
    const anchorIdx = hist.length - 1;
    const total = hist.length + fwd;
    const innerW = Math.max(60, width - pad.l - pad.r);
    const innerH = Math.max(60, height - pad.t - pad.b);
    const x = (i) => pad.l + (total <= 1 ? 0 : (i / (total - 1)) * innerW);

    const prices = hist.map((h) => Number(h.close)).filter((n) => !Number.isNaN(n));
    bull.slice(0, fwd).forEach((p) => prices.push(Number(p.price)));
    bear.slice(0, fwd).forEach((p) => prices.push(Number(p.price)));
    if (!prices.length) return null;
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    const span = (hi - lo) || (hi * 0.02) || 1;
    lo -= span * 0.10; hi += span * 0.10;
    const y = (p) => pad.t + (1 - ((Number(p) - lo) / (hi - lo))) * innerH;

    const histPts = hist.map((h, i) => `${x(i).toFixed(1)},${y(h.close).toFixed(1)}`).join(' ');
    const anchorPrice = Number(hist[anchorIdx].close);
    const upper = [[x(anchorIdx), y(anchorPrice)]];
    const lower = [[x(anchorIdx), y(anchorPrice)]];
    for (let i = 0; i < fwd; i += 1) {
      upper.push([x(hist.length + i), y(bull[i].price)]);
      lower.push([x(hist.length + i), y(bear[i].price)]);
    }
    const bandPath = fwd
      ? `M ${upper.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} L ${lower.slice().reverse().map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} Z`
      : null;
    const medPts = (showMedian && med.length)
      ? [[x(anchorIdx), y(anchorPrice)]].concat(med.slice(0, fwd).map((p, i) => [x(hist.length + i), y(p.price)]))
        .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
      : null;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const p = lo + (hi - lo) * (1 - f);
      return { yy: pad.t + f * innerH, price: p };
    });
    const xLabels = [
      { xx: x(0), text: shortDate(hist[0].time) },
      { xx: x(anchorIdx), text: shortDate(hist[anchorIdx].time) },
    ];
    if (fwd) xLabels.push({ xx: x(total - 1), text: shortDate(bull[fwd - 1].time) });

    return {
      pad, innerW, innerH, histPts, bandPath, medPts, ticks, xLabels, fwd,
      upperPts: upper.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
      lowerPts: lower.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
      boundaryX: x(anchorIdx), anchorY: y(anchorPrice), anchorPrice,
      upperY: fwd ? y(bull[fwd - 1].price) : null,
      lowerY: fwd ? y(bear[fwd - 1].price) : null,
      rightX: x(total - 1),
    };
  }, [outlook, width, height, histCount, showMedian, bandOk, band]);

  return (
    <div ref={wrapRef} className="w-full min-w-0 overflow-x-hidden">
      {geom ? (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
          role="img" className="block max-w-full"
          aria-label={bandOk
            ? `Observed ${outlook.assetId} price history to ${shortDate(outlook.baseline?.observedAt)}, then the range comparable past conditions produced over ${band.horizonDays} days: ${signedPct(band.lowerPct)} to ${signedPct(band.upperPct)}. This is a historical scenario range, not a forecast.`
            : `Observed ${outlook?.assetId} price history. No scenario range is published.`}>
          <defs>
            <linearGradient id="albBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.42" />
              <stop offset="52%" stopColor="#818cf8" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0.34" />
            </linearGradient>
          </defs>

          {geom.ticks.map((t, i) => (
            <g key={i}>
              <line x1={geom.pad.l} y1={t.yy} x2={width - geom.pad.r} y2={t.yy}
                stroke="#1e293b" strokeWidth="1" />
              <text x={geom.pad.l - 8} y={t.yy + 3.5} textAnchor="end"
                fontSize="10" fill="#64748b">{money(t.price, { decimals: 0 })}</text>
            </g>
          ))}

          {/* the band: 20th-to-80th percentile of matched historical outcomes */}
          {geom.bandPath ? (
            <path d={geom.bandPath} fill="url(#albBand)" stroke="none" />
          ) : null}
          {geom.bandPath ? (
            <>
              <polyline fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 4"
                points={geom.upperPts} />
              <polyline fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="6 4"
                points={geom.lowerPts} />
            </>
          ) : null}

          {/* observed history */}
          <polyline fill="none" stroke="#cbd5e1" strokeWidth="1.8" points={geom.histPts} />

          {/* median path, off by default */}
          {geom.medPts ? (
            <polyline fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="3 3"
              points={geom.medPts} />
          ) : null}

          {/* the boundary between what happened and what is only a scenario */}
          <line x1={geom.boundaryX} y1={geom.pad.t - 8} x2={geom.boundaryX}
            y2={height - geom.pad.b} stroke="#94a3b8" strokeWidth="1"
            strokeDasharray="4 4" />
          <circle cx={geom.boundaryX} cy={geom.anchorY} r="3.5" fill="#f8fafc" />
          <text x={geom.boundaryX - 6} y={geom.pad.t - 12} textAnchor="end"
            fontSize="10" fontWeight="700" fill="#94a3b8">OBSERVED</text>
          <text x={geom.boundaryX + 6} y={geom.pad.t - 12} textAnchor="start"
            fontSize="10" fontWeight="700" fill="#7dd3fc">SCENARIO STARTS</text>

          {bandOk && geom.upperY !== null ? (
            <>
              <text x={geom.rightX + 8} y={geom.upperY + 3.5} fontSize="11" fontWeight="700"
                fill="#7dd3fc">{signedPct(band.upperPct)}</text>
              <text x={geom.rightX + 8} y={geom.lowerY + 3.5} fontSize="11" fontWeight="700"
                fill="#f9a8d4">{signedPct(band.lowerPct)}</text>
            </>
          ) : null}

          {geom.xLabels.map((l, i) => (
            <text key={i} x={l.xx} y={height - 6}
              textAnchor={i === 0 ? 'start' : (i === geom.xLabels.length - 1 ? 'end' : 'middle')}
              fontSize="10" fill="#64748b">{l.text}</text>
          ))}
        </svg>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-[13px] text-slate-500">
          No observed price history is available to chart for this asset.
        </div>
      )}
    </div>
  );
}

/* ---------------------------- the hero card ---------------------------- */
export default function ScenarioChart({
  outlook, loading, error, asset, assets, horizon, onAsset, onHorizon, onRetry, onEvidence,
  onExpand, onAsk, embedded = false, chartHeight = 300, histCount = 45, leadership,
}) {
  const [showMedian, setShowMedian] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const band = outlook?.band;
  const available = !!band?.available;
  const preparing = band?.reasonCode === 'EVALUATION_NOT_COMPUTED_YET';
  const snap = band?.snapshotId;
  const ph = outlook?.phase;

  const Head = (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-bold text-white">What-if scenario</h3>
      <span className="rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/40">
        Historical scenario range — not a forecast
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {(assets || []).length > 1 ? (
          <select value={asset} onChange={(e) => onAsset && onAsset(e.target.value)}
            aria-label="Asset"
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[12px] font-semibold text-slate-200 outline-none focus:border-sky-500">
            {assets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : null}
        <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
          {HORIZONS.map((h) => (
            <button key={h.id} type="button" onClick={() => onHorizon && onHorizon(h.id)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${horizon === h.id ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}>
              {h.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const body = (
    <>
      {Head}

      {loading && !outlook ? (
        <div className="flex h-[240px] items-center justify-center text-[13px] text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Matching today’s conditions against the historical record…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <p className="flex items-start gap-2 text-[13px] font-semibold text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </p>
          {onRetry ? (
            <Button size="sm" type="button" onClick={onRetry}
              className="mt-3 bg-sky-500 text-white hover:bg-sky-400">
              <RefreshCw className="mr-1.5 h-4 w-4" />Retry scenario
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {/* THE HEADLINE. Rendered from the provider snapshot only — the frontend never
              recalculates these bounds, and suppresses them entirely when the band is
              not published. */}
          {available ? (
            <div className="mt-3">
              <p className="text-[19px] font-bold leading-snug text-white sm:text-[22px]">
                Comparable past conditions produced{' '}
                <span className="text-pink-300">{signedPct(band.lowerPct)}</span>
                {' to '}
                <span className="text-sky-300">{signedPct(band.upperPct)}</span>
                {' over '}{band.horizonDays} days.
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-400">
                <span>
                  {outlook.assetId} anchored at {money(band.anchorPrice)} on {shortDate(band.anchorDate)} —
                  the shaded band is the {band.percentiles?.bearish}th to {band.percentiles?.bullish}th
                  percentile of what actually happened next on the most comparable days.
                </span>
                <EvidenceButton snapshotId={snap} onEvidence={onEvidence} label="Provider snapshot" />
              </p>
            </div>
          ) : preparing ? (
            <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-4">
              <p className="flex items-center gap-2 text-[16px] font-bold text-sky-200">
                <Loader2 className="h-4 w-4 animate-spin" />Preparing today's scenario
              </p>
              <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-slate-300">
                Albert is checking the historical range against its walk-forward evaluation. This usually takes less than a minute.
              </p>
              <p className="mt-2 text-[12px] text-slate-400">The observed history below is real. No scenario range is shown until the check completes.</p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="flex items-center gap-2 text-[16px] font-bold text-white">
                <Ban className="h-4 w-4 text-amber-400" />Scenario unavailable
              </p>
              <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-slate-300">
                {band?.reasonText || 'No scenario range is published for this asset and horizon right now.'}
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Reason code: {band?.reasonCode || 'SCENARIO_UNAVAILABLE'}
              </p>
              <p className="mt-2 text-[12px] text-slate-400">
                No range, midpoint or percentage is shown while this is the case. The observed
                history below is still real — only the scenario is withheld.
              </p>
            </div>
          )}

          <div className="mt-3">
            <BandChart outlook={outlook} showMedian={showMedian && available}
              height={chartHeight} histCount={histCount} />
          </div>

          {/* Validation facts, each one a link to the snapshot it came from. */}
          {available ? (
            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
              <EvidenceFact value={ratioPct(band.coverageRate)} tone="good"
                label={`band covered the outcome (target ${ratioPct(band.coverageTarget, 0)})`}
                snapshotId={snap} onEvidence={onEvidence} />
              <EvidenceFact value={band.evaluationPoints} label="chronological checks"
                snapshotId={snap} onEvidence={onEvidence} />
              <EvidenceFact value={band.matchedDays} label="matched historical days"
                snapshotId={snap} onEvidence={onEvidence} />
              <EvidenceFact value={band.independentEpisodes} label="distinct episodes"
                snapshotId={snap} onEvidence={onEvidence} />
              <EvidenceFact value={(band.skillVsNoChange ?? 0).toFixed(2)} tone="warn"
                label="skill of the middle path — none" snapshotId={snap} onEvidence={onEvidence} />
            </div>
          ) : null}

          {available ? (
            <p className="mt-2.5 max-w-[95ch] text-[12px] leading-relaxed text-amber-200/90">
              {band.validationHeadline}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!embedded && onExpand ? (
              <Button size="sm" onClick={onExpand}
                className="h-8 gap-1.5 bg-gradient-to-r from-sky-500 to-violet-600 px-3 text-[12px] font-semibold text-white hover:from-sky-400 hover:to-violet-500">
                <Maximize2 className="h-3.5 w-3.5" />Expand analysis
              </Button>
            ) : null}
            <button type="button" onClick={() => setShowDetails((s) => !s)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[12px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              More details
            </button>
            {onAsk ? (
              <button type="button" onClick={() => onAsk(snap)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[12px] font-semibold text-slate-300 hover:border-sky-500/60 hover:text-sky-200">
                <MessageCircle className="h-3.5 w-3.5" />Ask Albert about this range
              </button>
            ) : null}
            {(leadership || ph?.assessed) ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-400"
                title={ph?.note}>
                <Info className="h-3.5 w-3.5 text-slate-500" />
                Market leadership:{' '}
                <span className="font-semibold text-slate-200">
                  {String(leadership || ph.assessed).replace(/_/g, ' ')}
                </span>
                <span className="text-slate-600">· observed, read-only</span>
              </span>
            ) : null}
          </div>

          {showDetails ? (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              {available ? (
                <div>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={showMedian}
                      onChange={(e) => setShowMedian(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-amber-400" />
                    <span className="text-[12.5px] leading-relaxed text-slate-300">
                      Show the <span className="font-semibold text-amber-200">{band.medianLabel}</span>
                    </span>
                  </label>
                  <p className="mt-1 max-w-[90ch] pl-6 text-[11.5px] leading-relaxed text-slate-500">
                    {band.medianCaveat}
                  </p>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Method</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-300">
                    Comparable-historical-window analysis. Strictly trailing features, purged
                    matching, and only days whose full forward window already happened.
                  </p>
                  <p className="mt-1 font-mono text-[10.5px] text-slate-500">{outlook?.modelVersion || band?.modelVersion || '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Uncertainty</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-300">
                    Empirical percentiles of matched historical forward returns. It is a spread
                    of past outcomes, not a confidence interval, and no probability is asserted.
                  </p>
                </div>
              </div>
              <Limitations items={(outlook?.meta?.limitations || []).concat(band?.sampleLimitations || [])} />
              {ph?.note ? <p className="text-[11px] leading-relaxed text-slate-500">{ph.note}</p> : null}
            </div>
          ) : null}
        </>
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;
  return (
    <Card className="border-0 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/30 p-4 ring-1 ring-sky-500/20 sm:p-5">
      {body}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2.5">
        <StatusBadge status={outlook?.meta?.status} />
        <p className="text-[10.5px] text-slate-600">
          Read-only. Nothing on this chart creates a proposal, an order, a stop, a mode change
          or a strategy change.
        </p>
      </div>
    </Card>
  );
}
