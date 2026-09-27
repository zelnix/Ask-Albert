'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

// Legacy chat drafts are reviewed in Studio; this card never creates a second
// tracked strategy or a separate paper wallet.
export default function BasketChatCard({ draft }) {
  const legs = (draft && draft.legs) || [];
  if (!legs.length) return null;
  const reviewInStudio = () => {
    const plan = [draft.title || 'Multi-coin strategy', draft.thesis || '',
      ...legs.map((l) => `${l.symbol} ${l.weight_pct}% ${l.position || 'long'}.`),
      `Original complete chat draft (including horizon, targets, stops and every rule): ${JSON.stringify(draft)}`].join('\n');
    window.dispatchEvent(new CustomEvent('albert:build-strategy', {
      detail: { symbol: legs[0]?.symbol || 'BTC', seed: plan },
    }));
  };

  return (
    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-semibold text-slate-100">{draft.title || 'Multi-Coin Strategy'}</p>
        <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
          {legs.length} legs · {draft.horizon_days || 30}d
        </span>
      </div>
      <div className="space-y-1">
        {legs.map((l, i) => {
          const long = (l.position || 'long') === 'long';
          return (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-900/60 px-2.5 py-1.5 text-[12px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-200">
                {long ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-400" />}
                {l.symbol}
                <span className={long ? 'text-emerald-400' : 'text-rose-400'}>{long ? 'Long' : 'Short'}</span>
              </span>
              <span className="text-slate-400">{Math.round(l.weight_pct || 0)}%</span>
            </div>
          );
        })}
      </div>
      <button onClick={reviewInStudio}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500 to-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90">
        Review in Strategy Studio
      </button>
    </div>
  );
}
