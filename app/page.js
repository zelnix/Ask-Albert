'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, LineChart, Area, Bar, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  ScatterChart, Scatter, ReferenceLine, ReferenceDot, ZAxis,
} from 'recharts';
import {
  TrendingUp, TrendingDown, RefreshCw, Activity, Gauge, Waves, BarChart3,
  ArrowUpRight, ArrowDownRight, Cpu, Database, Trophy, Radio, History,
  Check, X, LayoutDashboard, Target, FlaskConical, Bell, MessageCircle,
  Sparkles, Info, Lock, Compass, CandlestickChart, Layers, Landmark, Globe, Newspaper,
  Brain, Send, ShieldAlert, Scale, CalendarClock, ClipboardList, ShieldCheck,
  Volume2, VolumeX, Maximize2, Minimize2, SlidersHorizontal, Magnet, Plus, Clock,
  ChevronDown, Coins, Fish, Zap, Loader2, LogOut, MessageSquarePlus, Copy, Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_BASE, getPid, getReadingLevel, setReadingLevel } from './lib/api';
import { fmtUsd, fmtAud, fmtPct, CAT_COLORS, BAR_COLORS, scoreColor, signalText, TF_TOUCH, sigHex, sigColor, shortDate, riskColor, countdown, f24, fBy, DIR_COLOR, corrColor } from './lib/format';
import { SymbolContext } from './lib/context';
import { useFetch } from './lib/useFetch';
import FloatingAlbert from './components/FloatingAlbert';
import PublishStamp from './components/PublishStamp';
import StrategiesBriefing from './components/StrategiesBriefing';
import AlbertText from './components/AlbertText';
import CopyButton from './components/CopyButton';
import ThreadMenu from './components/ThreadMenu';
import { useAlbertChat, chatToText } from './lib/chatStore';
import HomePage from './components/HomePage';
import { fetchMe, logout as authLogout, rememberUser } from './lib/auth';
import { hydrateVoicePrefFromServer } from './lib/albertVoice';
import AlbertReplyMeta from './components/AlbertReplyMeta';
import BasketChatCard from './components/BasketChatCard';
import BasketRebalanceCard from './components/BasketRebalanceCard';
import BasketCloseCard from './components/BasketCloseCard';
import MandateChangeCard from './components/MandateChangeCard';
import MicButton from './components/MicButton';
import PortfolioPanel from './components/PortfolioPanel';
import AlbertTrackRecord from './components/AlbertTrackRecord';
import AlertManager from './components/AlertManager';
import WeeklyRecap from './components/WeeklyRecap';
import { WeeklyBriefCard } from './components/WeeklyBrief';
import TraderHome from './components/TraderHome';
import MarketDrivers from './components/MarketDrivers';
import DiagnosticsCheckup from './components/DiagnosticsCheckup';
import PaperTradingBot from './components/PaperTradingBot';
import AlbertHome from './components/AlbertHome';
import OneScreenHome, { HomeTicker } from './components/one-screen/OneScreenHome';
import ConsolidatedDetail, { DASHBOARD_AREAS } from './components/one-screen/ConsolidatedDetail';
import MetricProvenance, { observed } from './components/MetricProvenance';
import GlobalMenu from './components/one-screen/GlobalMenu';
import useOneScreenData from './components/one-screen/useOneScreenData';
import { ScenarioEvaluation, OpportunityResearch } from './components/one-screen/DetailScreens';
import AskAlbert from './components/AskAlbert';
import StrategyStudio from './components/StrategyStudio';
import PaperEngineTechnical from './components/PaperEngineTechnical';

import DailyReportModal from './components/DailyReport';
import { SECTIONS, LEGACY_SECTIONS, sec, REMOVED_SECTIONS, PRIMARY_NAV, TECH_GROUPS, PRIMARY_IDS } from './lib/sections';
import { speakAlbert, stopAlbert, prefetchAlbert, getVoicePref, setVoicePref, previewVoice } from './lib/albertVoice';
import { CoinIcon, Shimmer, ChartTooltip, QuantGauge, InfoBlock, InfoTip, TapInfo, AiReview, SectionHead, Spark, LevGauge, ComingSoonSection } from './components/shared';
import AlertEngineSection from './components/AlertEngine';
import AnalogsSection from './components/Analogs';
import CrossMarketSection from './components/CrossMarket';
import RiskSection from './components/Risk';
import LeverageSection from './components/Leverage';
import WhaleWatch, { EtfFlowsCard } from './components/Whales';
import ScorecardSection from './components/Scorecard';
import DataAuditSection from './components/DataAudit';
import DrawableChart from './components/DrawableChart';
import TimeMachineSection from './components/TimeMachine';
import NewsSection from './components/News';
import ForecastsHubSection from './components/Forecasts';
import MarketIntelligenceSection from './components/MarketIntel';

/* ------------------------------ helpers ------------------------------ */

// Real coin logo (keyless jsDelivr CDN). Falls back to a text badge if the image is missing.

const CAT_COLORS_UNUSED_PLACEHOLDER = null; // (CAT_COLORS/BAR_COLORS/scoreColor/signalText moved to lib/format)

// SymbolContext moved to lib/context (imported at top).

/* --------------------------- Error Boundary ------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Ask Albert ErrorBoundary caught:', this.props.label || '', error, info);
  }
  componentDidUpdate(prevProps) {
    // Reset the boundary when the key context (e.g. active section) changes.
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) {
      if (this.props.silent) return null;
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5 text-sm">
          <p className="font-semibold text-amber-300">This panel hit a snag{this.props.label ? ` (${this.props.label})` : ''}.</p>
          <p className="mt-1 text-slate-400">The rest of Ask Albert is still live. You can retry just this panel.</p>
          <button onClick={() => this.setState({ hasError: false })}
            className="mt-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* --------------------------- Loading Skeleton ----------------------- */

function DashboardSkeleton({ ticker }) {
  const navRows = Array.from({ length: 12 });
  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40 px-4 py-5 md:flex">
        <img src="/ask-albert-logo.png" alt="Ask Albert" className="mb-1 h-20 w-auto object-contain" />
        <div className="mb-6 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-center text-[11px] font-bold uppercase tracking-[0.18em] text-transparent">Hucentai Crypto IQ</div>
        <div className="space-y-1.5">
          {navRows.map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
              <Shimmer className="h-4 w-4 rounded" />
              <Shimmer className="h-3.5" style={{ width: `${55 + ((i * 7) % 35)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <Shimmer className="mb-2 h-3 w-20" />
          <Shimmer className="h-6 w-16" />
        </div>
      </aside>
      {/* Main */}
      <div className="flex-1">
        {/* Top bar with LIVE price (progressive hydration) */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3 md:px-8">
          <Shimmer className="h-8 w-24 rounded-lg" />
          {ticker && ticker.price ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />LIVE</span>
              <span className="text-lg font-bold text-white">{fmtUsd(ticker.price)}</span>
              {ticker.price_aud && <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-300">≈ {fmtAud(ticker.price_aud)}</span>}
              {typeof ticker.change24h === 'number' && <span className={`text-sm font-semibold ${ticker.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{ticker.change24h}%</span>}
            </div>
          ) : (
            <Shimmer className="h-6 w-40" />
          )}
          <div className="ml-auto flex items-center gap-2">
            <Shimmer className="h-8 w-8 rounded-lg" />
            <Shimmer className="h-8 w-20 rounded-lg" />
          </div>
        </div>
        {/* Overview-shaped skeleton */}
        <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
          <div className="flex items-center gap-3">
            <Shimmer className="h-8 w-8 rounded-lg" />
            <Shimmer className="h-6 w-40" />
          </div>
          {/* Albert review card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="mb-3 flex items-center gap-2"><Shimmer className="h-9 w-9 rounded-full" /><Shimmer className="h-4 w-32" /></div>
            <Shimmer className="mb-2 h-3 w-full" /><Shimmer className="mb-2 h-3 w-[92%]" /><Shimmer className="h-3 w-[70%]" />
          </div>
          {/* KPI tiles row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <Shimmer className="mb-2 h-3 w-16" />
                <Shimmer className="mb-1 h-7 w-14" />
                <Shimmer className="h-3 w-20" />
              </div>
            ))}
          </div>
          {/* Chart + side panel */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
              <Shimmer className="mb-4 h-4 w-48" />
              <Shimmer className="h-56 w-full rounded-lg" />
            </div>
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <Shimmer className="h-4 w-32" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3"><Shimmer className="h-8 w-8 rounded-lg" /><div className="flex-1"><Shimmer className="mb-1 h-3 w-full" /><Shimmer className="h-3 w-[60%]" /></div></div>
              ))}
            </div>
          </div>
          <p className="pt-2 text-center text-xs text-slate-600">Building your live Bitcoin intelligence… core price is already live above.</p>
        </main>
      </div>
    </div>
  );
}

/* --------------------------- small components ------------------------ */

/* ---------------------------- AI reviews ----------------------------- */

function reviewOverview(d) {
  const f = f24(d);
  const lean = f ? (f.higher >= f.lower ? 'higher' : 'lower') : 'sideways';
  return `${d.coin_name || 'Bitcoin'}'s overall Quant Score is ${d.quant_score}/100 — ${d.quant_label} — and the market is in a "${d.regime.regime}" regime. ${d.regime.description} ${f ? `Over the next 24 hours the model leans ${lean} (${f.higher}% up vs ${f.lower}% down) with ${f.confidence.toLowerCase()} confidence.` : ''} Biggest support: ${d.factors.bullish[0]} Main risk: ${d.factors.risk[0]}`;
}
function reviewPerformance(d) {
  const sb = d.scoreboard;
  const edge = (sb.winRate - 50).toFixed(1);
  const streak = sb.currentStreak >= 0 ? `${sb.currentStreak} correct in a row` : `${Math.abs(sb.currentStreak)} wrong in a row`;
  return `Across ${sb.total} graded out-of-sample predictions the engine is right ${sb.winRate}% of the time — ${edge >= 0 ? `+${edge}` : edge} points versus a coin-flip — with a best run of ${sb.bestWinStreak} straight wins and currently ${streak}. These are honest, non-deleted results. Forward-live tracking has ${d.live_record.tracked} signal(s) logged and grades automatically as each new daily candle closes${d.live_record.winRate != null ? ` (live hit-rate ${d.live_record.winRate}%)` : ''}.`;
}
/* --------------------------- sections -------------------------------- */
const riskRing = (lvl) => ({
  Low: 'ring-emerald-500/30', Moderate: 'ring-lime-500/30', Elevated: 'ring-amber-500/30',
  High: 'ring-orange-500/30', Extreme: 'ring-red-500/30',
}[lvl] || 'ring-slate-800');
const alignColor = (a) => (a || '').includes('Bullish') ? 'text-emerald-400'
  : (a || '').includes('Bearish') ? 'text-red-400'
  : (a || '').includes('Conflict') ? 'text-amber-400' : 'text-slate-300';

function TechnicalBreakdownLink({ d, dec }) {
  const [open, setOpen] = React.useState(false);
  const fc = d.forecasts || [];
  return (
    <span className="mt-3 inline-block">
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 underline decoration-sky-500/40 underline-offset-2 transition-colors hover:text-sky-300">
        <Brain className="h-3.5 w-3.5" />Want the more technical summary? Open the breakdown
      </button>
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="max-h-[86vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-sky-500/40" />
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">Technical Breakdown</h3>
                <p className="text-[11px] text-slate-500">The numbers behind Albert’s bottom line · probability, not certainty</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-lg bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Overall</p><p className="text-xl font-black" style={{ color: scoreColor(dec.overall_score) }}>{dec.overall_score}<span className="text-xs font-medium text-slate-500">/100</span></p><p className="text-[11px] text-slate-400">{dec.label}</p></div>
              <div className="rounded-lg bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Regime</p><p className="text-sm font-bold leading-tight text-white">{dec.regime}</p></div>
              <div className="rounded-lg bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Risk</p><p className={`text-xl font-black ${riskColor(dec.risk_level)}`}>{dec.risk_level}</p><p className="text-[11px] text-slate-500">index {dec.risk_score}/100</p></div>
              <div className="rounded-lg bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Alignment</p><p className={`text-sm font-bold leading-tight ${alignColor(dec.alignment)}`}>{dec.alignment}</p></div>
            </div>

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Signal composition</p>
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2 text-left font-medium">Signal group</th><th className="px-3 py-2 text-right font-medium">Score /100</th><th className="px-3 py-2 text-right font-medium">Weight</th></tr></thead>
                <tbody>
                  {(dec.components || []).map((c) => (
                    <tr key={c.name} className="border-t border-slate-800/70">
                      <td className="px-3 py-2 text-slate-300">{c.name}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: scoreColor(c.score) }}>{c.score}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{c.weight}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {fc.length > 0 && (<>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Directional odds & invalidation</p>
              <div className="overflow-hidden rounded-lg border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2 text-left font-medium">Horizon</th><th className="px-3 py-2 text-right font-medium">Higher</th><th className="px-3 py-2 text-right font-medium">Confidence</th><th className="px-3 py-2 text-right font-medium">Backtest</th><th className="px-3 py-2 text-right font-medium">Invalidated</th></tr></thead>
                  <tbody>
                    {fc.map((f) => (
                      <tr key={f.horizon} className="border-t border-slate-800/70">
                        <td className="px-3 py-2 font-semibold text-slate-200">{f.horizon}</td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: scoreColor(f.higher) }}>{f.higher}%</td>
                        <td className="px-3 py-2 text-right text-slate-300">{f.confidence} ({f.confidence_pct}%)</td>
                        <td className="px-3 py-2 text-right text-slate-400">{f.accuracy}%</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-400">{f.invalidation_dir} {fmtUsd(f.invalidation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Model & data</p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {d.cv_mean != null && <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-slate-300">Cross-val accuracy {d.cv_mean}% · {d.n_samples} days</span>}
              {d.scoreboard && <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-slate-300">Live win rate {d.scoreboard.winRate}% ({d.scoreboard.total} graded)</span>}
              {dec.data_trust && <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-slate-300">Data trust {dec.data_trust.score}/100{dec.odds_faded ? ' · odds faded' : ''}</span>}
              <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-slate-300">Quant Score {d.quant_score}/100</span>
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-slate-500">Every figure is derived from real market data and historical base rates. These are probabilities and research signals — not financial advice or a guarantee of future outcomes.</p>
          </div>
        </div>
      )}
    </span>
  );
}

const REGIME_META = {
  bull_momentum: { label: 'Bull Momentum', color: '#34d399', ring: 'ring-emerald-500/30', bar: 'bg-emerald-400' },
  bear_distribution: { label: 'Bear Distribution', color: '#f87171', ring: 'ring-red-500/30', bar: 'bg-red-400' },
  consolidation: { label: 'Low-Vol Consolidation', color: '#94a3b8', ring: 'ring-slate-500/30', bar: 'bg-slate-400' },
  high_vol_squeeze: { label: 'High-Vol Squeeze', color: '#fbbf24', ring: 'ring-amber-500/30', bar: 'bg-amber-400' },
};

function RegimeSwitchPanel({ re }) {
  if (!re || !re.available) return null;
  const meta = REGIME_META[re.current_regime] || REGIME_META.consolidation;
  const probs = re.regime_probabilities || {};
  const cone = re.confidence_24h || {};
  const order = ['bull_momentum', 'consolidation', 'bear_distribution', 'high_vol_squeeze'];
  return (
    <div className={`mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4 ring-1 ${meta.ring}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="h-4 w-4" style={{ color: meta.color }} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Regime-Switching Engine</p>
        <InfoTip text="A 4-state Gaussian HMM classifies the current market regime from daily returns and volatility, then blends a regime-specific weight matrix into the live signal weights above. The weights re-balance automatically as the regime shifts." />
        <span className="ml-auto rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: meta.color + '55', color: meta.color }}>
          {meta.label} · {Math.round((probs[re.current_regime] || 0) * 100)}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {order.map((k) => {
          const m = REGIME_META[k];
          const p = Math.round((probs[k] || 0) * 100);
          const active = k === re.current_regime;
          return (
            <div key={k} className={`rounded-lg border p-2 ${active ? 'border-slate-600 bg-slate-900/70' : 'border-slate-800 bg-slate-950/40'}`}>
              <p className="truncate text-[10px] font-medium text-slate-400">{m.label}</p>
              <p className="text-lg font-black" style={{ color: m.color }}>{p}%</p>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {cone.expected_pct != null && (
        <p className="mt-3 text-[11px] text-slate-400">
          Regime-scaled 24h cone:
          <span className="ml-1 font-mono text-red-400">{cone.lower_pct}%</span>
          <span className="mx-1 text-slate-600">·</span>
          <span className="font-mono text-slate-200">exp {cone.expected_pct}%</span>
          <span className="mx-1 text-slate-600">·</span>
          <span className="font-mono text-emerald-400">+{cone.upper_pct}%</span>
          <span className="ml-2 text-slate-600">(σ {cone.sigma_daily_pct}%/day)</span>
        </p>
      )}
    </div>
  );
}

function ScenarioPlaybook({ sb }) {
  if (!sb || !sb.scenarios) return null;
  const bull = sb.scenarios.find((s) => s.type === 'bull');
  const bear = sb.scenarios.find((s) => s.type === 'bear');
  const c = sb.contradiction || {};
  const Card2 = (s, accent) => (
    <div className={`rounded-xl border bg-slate-950/50 p-4 ${accent === 'bull' ? 'border-emerald-500/25' : 'border-red-500/25'}`}>
      <div className="flex items-center gap-2">
        {accent === 'bull' ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <ArrowDownRight className="h-4 w-4 text-red-400" />}
        <p className={`text-sm font-bold ${accent === 'bull' ? 'text-emerald-300' : 'text-red-300'}`}>{s.label}</p>
        <span className="ml-auto rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-200">{s.probability}%</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-slate-200"><span className="text-slate-500">IF </span>{s.trigger}</p>
      <p className="mt-1 text-[13px] leading-snug text-slate-200"><span className="text-slate-500">THEN </span>target <span className={`font-bold ${accent === 'bull' ? 'text-emerald-300' : 'text-red-300'}`}>{s.target}</span> <span className="text-slate-500">({s.move_pct > 0 ? '+' : ''}{s.move_pct}%)</span></p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{s.rationale}</p>
    </div>
  );
  return (
    <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Albert's Scenario Playbook</p>
        <InfoTip text="Actionable If-Then triggers with concrete price levels, targets and data-derived probabilities. Levels come from the chart's support/resistance; probabilities blend historical breakout/breakdown base rates with the current regime." />
        <span className="ml-auto text-[11px] text-slate-500">spot ${sb.price?.toLocaleString?.() || sb.price}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {bull && Card2(bull, 'bull')}
        {bear && Card2(bear, 'bear')}
      </div>
      <div className={`mt-3 rounded-lg border p-3 text-[12px] leading-relaxed ${c.present ? (c.winner === 'bullish' ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-100' : 'border-red-500/25 bg-red-500/[0.06] text-red-100') : 'border-slate-800 bg-slate-900/40 text-slate-300'}`}>
        <span className="font-semibold uppercase tracking-wider text-slate-400">{c.present ? 'Conflict resolution · ' : 'Alignment · '}</span>{c.summary}
      </div>
    </div>
  );
}

function DecisionEngineCard({ d }) {
  const dec = d.decision;
  if (!dec) return null;
  const coinName = d.coin_name || 'Bitcoin';
  const sym = d.symbol || 'BTC';
  return (
    <Card className="border-0 bg-gradient-to-br from-amber-500/[0.07] via-violet-500/[0.08] to-slate-900 p-6 ring-1 ring-violet-500/30 shadow-xl shadow-violet-950/30">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Brain className="h-5 w-5 text-amber-400" />
        <h3 className="text-lg font-bold text-white">{coinName} Market State</h3>
        <span className="text-[11px] text-slate-500">Unified Decision Engine · reconciles every signal</span>
        {dec.data_trust && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dec.data_trust.faded ? 'border-orange-500/30 text-orange-300' : 'border-emerald-500/25 text-emerald-300'}`}>Data trust {dec.data_trust.score}{dec.odds_faded ? ' · odds faded' : ''}</span>}
        <Badge variant="outline" className={`ml-auto border-slate-700 ${alignColor(dec.alignment)}`}>{dec.alignment}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TapInfo below text="The single 0–100 conviction score blending every signal group. Above 55 leans bullish, below 45 bearish, near 50 is undecided." className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="pr-4 text-[11px] uppercase tracking-wider text-slate-400">Overall Score</p>
          <p className="mt-1 text-4xl font-black" style={{ color: scoreColor(dec.overall_score) }}>{dec.overall_score}</p>
          <p className="text-sm font-semibold" style={{ color: scoreColor(dec.overall_score) }}>{dec.label}</p>
        </TapInfo>
        <TapInfo below text={`The market character the engine has classified ${sym} into right now (e.g. trend, range, or volatile) — it sets the playbook for reading every other signal.`} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="pr-4 text-[11px] uppercase tracking-wider text-slate-400">Market Regime</p>
          <p className="mt-1 text-lg font-bold leading-tight text-white">{dec.regime}</p>
        </TapInfo>
        <TapInfo below text="How turbulent conditions are now (0–100 risk index). It's about the size of the swings, not their direction — you can lean up and still be high-risk." className={`rounded-xl border border-slate-800 bg-slate-950/50 p-4 ring-1 ${riskRing(dec.risk_level)}`}>
          <p className="flex items-center gap-1 pr-4 text-[11px] uppercase tracking-wider text-slate-400"><ShieldAlert className="h-3 w-3" />Risk Level</p>
          <p className={`mt-1 text-2xl font-black ${riskColor(dec.risk_level)}`}>{dec.risk_level}</p>
          <p className="text-[11px] text-slate-500">risk index {dec.risk_score}/100</p>
        </TapInfo>
        <TapInfo below text="Whether the signal groups agree. 'Mixed' means they disagree so conviction is lower; strong alignment means they point the same way." className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="flex items-center gap-1 pr-4 text-[11px] uppercase tracking-wider text-slate-400"><Scale className="h-3 w-3" />Signal Alignment</p>
          <p className={`mt-1 text-sm font-bold leading-tight ${alignColor(dec.alignment)}`}>{dec.alignment}</p>
        </TapInfo>
      </div>

      {/* component contributions */}
      <div className="mt-4 flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Signal Groups</p>
        {dec.weights_mode === 'dynamic' && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">Dynamic weights</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        {dec.components.map((c) => (
          <div key={c.name} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-slate-400">{c.name}<InfoTip text={`${c.name} scores 0–100 and currently carries ${c.weight}% of the overall decision — this weight now shifts with the detected market regime. Higher score = more supportive of upside.`} /></span>
              <span className="font-mono font-bold" style={{ color: scoreColor(c.score) }}>{c.score}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full" style={{ width: `${c.score}%`, backgroundColor: scoreColor(c.score) }} />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">weight {c.weight}%</p>
          </div>
        ))}
      </div>

      {/* Dynamic Regime-Switching (Gaussian HMM) */}
      <RegimeSwitchPanel re={dec.regime_engine} />

      {/* Albert's If-Then scenario playbook + contradiction resolution */}
      <ScenarioPlaybook sb={dec.scenarios_block} />


      {/* multi-horizon outlook 24H → 1Y */}
      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Directional Outlook · 24 hours to 1 year<InfoTip text={`The model's estimated odds that ${sym} is higher or lower over each horizon. 'news-adj.' means recent headlines nudged the number. Odds, not promises.`} /></p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {dec.outlook.map((o) => {
            const up = o.lean === 'UP';
            return (
              <div key={o.horizon} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center">
                <p className="text-[11px] font-medium text-slate-400">{o.label}</p>
                <p className={`mt-1 flex items-center justify-center gap-1 text-lg font-black ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{Math.max(o.higher, o.lower)}%
                </p>
                <p className={`text-[10px] ${up ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{up ? 'higher' : 'lower'}</p>
                {o.news_adjusted && <p className="mt-0.5 text-[9px] text-violet-400/80">news-adj.</p>}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function timeAgo(iso) {
  if (!iso) return '—';
  const t = Date.now() - new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const m = Math.floor(t / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const RISK_TXT = {
  Low: 'text-emerald-400', Normal: 'text-lime-400', Moderate: 'text-lime-400',
  Elevated: 'text-amber-400', High: 'text-orange-400', Extreme: 'text-red-400',
};

function ModelConfidenceChip({ fallback }) {
  // Self-fetches /v1/drift (which carries confidence_level + circuit_breaker) and
  // polls so the chip stays live even when the cached dashboard payload is stale
  // (e.g. right after the admin breaker-demo toggle flips).
  const [drift, setDrift] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const tick = () => fetch(`${API_BASE}/v1/drift`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (alive) setDrift(j); }).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const breaker = drift ? !!drift.circuit_breaker : !!(fallback?.circuit_breaker?.active);
  const level = drift ? drift.confidence_level : fallback?.confidence_level;
  if (breaker) {
    return <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-300 ring-1 ring-red-500/30">⚠ Circuit breaker · rule-based fallback</span>;
  }
  if (level && level !== 'Normal') {
    return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300 ring-1 ring-amber-500/30">Model: {level}</span>;
  }
  if (level) {
    return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">Model: Healthy</span>;
  }
  return null;
}

// Global Simple/Pro reading-level switch (persists to localStorage, broadcasts a window event).
function ReadingLevelToggle() {
  const [level, setLevel] = React.useState('simple');
  React.useEffect(() => { setLevel(getReadingLevel()); }, []);
  const choose = (v) => { setLevel(v); setReadingLevel(v); };
  return (
    <div className="flex items-center rounded-full bg-slate-800 p-0.5 text-[10px] font-semibold" title="Reading level for Albert's briefs & insights">
      <button onClick={() => choose('simple')} className={`rounded-full px-2 py-0.5 transition-colors ${level !== 'pro' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Simple</button>
      <button onClick={() => choose('pro')} className={`rounded-full px-2 py-0.5 transition-colors ${level === 'pro' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Pro</button>
    </div>
  );
}

// Play a short, pleasant two-note chime via the Web Audio API (no asset needed).
function playAlertChime() {
  try {
    const Ctx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.start(t); o.stop(t + 0.34);
    });
    setTimeout(() => { try { ctx.close(); } catch (e) { /* noop */ } }, 1000);
  } catch (e) { /* noop */ }
}

// A softer, warmer chime for Albert's daily-brief notifications (distinct from the
// brighter market-alert chime above) — a gentle low-to-high two-note.
function playBriefChime() {
  try {
    const Ctx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    [523.25, 783.99].forEach((f, i) => { // C5 -> G5
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.start(t); o.stop(t + 0.58);
    });
    setTimeout(() => { try { ctx.close(); } catch (e) { /* noop */ } }, 1200);
  } catch (e) { /* noop */ }
}

const NOTIFIED_KEY = 'btciq_notified_ids';
const SOUND_KEY = 'btciq_notif_sound';

function NudgeApplyButton({ alert, onApplied }) {
  const [state, setState] = React.useState('idle'); // idle | applying | done | error
  const apply = async (e) => {
    e.stopPropagation();
    if (state === 'applying' || state === 'done') return;
    setState('applying');
    try {
      const r = await fetch(`${API_BASE}/v1/albert/strategy/basket/${alert.basket_id}/rebalance-apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const j = await r.json();
      if (j && j.status === 'ready') { setState('done'); if (onApplied) onApplied(); }
      else setState('error');
    } catch (err) { setState('error'); }
  };
  return (
    <button onClick={apply} disabled={state === 'applying' || state === 'done'}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-70 ${
        state === 'done' ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'bg-violet-600 text-white hover:bg-violet-500'
      }`}>
      {state === 'done' ? (<><Check className="h-3 w-3" />Rebalance applied</>)
        : state === 'applying' ? (<><Loader2 className="h-3 w-3 animate-spin" />Applying…</>)
        : state === 'error' ? (<><Scale className="h-3 w-3" />Retry apply</>)
        : (<><Scale className="h-3 w-3" />Apply Albert's rebalance</>)}
    </button>
  );
}

function NotificationBell({ alertsData, onAck, onViewAll, onOpenBrief, onNavSection }) {
  const [open, setOpen] = React.useState(false);
  const [perm, setPerm] = React.useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [soundOn, setSoundOn] = React.useState(true);
  const notified = React.useRef(new Set());
  const hydrated = React.useRef(false);
  const alerts = (alertsData && alertsData.alerts) || [];
  const unseen = (alertsData && alertsData.unseen) || 0;

  // Hydrate the "already-notified" set + sound preference from localStorage so a
  // page reload (or a second device visiting later) never re-fires push/chime for
  // alerts the user has already been shown. This is the persistent read-state.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NOTIFIED_KEY);
      if (raw) JSON.parse(raw).forEach((id) => notified.current.add(id));
      setSoundOn(window.localStorage.getItem(SOUND_KEY) !== 'off');
    } catch (e) { /* noop */ }
    hydrated.current = true;
  }, []);

  const persistNotified = React.useCallback(() => {
    try {
      const arr = Array.from(notified.current).slice(-200); // cap the history
      window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr));
    } catch (e) { /* noop */ }
  }, []);

  React.useEffect(() => {
    // Wait until the persisted set is hydrated so we don't treat the backlog as "new".
    if (!hydrated.current) return;
    const note = ['high', 'critical', 'warning'];
    const fresh = alerts.filter((a) => a.id && !notified.current.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => notified.current.add(a.id));
    persistNotified();
    const briefs = fresh.filter((a) => a.category === 'daily_brief');
    const meaningful = fresh.filter((a) => note.includes(a.severity)).slice(0, 3);
    // Browser push: fire an OS notification for new, meaningful market alerts + briefs.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      [...meaningful, ...briefs.slice(0, 3)].forEach((a) => {
        try { new Notification(`Ask Albert · ${a.title}`, { body: a.message, icon: '/ask-albert-logo.png', tag: a.id }); } catch (e) { /* noop */ }
      });
    }
    // Audible chime (respecting the user's mute preference) — briefs get a gentler tone.
    if (soundOn) {
      if (meaningful.length > 0) playAlertChime();
      else if (briefs.length > 0) playBriefChime();
    }
  }, [alerts, soundOn, persistNotified]);

  const toggleSound = () => {
    setSoundOn((s) => {
      const next = !s;
      try { window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch (e) { /* noop */ }
      if (next) playAlertChime();
      return next;
    });
  };

  const askPerm = async () => {
    try { const p = await Notification.requestPermission(); setPerm(p); } catch (e) { /* noop */ }
  };
  const sevColor = (s) => (s === 'critical' || s === 'high' ? '#f87171' : s === 'warning' || s === 'medium' ? '#fbbf24' : s === 'success' ? '#34d399' : '#38bdf8');
  const rel = (ts) => {
    try { const m = Math.max(0, (Date.now() - new Date(ts + 'Z').getTime()) / 60000); return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; } catch (e) { return ''; }
  };

  return (
    <div className="relative ml-auto">
      <button onClick={() => setOpen((o) => !o)} title="Notifications"
        className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200">
        <Bell className="h-5 w-5" />
        {unseen > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unseen > 9 ? '9+' : unseen}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[92vw] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <div className="flex items-center gap-2">
                <ReadingLevelToggle />
                <button onClick={toggleSound} title={soundOn ? 'Mute alert sound' : 'Unmute alert sound'}
                  className={`rounded-md p-1 transition-colors ${soundOn ? 'text-sky-400 hover:text-sky-300' : 'text-slate-500 hover:text-slate-300'}`}>
                  {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
                {unseen > 0 && <button onClick={() => onAck()} className="text-[11px] font-semibold text-sky-400 hover:text-sky-300">Mark all read</button>}
              </div>
            </div>
            {perm !== 'granted' && perm !== 'unsupported' && (
              <button onClick={askPerm} className="flex w-full items-center gap-2 border-b border-slate-800 bg-sky-500/10 px-3 py-2 text-left text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20">
                <Bell className="h-3.5 w-3.5" />Enable browser alerts (pop-ups even when the tab is in the background)
              </button>
            )}
            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-500">No notifications yet.</p>
              ) : alerts.slice(0, 10).map((a) => {
                const isBrief = a.category === 'daily_brief';
                const isAlbertFeed = a.category === 'flip' || a.category === 'fill' || a.category === 'recovery';
                const isRebalNudge = a.action === 'basket_rebalance' && a.basket_id;
                const onClickItem = () => {
                  setOpen(false);
                  if (a.id) onAck([a.id]);
                  if (isBrief && onOpenBrief) onOpenBrief(a.symbol || 'BTC');
                  else if (isAlbertFeed && onNavSection) onNavSection(a.action || 'strategies');
                  else onViewAll();
                };
                const inner = (
                  <>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(a.severity) }} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-200"><span className="truncate">{a.title}</span><span className="shrink-0 text-[10px] font-normal text-slate-500">{rel(a.ts)}</span></p>
                      <p className="line-clamp-2 text-[11px] text-slate-400">{a.message}</p>
                      {isBrief && <span className="mt-0.5 inline-block text-[10px] font-semibold text-sky-400">Open {a.symbol || 'BTC'} brief →</span>}
                    </div>
                  </>
                );
                if (isRebalNudge) {
                  return (
                    <div key={a.id} className={`border-b border-slate-800/60 ${a.seen ? 'opacity-60' : ''}`}>
                      <button onClick={onClickItem} className="flex w-full gap-2 px-3 pt-2 text-left transition-colors hover:bg-slate-800/50">{inner}</button>
                      <div className="px-3 pb-2 pl-7"><NudgeApplyButton alert={a} onApplied={() => { if (a.id) onAck([a.id]); }} /></div>
                    </div>
                  );
                }
                return (
                  <button key={a.id} onClick={onClickItem}
                    className={`flex w-full gap-2 border-b border-slate-800/60 px-3 py-2 text-left transition-colors hover:bg-slate-800/50 ${a.seen ? 'opacity-60' : ''}`}>
                    {inner}
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setOpen(false); onViewAll(); }} className="w-full border-t border-slate-800 px-3 py-2 text-center text-[12px] font-semibold text-sky-400 hover:bg-slate-800/50">View all alerts →</button>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationSettings() {
  const [perm, setPerm] = React.useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch (e) { /* noop */ } };
  return (
    <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-white"><Bell className="h-4 w-4 text-sky-400" />Notifications</h3>
      <p className="mb-3 text-xs text-slate-500">Alerts (regime flips, liquidation cascades, basis reclaims, whale moves, model circuit-breaker) are delivered <span className="font-semibold text-slate-300">in-app</span> via the bell in the top bar and as <span className="font-semibold text-slate-300">browser pop-ups</span>. Email delivery has been turned off.</p>
      <div className="flex flex-wrap items-center gap-3">
        {perm === 'unsupported' ? (
          <span className="text-xs text-slate-500">Browser notifications aren’t supported here.</span>
        ) : perm === 'granted' ? (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400"><Check className="h-4 w-4" />Browser notifications enabled</span>
        ) : (
          <button onClick={ask} className="rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 px-3 py-1.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:from-sky-400 hover:to-violet-500">Enable browser notifications</button>
        )}
        {perm === 'denied' && <span className="text-[11px] text-amber-400">Blocked in your browser settings — re-allow notifications for this site to receive pop-ups.</span>}
      </div>
    </Card>
  );
}

/* WallAlertToaster removed */


function MiniSpark({ points, height = 20, width = 72 }) {
  const vals = (points || []).map((p) => (p && typeof p.dominance === 'number' ? p.dominance : null)).filter((v) => v != null);
  if (vals.length < 2) {
    return <p className="mt-1 text-[9px] italic text-slate-600">building history…</p>;
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = (max - min) || 1;
  const step = width / (vals.length - 1);
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / rng) * (height - 3) - 1.5).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? '#34d399' : '#f87171';
  return (
    <svg width={width} height={height} className="mt-1.5 block" aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StateItem({ label, value, sub, color, big, hint, spark }) {
  return (
    <TapInfo text={hint} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <p className="flex items-center gap-1 pr-4 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 font-black ${big ? 'text-2xl' : 'text-lg'}`} style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
      {spark}
    </TapInfo>
  );
}

function MarketStateHero({ d, ticker }) {
  const ch = ticker?.change24h ?? d.day_change_pct;
  const f24o = f24(d);
  const f7o = fBy(d, '7D');
  const risk = d.risk || {};
  const riskLevel = risk.level || (d.decision && d.decision.risk_level) || '—';
  const dec = d.decision || {};
  const modelConf = f7o?.confidence || f24o?.confidence || '—';
  const dh = d.data_health || {};
  const sym = d.symbol || 'BTC';
  const coinName = d.coin_name || 'Bitcoin';
  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 to-slate-900/60 p-6 ring-1 ring-slate-800">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/5 blur-3xl" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
          {coinName.toUpperCase()} MARKET STATE
        </span>
        <span className="ml-auto text-[11px] text-slate-500">Updated {timeAgo(d.created_at)} · source {d.data_source}</span>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="flex items-center gap-3">
          <CoinIcon symbol={sym} size={44} className="shadow-lg" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{sym} Live Price</p>
            <p className="text-4xl font-black text-white">{fmtUsd(ticker?.price ?? d.last_close)}</p>
            <p className={`text-sm font-semibold ${ch >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {ch >= 0 ? '▲' : '▼'} {ch}% (24h){ticker?.price_aud ? ` · ≈ ${fmtAud(ticker.price_aud)}` : ''}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Market Regime</p>
          <p className="text-2xl font-bold text-sky-300">{d.regime.regime}</p>
          <p className="max-w-md text-xs text-slate-500">{d.regime.description}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <StateItem label="Quant Score" value={`${d.quant_score}`} sub={d.quant_label} color={scoreColor(d.quant_score)} big
          hint={`A 0–100 health score for ${coinName} right now. Above 55 leans positive, below 45 leans negative, near 50 is undecided.`} />
        <StateItem label="24-Hour Outlook" value={f24o ? `${Math.max(f24o.higher, f24o.lower)}%` : '—'} sub={f24o ? (f24o.higher >= f24o.lower ? 'prob. higher' : 'prob. lower') : ''} color={f24o && f24o.higher >= f24o.lower ? '#34d399' : '#f87171'}
          hint={`The model's estimated chance that ${coinName} closes higher (or lower) one day from now. It's odds, not a promise.`} />
        <StateItem label="7-Day Outlook" value={f7o ? `${Math.max(f7o.higher, f7o.lower)}%` : '—'} sub={f7o ? (f7o.higher >= f7o.lower ? 'prob. higher' : 'prob. lower') : ''} color={f7o && f7o.higher >= f7o.lower ? '#34d399' : '#f87171'}
          hint="Same idea as the 24-hour view, but looking one week ahead." />
        <StateItem label="Risk Level" value={riskLevel} sub="how bumpy, not direction" color={undefined}
          hint="How wild price swings could be right now — separate from whether the outlook is up or down. You can be 'leaning up' AND 'high risk' at the same time." />
        <StateItem label="Model Confidence" value={modelConf} sub="how sure the model is" hint="How strong the model's own conviction is, based on how well it has done in similar past setups." />
        <StateItem label="Market Share" value={d.dominance ? `${d.dominance.dominance}%` : '—'}
          sub={d.dominance ? `of $${d.dominance.total_mcap_t}T${d.dominance.direction && d.dominance.direction !== 'Neutral' ? ` · ${d.dominance.direction}` : ''}` : ''}
          spark={d.dominance ? <MiniSpark points={d.dominance.history} /> : null}
          hint={`${coinName}'s share of the total crypto market cap (its "dominance"), with a mini trend of the last few days once history builds up. Rising share means capital is rotating toward it; falling share means the rest of the market is outpacing it.`} />
        <StateItem label="Data Confidence" value={dh.level || '—'} sub={dh.score != null ? `${dh.score}/100 feeds` : ''} hint="How fresh and reliable the underlying data feeds are. If feeds go stale, the odds are automatically toned down." />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${RISK_TXT[riskLevel] || 'text-slate-300'} bg-slate-800/60`}>Risk: {riskLevel}</span>
        {dec.label && <span className="rounded-full bg-slate-800/60 px-2 py-0.5 font-semibold text-slate-300">Decision: {dec.label} ({dec.overall_score}/100)</span>}
        <span className="rounded-full bg-slate-800/60 px-2 py-0.5">Alignment: {dec.alignment || '—'}</span>
        <ModelConfidenceChip fallback={dec} />
        <span className="ml-auto italic">Probability, not certainty — not financial advice.</span>
      </div>
    </Card>
  );
}

function AlbertIntroCard() {
  return (
    <Card className="flex items-start gap-4 border-0 bg-gradient-to-br from-sky-500/5 to-violet-500/5 p-5 ring-1 ring-sky-500/20">
      <img src="/albert.png" alt="Albert" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-sky-500/40" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-white">Albert</h3>
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">Quant Analyst · Market Mentor</span>
        </div>
        <p className="mt-1 text-sm text-slate-300">Albert blends CryptoMarkAI’s live numbers with 100+ years of market wisdom — macro, cycles, on-chain and strategy — and live web search, to be your candid trading companion and sounding board. “Let us examine the evidence — probability is not certainty, and capital preservation comes first.”</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Albert is an original fictional Ask Albert HuCentAI Quant character. He is not based on, and does not represent, any real or other fictional person or character.</p>
      </div>
    </Card>
  );
}

const TV_STUDIES = [
  { id: 'RSI@tv-basicstudies', label: 'RSI' },
  { id: 'MACD@tv-basicstudies', label: 'MACD' },
  { id: 'BB@tv-basicstudies', label: 'Bollinger Bands' },
  { id: 'MASimple@tv-basicstudies', label: 'SMA' },
  { id: 'MAExp@tv-basicstudies', label: 'EMA' },
  { id: 'Stochastic@tv-basicstudies', label: 'Stochastic' },
  { id: 'Volume@tv-basicstudies', label: 'Volume' },
];
const TV_INTERVALS = [['15', '15m'], ['60', '1h'], ['240', '4h'], ['D', '1D'], ['W', '1W']];
const TV_STYLES = [['1', 'Candles'], ['3', 'Line'], ['4', 'Area'], ['8', 'Heikin Ashi']];
const TV_SYMBOLS = ['COINBASE:BTCUSD', 'BINANCE:BTCUSDT', 'BITSTAMP:BTCUSD', 'KRAKEN:XBTUSD'];
const DEFAULT_PRESET = { symbol: 'COINBASE:BTCUSD', interval: 'D', style: '1', studies: ['RSI@tv-basicstudies'] };

function loadPreset() {
  if (typeof window === 'undefined') return DEFAULT_PRESET;
  try {
    const p = JSON.parse(window.localStorage.getItem('btciq_chart_preset'));
    if (p && p.symbol) return { ...DEFAULT_PRESET, ...p };
  } catch (e) { /* noop */ }
  return DEFAULT_PRESET;
}

function TradingViewChart({ height = 460 }) {
  const symbol = React.useContext(SymbolContext);
  const [fs, setFs] = React.useState(false);
  const [cfg, setCfg] = React.useState(false);
  const [preset, setPreset] = React.useState(DEFAULT_PRESET);
  const [draft, setDraft] = React.useState(DEFAULT_PRESET);
  const [saved, setSaved] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => { const p = loadPreset(); setPreset(p); setDraft(p); }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // For altcoins, always follow the selected coin; BTC uses the saved preset symbol.
    const effSymbol = symbol === 'BTC' ? preset.symbol : `COINBASE:${symbol}USD`;
    el.innerHTML = '';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';
    widget.style.width = '100%';
    el.appendChild(widget);
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.type = 'text/javascript';
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true, symbol: effSymbol, interval: preset.interval, timezone: 'Etc/UTC',
      theme: 'dark', style: preset.style, locale: 'en', allow_symbol_change: true,
      hide_side_toolbar: false, withdateranges: true, details: false, hotlist: false,
      calendar: false, studies: preset.studies || [], support_host: 'https://www.tradingview.com',
    });
    el.appendChild(s);
  }, [preset, symbol]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setFs(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleStudy = (id) => setDraft((d) => ({
    ...d, studies: d.studies.includes(id) ? d.studies.filter((x) => x !== id) : [...d.studies, id],
  }));
  const savePreset = () => {
    setPreset(draft);
    if (typeof window !== 'undefined') window.localStorage.setItem('btciq_chart_preset', JSON.stringify(draft));
    setSaved(true); setTimeout(() => setSaved(false), 1800); setCfg(false);
  };
  const resetPreset = () => {
    setDraft(DEFAULT_PRESET); setPreset(DEFAULT_PRESET);
    if (typeof window !== 'undefined') window.localStorage.removeItem('btciq_chart_preset');
  };

  return (
    <Card className={`flex flex-col overflow-hidden border-0 bg-slate-900 p-0 ring-1 ring-slate-800 ${fs ? 'fixed inset-0 z-[100] rounded-none' : ''}`}>
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <CandlestickChart className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">{symbol === 'BTC' ? (preset.symbol.split(':')[1] || 'BTC/USD') : `${symbol}USD`} · Live Chart</span>
          <span className="hidden text-[10px] text-slate-500 sm:inline">TradingView · your saved preset</span>
        </div>
        <div className="flex items-center gap-1.5">
          {saved && <span className="text-[11px] font-semibold text-emerald-400">Preset saved ✓</span>}
          <button onClick={() => { setDraft(preset); setCfg(!cfg); }} className={`${TF_TOUCH} flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${cfg ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}><SlidersHorizontal className="h-3.5 w-3.5" />Preset</button>
          <button onClick={() => setFs(!fs)} className={`${TF_TOUCH} flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white`}>
            {fs ? <><Minimize2 className="h-3.5 w-3.5" />Exit</> : <><Maximize2 className="h-3.5 w-3.5" />Full screen</>}
          </button>
        </div>
      </div>

      {cfg && (
        <div className="border-b border-slate-800 bg-slate-950/60 p-4 text-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Symbol</p>
              <select value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none">
                {TV_SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Timeframe</p>
              <div className="flex flex-wrap gap-1">
                {TV_INTERVALS.map(([v, l]) => <button key={v} onClick={() => setDraft({ ...draft, interval: v })} className={`${TF_TOUCH} rounded px-2 py-1 text-xs ${draft.interval === v ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40' : 'bg-slate-800 text-slate-400'}`}>{l}</button>)}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Style</p>
              <div className="flex flex-wrap gap-1">
                {TV_STYLES.map(([v, l]) => <button key={v} onClick={() => setDraft({ ...draft, style: v })} className={`rounded px-2 py-1 text-xs ${draft.style === v ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40' : 'bg-slate-800 text-slate-400'}`}>{l}</button>)}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Indicators</p>
            <div className="flex flex-wrap gap-1.5">
              {TV_STUDIES.map((st) => (
                <button key={st.id} onClick={() => toggleStudy(st.id)} className={`rounded-full border px-2.5 py-1 text-xs ${draft.studies.includes(st.id) ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-800/60 text-slate-400'}`}>{draft.studies.includes(st.id) ? '✓ ' : ''}{st.label}</button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={savePreset} className="bg-sky-500 hover:bg-sky-400">Save preset</Button>
            <Button size="sm" variant="outline" onClick={resetPreset} className="border-slate-700 text-slate-300 hover:bg-slate-800">Reset</Button>
            <span className="text-[11px] text-slate-500">Saved to this browser · reloads automatically each visit. (Freehand drawings aren’t saved by the free widget.)</span>
          </div>
        </div>
      )}

      <div className="w-full" style={{ height: fs ? 'calc(100vh - 42px)' : height }}>
        <div ref={ref} className="tradingview-widget-container" style={{ height: '100%', width: '100%' }} />
      </div>
    </Card>
  );
}

function OverviewChart({ d }) {
  const [mode, setMode] = React.useState('tv');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 self-start rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-xs">
        <button onClick={() => setMode('tv')} className={`rounded-md px-3 py-1 font-medium ${mode === 'tv' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}>TradingView</button>
        <button onClick={() => setMode('draw')} className={`rounded-md px-3 py-1 font-medium ${mode === 'draw' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}>Draw Board</button>
        <button onClick={() => setMode('news')} className={`rounded-md px-3 py-1 font-medium ${mode === 'news' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}>News map</button>
      </div>
      {mode === 'tv' ? <TradingViewChart /> : mode === 'news' ? <OverviewNewsMap ohlc={d.chart?.ohlc} /> : <DrawableChart ohlc={d.chart?.ohlc} />}
    </div>
  );
}

// ---- Overview "News map": 90d price line with the top news stories as markers ----
function OverviewNewsMap({ ohlc }) {
  const [news] = useFetch(`${API_BASE}/v1/news`);
  const [selected, setSelected] = React.useState(0);
  const data = React.useMemo(() => {
    const arr = ohlc || [];
    const n = arr.length;
    const today = new Date();
    return arr.map((o, i) => {
      const dt = new Date(today.getTime() - (n - 1 - i) * 86400000);
      return { t: o.t, c: o.c, key: dt.toISOString().slice(0, 10) };
    });
  }, [ohlc]);
  const markers = React.useMemo(() => {
    if (!news || news.status !== 'ready' || data.length === 0) return [];
    const firstMs = new Date(data[0].key).getTime();
    return (news.cards || [])
      .slice()
      .sort((a, b) => (b.impact || 0) - (a.impact || 0))
      .slice(0, 6)
      .map((c) => {
        const nd = new Date(c.published);
        if (isNaN(nd.getTime())) return null;
        const ms = nd.getTime();
        let idx = data.findIndex((p) => p.key === nd.toISOString().slice(0, 10));
        let approx = false;
        if (idx === -1) {
          approx = true;
          let best = 0, bestDiff = Infinity;
          data.forEach((p, i) => { const diff = Math.abs(new Date(p.key).getTime() - ms); if (diff < bestDiff) { bestDiff = diff; best = i; } });
          idx = best;
        }
        return { x: data[idx].t, y: data[idx].c, dir: (c.ai || {}).direction || 'neutral', impact: c.impact, title: c.title, link: c.link, date: data[idx].key, approx, old: ms < firstMs };
      })
      .filter(Boolean);
  }, [news, data]);
  const dotColor = (dir) => (dir === 'bullish' ? '#34d399' : dir === 'bearish' ? '#f87171' : '#94a3b8');
  const sel = markers[selected];
  if (!ohlc || ohlc.length === 0) return <div className="flex h-[300px] items-center justify-center rounded-lg bg-slate-950/40 text-sm text-slate-500">Price data loading…</div>;
  return (
    <div>
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="t" stroke="#64748b" fontSize={10} minTickGap={40} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={10} domain={['auto', 'auto']} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={44} tickLine={false} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} formatter={(v) => [fmtUsd(v), 'Close']} />
            <Line type="monotone" dataKey="c" stroke="#38bdf8" strokeWidth={1.6} dot={false} />
            {sel && <ReferenceLine x={sel.x} stroke={dotColor(sel.dir)} strokeDasharray="4 3" />}
            {markers.map((m, i) => (
              <ReferenceDot key={i} x={m.x} y={m.y} r={i === selected ? 7 : 4.5} fill={dotColor(m.dir)} stroke="#0b1220" strokeWidth={2} isFront
                onClick={() => setSelected(i)} style={{ cursor: 'pointer' }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {markers.length === 0 ? (
        <p className="mt-2 text-center text-xs text-slate-500">{news && news.status === 'ready' ? 'No datable stories to map.' : 'Loading news markers…'}</p>
      ) : (
        <>
          {sel && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border p-2.5 text-xs" style={{ borderColor: dotColor(sel.dir) + '55', background: dotColor(sel.dir) + '11' }}>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: dotColor(sel.dir), background: dotColor(sel.dir) + '22' }}>{sel.dir}</span>
              <a href={sel.link} target="_blank" rel="noreferrer" className="flex-1 text-slate-200 hover:text-sky-300">{sel.title}</a>
              <span className="shrink-0 text-[11px] text-slate-500">{sel.date}{sel.approx ? ' (nearest)' : ''}</span>
              <span className="shrink-0 font-bold text-sky-400">Impact {sel.impact}</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {markers.map((m, i) => (
              <button key={i} onClick={() => setSelected(i)}
                className={`inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${i === selected ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-sky-500/40'}`}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(m.dir) }} />
                <span className="truncate">{m.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// ---- 3-Second Hero: Regime · Top driver · Backtested win-rate (+ Inspect Signal) ----
function ThreeSecondHero({ d, onInspect }) {
  const dec = d.decision || {};
  const sb = d.scoreboard || {};
  const nfl = d.news_forecast_link || {};
  const score = dec.overall_score != null ? dec.overall_score : d.quant_score;
  const scColor = score >= 55 ? 'text-emerald-400' : score > 45 ? 'text-amber-400' : 'text-red-400';
  const scRing = score >= 55 ? 'ring-emerald-500/30' : score > 45 ? 'ring-amber-500/30' : 'ring-red-500/30';
  const regime = dec.regime || d.quant_label || '—';
  const stateLabel = dec.label || d.quant_label || 'Neutral';
  const driver = nfl.top_driver || (dec.news_bias ? `${dec.news_bias} news flow` : 'No standout driver');
  const rawDir = String(nfl.top_driver_dir || dec.news_bias || 'neutral').toLowerCase();
  const driverColor = rawDir.includes('bull') ? 'text-emerald-400' : rawDir.includes('bear') ? 'text-red-400' : 'text-slate-300';
  const driverWord = rawDir.includes('bull') ? 'Bullish' : rawDir.includes('bear') ? 'Bearish' : 'Neutral';
  const winRate = sb.winRate;
  const total = sb.total;
  return (
    <Card className={`border-0 bg-gradient-to-br from-slate-900 to-slate-950 p-4 ring-1 ${scRing}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">At a glance</span>
        <button onClick={onInspect} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20">
          <FlaskConical className="h-3.5 w-3.5" />Inspect Signal
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Regime / Signal */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Market Regime / Signal</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-3xl font-black ${scColor}`}>{score != null ? score : '—'}</span>
            <span className="text-xs text-slate-500">/100</span>
          </div>
          <div className={`text-sm font-semibold ${scColor}`}>{stateLabel}</div>
          <div className="mt-0.5 truncate text-[11px] text-slate-400" title={regime}>{regime}</div>
        </div>
        {/* Top sentiment driver */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Primary Sentiment Driver</div>
          <div className={`mt-1 text-sm font-bold ${driverColor}`}>{driverWord}</div>
          <div className="mt-0.5 line-clamp-2 text-[12px] text-slate-300" title={driver}>{driver}</div>
          {(nfl.n_high_impact != null) && <div className="mt-1 text-[11px] text-slate-500">{nfl.n_high_impact} high-impact · {nfl.n_stories} stories</div>}
        </div>
        {/* Backtested win-rate */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Backtested Accuracy</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black text-sky-400">{winRate != null ? `${winRate}%` : '—'}</span>
          </div>
          <div className="text-sm font-semibold text-slate-300">historic win rate</div>
          <div className="mt-0.5 text-[11px] text-slate-400">across {total != null ? total.toLocaleString() : '—'} graded cycles</div>
        </div>
      </div>
    </Card>
  );
}

function InspectSignalDrawer({ d, onClose }) {
  const [news] = useFetch(`${API_BASE}/v1/news`);
  const dec = d.decision || {};
  const nfl = d.news_forecast_link || {};
  const score = dec.overall_score != null ? dec.overall_score : d.quant_score;
  const bullishLean = (score || 50) >= 50;
  const leanWord = bullishLean ? 'Bullish lean' : 'Bearish lean';
  const leanColor = bullishLean ? 'text-emerald-400' : 'text-red-400';
  const cats = (d.quant_breakdown || []).filter((b) => b.active);
  const cards = ((news && news.cards) || []).slice().sort((a, b) => (b.impact || 0) - (a.impact || 0)).slice(0, 5);
  const rawBias = String(nfl.bias || dec.news_bias || 'neutral').toLowerCase();
  const biasColor = rawBias.includes('bull') ? 'text-emerald-400' : rawBias.includes('bear') ? 'text-red-400' : 'text-slate-300';
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <FlaskConical className="h-5 w-5 text-sky-400" />
          <h3 className="font-semibold text-white">Why this signal?</h3>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-5">
          {/* Overall lean */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Overall engine read</div>
            <div className="mt-1 flex items-center gap-2"><span className={`text-2xl font-black ${leanColor}`}>{score != null ? score : '—'}/100</span><span className={`text-sm font-semibold ${leanColor}`}>{dec.label || leanWord}</span></div>
            {dec.alignment && <div className="mt-1 text-[12px] text-slate-400">Alignment: {dec.alignment}</div>}
          </div>
          {/* Sentiment impact */}
          <div>
            <div className="mb-2 flex items-center gap-2"><Newspaper className="h-4 w-4 text-violet-400" /><h4 className="text-sm font-semibold text-slate-200">News & sentiment impact</h4></div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3 text-sm text-slate-300">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Bias: <span className={`font-semibold ${biasColor}`}>{nfl.bias || dec.news_bias || 'Neutral'}</span></span>
                {nfl.signal != null && <span className="text-slate-400">signal {nfl.signal}</span>}
                {nfl.n_high_impact != null && <span className="text-slate-400">{nfl.n_high_impact} high-impact / {nfl.n_stories} stories</span>}
              </div>
              {nfl.top_driver && <div className="mt-1 text-[12px] text-slate-400">Top driver: <span className="text-slate-200">{nfl.top_driver}</span></div>}
            </div>
            {/* Weighed headlines */}
            <div className="mt-2 space-y-1.5">
              {(!news || news.status !== 'ready') ? <p className="text-[12px] text-slate-500">Loading weighed headlines…</p>
                : cards.length === 0 ? <p className="text-[12px] text-slate-500">No headlines available right now.</p>
                  : cards.map((c, i) => {
                    const dir = (c.ai || {}).direction || 'neutral';
                    return (
                      <a key={i} href={c.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 hover:border-sky-500/40">
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${DIR_COLOR[dir]}`}>{dir}</span>
                        <span className="flex-1 truncate text-[12px] text-slate-200">{c.title}</span>
                        <span className="shrink-0 text-[11px] font-bold text-sky-400">{c.impact}</span>
                      </a>
                    );
                  })}
            </div>
          </div>
          {/* Technicals confirm / diverge */}
          <div>
            <div className="mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-sky-400" /><h4 className="text-sm font-semibold text-slate-200">Technical indicators</h4><span className="text-[11px] text-slate-500">vs {bullishLean ? 'bullish' : 'bearish'} lean</span></div>
            <div className="space-y-1.5">
              {cats.length === 0 ? <p className="text-[12px] text-slate-500">No active indicator categories.</p>
                : cats.map((b) => {
                  const catBull = (b.score || 50) >= 50;
                  const confirms = catBull === bullishLean;
                  return (
                    <div key={b.name} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                      <span className="w-24 shrink-0 truncate text-[12px] text-slate-200">{b.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full" style={{ width: `${b.score}%`, backgroundColor: scoreColor(b.score) }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] font-mono text-slate-400">{b.score}</span>
                      <span className={`w-16 shrink-0 text-right text-[10px] font-bold uppercase ${confirms ? 'text-emerald-400' : 'text-amber-400'}`}>{confirms ? 'Confirms' : 'Diverges'}</span>
                    </div>
                  );
                })}
            </div>
          </div>
          <p className="border-t border-slate-800 pt-3 text-[10px] text-slate-600">Educational transparency into the decision engine — probabilities, not certainties. Not financial advice.</p>
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ d, ticker }) {
  const [inspect, setInspect] = React.useState(false);
  return (
    <div className="space-y-5">
      <SectionHead icon={LayoutDashboard} title="Overview" blurb={sec('overview').blurb} />
      <ThreeSecondHero d={d} onInspect={() => setInspect(true)} />
      <AiReview text={reviewOverview(d)} voice section="overview" footer={<TechnicalBreakdownLink d={d} dec={d.decision || {}} />} />
      <MarketStateHero d={d} ticker={ticker} />
      <OverviewChart d={d} />
      <DecisionEngineCard d={d} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center gap-2"><img src="/albert.png" alt="Albert" className="h-8 w-8 rounded-full object-cover ring-1 ring-emerald-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><TrendingUp className="h-5 w-5 text-emerald-400" /><h3 className="font-semibold text-slate-100">Albert's Top Bullish Factors</h3></div>
          <ul className="space-y-2">
            {d.factors.bullish.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{t}</li>
            ))}
          </ul>
        </Card>
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center gap-2"><img src="/albert.png" alt="Albert" className="h-8 w-8 rounded-full object-cover ring-1 ring-red-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><TrendingDown className="h-5 w-5 text-red-400" /><h3 className="font-semibold text-slate-100">Albert's Top Risk Factors</h3></div>
          <ul className="space-y-2">
            {d.factors.risk.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300"><X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />{t}</li>
            ))}
          </ul>
        </Card>
      </div>
      {inspect && <InspectSignalDrawer d={d} onClose={() => setInspect(false)} />}
    </div>
  );
}

function PerformanceSection({ d }) {
  const sb = d.scoreboard;
  return (
    <div className="space-y-5">
      <SectionHead icon={Trophy} title="Performance" blurb={SECTIONS[3].blurb} coin={d.symbol || 'BTC'} />
      <AiReview text={reviewPerformance(d)} section="performance" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-0 bg-gradient-to-br from-sky-500/10 to-slate-900 p-6 ring-1 ring-slate-800">
          <div className="mb-2 flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /><h3 className="flex items-center gap-1 font-semibold text-slate-100">AI Scoreboard<InfoTip below text="The model's real out-of-sample track record: win rate, wins vs losses, and current streak across all graded past predictions." /></h3></div>
          <p className="text-xs text-slate-400">Real out-of-sample record · {sb.total} predictions graded</p>
          <div className="mt-3 flex items-end gap-2"><span className="text-5xl font-black text-sky-400">{sb.winRate}%</span><span className="mb-1 text-sm text-slate-400">win rate</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-[11px] text-slate-400">Wins</p><p className="text-lg font-bold text-emerald-400">{sb.wins}</p></div>
            <div className="rounded-lg bg-red-500/10 p-2"><p className="text-[11px] text-slate-400">Losses</p><p className="text-lg font-bold text-red-400">{sb.losses}</p></div>
            <div className="rounded-lg bg-slate-800/60 p-2"><p className="text-[11px] text-slate-400">Streak</p><p className={`text-lg font-bold ${sb.currentStreak >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sb.currentStreak >= 0 ? `${sb.currentStreak}W` : `${Math.abs(sb.currentStreak)}L`}</p></div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="text-xs text-slate-400"><span className="font-semibold text-slate-200">Live forward record:</span> {d.live_record.tracked} tracked · {d.live_record.resolved} resolved{d.live_record.winRate != null ? ` · ${d.live_record.winRate}% hit` : ' · grading begins on the next daily candle'}</div>
          </div>
        </Card>

        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2"><History className="h-5 w-5 text-slate-400" /><h3 className="flex items-center gap-1 font-semibold text-slate-100">Trade Log<InfoTip below text="Every recent prediction the model made, graded against what actually happened on the next candle — its date, signal, confidence and win/loss." /></h3><span className="text-sm text-slate-500">last {d.trades.length} graded predictions</span></div>
          <div className="max-h-[300px] overflow-y-auto pr-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="py-2">Date</th><th className="py-2">Signal</th><th className="py-2 text-right">Conf.</th><th className="hidden py-2 text-right sm:table-cell">Close → Next</th><th className="py-2 text-right">Result</th></tr>
              </thead>
              <tbody>
                {d.trades.map((t, i) => (
                  <tr key={i} className="border-t border-slate-800/60">
                    <td className="py-2 font-mono text-xs text-slate-400">{t.date}</td>
                    <td className="py-2"><span className={`inline-flex items-center gap-1 font-semibold ${t.signal === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>{t.signal === 'UP' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{t.signal}</span></td>
                    <td className="py-2 text-right font-mono text-slate-300">{t.confidence}%</td>
                    <td className="hidden py-2 text-right font-mono text-xs text-slate-400 sm:table-cell">{fmtUsd(t.close)} → {fmtUsd(t.nextClose)}</td>
                    <td className="py-2 text-right">{t.correct ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400"><Check className="h-3 w-3" />WIN</span> : <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-400"><X className="h-3 w-3" />LOSS</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="mb-4"><h3 className="flex items-center gap-1 font-semibold text-slate-100">AI Accuracy vs {(d.symbol || 'BTC')} Price<InfoTip below text={`The model's 30-day rolling hit-rate (right axis) plotted against ${(d.symbol || 'BTC')} spot price (left axis), so you can see how accuracy held up through different market conditions.`} /></h3><p className="text-sm text-slate-400">30-day rolling accuracy against spot price · {d.first_date} → {d.as_of}</p></div>
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={d.performance} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <defs><linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#94a3b8" stopOpacity={0.25} /><stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} minTickGap={40} />
              <YAxis yAxisId="left" orientation="left" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tickLine={false} domain={['auto', 'auto']} />
              <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={11} tickFormatter={(v) => `${v}%`} tickLine={false} domain={[30, 90]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 13 }} />
              <Area yAxisId="left" name={`${(d.symbol || 'BTC')} Price`} type="monotone" dataKey="btcPrice" stroke="#94a3b8" strokeWidth={1.5} fill="url(#btcFill)" />
              <Line yAxisId="right" name="AI Accuracy" type="monotone" dataKey="aiAccuracy" stroke="#38bdf8" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}


function MarketIntelCard({ d }) {
  const mi = d.market_intel; if (!mi) return null;
  const rows = [
    ['Overall Quant Score', `${mi.quant_score} — ${mi.quant_label}`],
    ['Market Regime', mi.regime],
    ['24h Higher Probability', mi.higher_24h != null ? `${mi.higher_24h}%` : 'n/a'],
    ['7d Higher Probability', mi.higher_7d != null ? `${mi.higher_7d}%` : 'n/a'],
    ['Model Confidence', mi.confidence],
    ['Technical Structure', mi.technical_structure],
    ['BTC Dominance', mi.dominance],
    ['Cycle Phase', mi.cycle_phase],
    ['Smart Money', mi.smart_money],
    ['Exchange Supply', mi.exchange_supply],
    ['Pressure Map', mi.pressure_map],
    ['Derivatives Risk', mi.derivatives_risk],
    ['Crowd Intelligence', mi.crowd],
    ['Social Hype Risk', mi.hype_risk],
  ];
  return (
    <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
      <div className="mb-4 flex items-center gap-2"><Landmark className="h-5 w-5 text-sky-400" /><h3 className="font-semibold text-slate-100">Market Intelligence</h3></div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 md:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-slate-800/50 py-1.5 text-sm">
            <span className="text-slate-400">{k}</span>
            <span className={`text-right font-medium ${String(v).startsWith('Awaiting') ? 'text-slate-600' : 'text-slate-100'}`}>{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="mb-1 flex items-center gap-1.5"><img src="/albert.png" alt="Albert" className="h-6 w-6 rounded-full object-cover ring-1 ring-emerald-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><p className="text-[11px] font-semibold uppercase text-emerald-400">Albert&apos;s Primary Tailwind</p></div><p className="mt-1 text-sm text-slate-300">{mi.top_positive}</p></div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><div className="mb-1 flex items-center gap-1.5"><img src="/albert.png" alt="Albert" className="h-6 w-6 rounded-full object-cover ring-1 ring-red-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><p className="text-[11px] font-semibold uppercase text-red-400">Albert&apos;s Primary Risk</p></div><p className="mt-1 text-sm text-slate-300">{mi.top_risk}</p></div>
      </div>
    </Card>
  );
}

function reviewPolicy(d) {
  const p = d.policy; if (!p) return 'Policy & liquidity data is being generated.';
  const cm = d.crossmarket || [];
  const strongest = [...cm].sort((a, b) => Math.abs(b.corr_30d || 0) - Math.abs(a.corr_30d || 0))[0];
  const nextEv = (p.calendar || [])[0];
  return `The Policy & Liquidity Score is ${p.score}/100 — ${p.label} — with a Global Liquidity Impulse of ${p.liquidity_impulse}/100 (${p.liquidity_state}). The dollar (DXY ${p.dxy}), 10Y yield (${p.y10}%) and VIX (${p.vix}) set the tone. ${strongest ? `Right now Bitcoin's tightest link is to ${strongest.asset} (30d corr ${strongest.corr_30d}, ${strongest.label}), so that market carries extra weight in the short-horizon models.` : ''} Tailwind: ${p.tailwind} Risk: ${p.risk}${nextEv ? ` Next major event: ${nextEv.event} (${nextEv.date}).` : ''}`;
}

const stageColor = (n) => n >= 10 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : n >= 7 ? 'text-sky-400 border-sky-500/30 bg-sky-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10';

function PolicySection({ d }) {
  const p = d.policy; const cm = d.crossmarket || [];
  if (!p) return <ComingSoonSection section={sec('policy')} />;
  return (
    <div className="space-y-5">
      <SectionHead icon={Landmark} title="Policy & Liquidity" blurb={sec('policy').blurb} />
      <AiReview text={reviewPolicy(d)} section="policy" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-0 bg-gradient-to-br from-sky-500/10 to-slate-900 p-6 ring-1 ring-slate-800">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Policy & Liquidity Score</p>
          <div className="mt-2 flex items-end gap-2"><span className="text-5xl font-black" style={{ color: scoreColor(p.score) }}>{p.score}</span><span className="mb-1 text-sm text-slate-400">/ 100</span></div>
          <p className="mt-1 font-semibold" style={{ color: scoreColor(p.score) }}>{p.label}</p>
        </Card>
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800 lg:col-span-2">
          <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Global Liquidity Impulse</p><Badge variant="outline" className="border-slate-700 text-sky-400">{p.liquidity_state}</Badge></div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400" style={{ width: `${p.liquidity_impulse}%` }} /></div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-[11px] text-slate-400">US Dollar (DXY)</p><p className="mt-0.5 font-bold text-white">{p.dxy}</p><p className="text-[11px] text-slate-500">z {p.components.dxy_z}</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-[11px] text-slate-400">10Y Yield</p><p className="mt-0.5 font-bold text-white">{p.y10}%</p><p className="text-[11px] text-slate-500">z {p.components.y10_z}</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-[11px] text-slate-400">VIX</p><p className="mt-0.5 font-bold text-white">{p.vix}</p><p className="text-[11px] text-slate-500">z {p.components.vix_z}</p></div>
          </div>
        </Card>
      </div>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-3 flex flex-wrap items-center gap-1 font-semibold text-slate-100">Cross-Market Correlations <span className="text-sm font-normal text-slate-500">(rolling, vs BTC)</span><InfoTip below text="How closely BTC has moved with other markets (stocks, gold, the dollar) recently. A high correlation means that market's swings tend to drag BTC along." /></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-2">Asset</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">7d</th><th className="py-2 text-right">30d</th><th className="py-2 text-right">90d</th><th className="py-2 text-right">β 30d</th><th className="py-2 text-right">Relationship</th></tr></thead>
            <tbody>
              {cm.map((a) => (
                <tr key={a.asset} className="border-t border-slate-800/60">
                  <td className="py-2 font-medium text-slate-200">{a.asset}</td>
                  <td className="py-2 text-right font-mono text-slate-300">{a.price?.toLocaleString()}</td>
                  <td className={`py-2 text-right font-mono ${corrColor(a.corr_7d)}`}>{a.corr_7d ?? '—'}</td>
                  <td className={`py-2 text-right font-mono font-bold ${corrColor(a.corr_30d)}`}>{a.corr_30d ?? '—'}</td>
                  <td className={`py-2 text-right font-mono ${corrColor(a.corr_90d)}`}>{a.corr_90d ?? '—'}</td>
                  <td className="py-2 text-right font-mono text-slate-400">{a.beta_30d ?? '—'}</td>
                  <td className={`py-2 text-right text-xs font-semibold ${corrColor(a.corr_30d)}`}>{a.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-3 flex items-center gap-1 font-semibold text-slate-100">Central-Bank Policy Rates<InfoTip below text="Key interest rates set by major central banks. Higher rates tend to pull money out of risk assets like Bitcoin; cuts tend to add fuel." /></h3>
          <div className="space-y-1.5">
            {p.central_banks.map((b) => (
              <div key={b.bank} className="flex items-center justify-between border-b border-slate-800/50 py-1.5 text-sm">
                <span className="text-slate-300">{b.bank}</span>
                <span className="flex items-center gap-2"><span className="font-mono text-white">{b.rate}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.last === 'Cut' ? 'bg-emerald-500/10 text-emerald-400' : b.last === 'Hike' ? 'bg-red-500/10 text-red-400' : 'bg-slate-800 text-slate-400'}`}>{b.last}</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-3 flex items-center gap-1 font-semibold text-slate-100">Policy Event Calendar<InfoTip below text="Upcoming macro events (rate decisions, inflation prints, jobs data) that can move markets — and Bitcoin along with them." /></h3>
          <div className="space-y-2">
            {p.calendar.map((e, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div><p className="text-sm font-medium text-slate-200">{e.event}</p><p className="text-xs text-slate-500">{e.date} · BTC sensitivity {e.btc_sensitivity}</p></div>
                <Badge variant="outline" className={`border-slate-700 ${e.importance === 'Very High' ? 'text-red-400' : 'text-amber-400'}`}>{e.importance}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-1 flex items-center gap-1 font-semibold text-slate-100">Regulation Tracker<InfoTip below text="A running list of notable crypto regulatory and policy developments, with a read on whether each is supportive or a headwind for BTC." /></h3>
        <p className="mb-3 text-xs text-slate-500">Proposal vs enacted vs implemented — 13-stage legal-status taxonomy (curated).</p>
        <div className="space-y-2">
          {p.regulation.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-200">{r.title}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${stageColor(r.stage_num)}`}>{r.stage}</span>
                <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{r.jurisdiction}</span>
                <span className={`ml-auto text-xs font-semibold ${r.direction > 0 ? 'text-emerald-400' : r.direction < 0 ? 'text-red-400' : 'text-slate-400'}`}>{r.impact}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{r.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="mb-1 flex items-center gap-1.5"><img src="/albert.png" alt="Albert" className="h-6 w-6 rounded-full object-cover ring-1 ring-emerald-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><p className="text-[11px] font-semibold uppercase text-emerald-400">Albert&apos;s Primary Tailwind</p></div><p className="mt-1 text-sm text-slate-300">{p.tailwind}</p></div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><div className="mb-1 flex items-center gap-1.5"><img src="/albert.png" alt="Albert" className="h-6 w-6 rounded-full object-cover ring-1 ring-red-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><p className="text-[11px] font-semibold uppercase text-red-400">Albert&apos;s Primary Risk</p></div><p className="mt-1 text-sm text-slate-300">{p.risk}</p></div>
        </div>
        <p className="mt-3 text-sm text-slate-400"><span className="font-semibold text-slate-200">Interpretation:</span> {p.interpretation}</p>
      </Card>
    </div>
  );
}

function AlertsSection({ d, alertsData, onAck, filter = 'BTC', onFilter, coins = [] }) {
  const smart = (alertsData && alertsData.alerts) || [];
  const unseen = (alertsData && alertsData.unseen) || 0;
  const live = d.alerts || [];
  const filterCoins = ['ALL', 'BTC', ...coins.map((c) => c.symbol).filter((s) => s && s !== 'BTC')];
  const sevStyle = (s) => s === 'high' ? 'border-red-500/30 bg-red-500/5' : s === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : s === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-sky-500/25 bg-sky-500/5';
  const sevDot = (s) => s === 'high' ? 'bg-red-400' : s === 'warning' ? 'bg-amber-400' : s === 'success' ? 'bg-emerald-400' : 'bg-sky-400';
  const catStyle = (c) => ({ Regime: 'text-violet-300 bg-violet-500/10 border-violet-500/25',
    'Market State': 'text-sky-300 bg-sky-500/10 border-sky-500/25',
    'Quant Score': 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
    'Data Trust': 'text-amber-300 bg-amber-500/10 border-amber-500/25',
    'Event Risk': 'text-orange-300 bg-orange-500/10 border-orange-500/25',
    Volatility: 'text-red-300 bg-red-500/10 border-red-500/25',
    News: 'text-violet-300 bg-violet-500/10 border-violet-500/25',
    Setup: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
    Whale: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' }[c] || 'text-slate-300 bg-slate-800/40 border-slate-700');
  const styleFor = (lvl) => lvl === 'danger' ? 'border-red-500/30 bg-red-500/5' : lvl === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : lvl === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/40';
  const dot = (lvl) => lvl === 'danger' ? 'bg-red-400' : lvl === 'warning' ? 'bg-amber-400' : lvl === 'success' ? 'bg-emerald-400' : 'bg-sky-400';
  const fmtTs = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
  return (
    <div className="space-y-5">
      <SectionHead icon={Bell} title="Smart Alerts" blurb={sec('alerts').blurb} coin={d.symbol || 'BTC'} />
      <AiReview section="alerts" text="Albert is reviewing recent alerts…" voice />

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-violet-400" />
          <h3 className="flex items-center gap-1 font-semibold text-slate-100">What Just Changed<InfoTip below text="The most recent shifts the engine flagged — new signals, regime changes or notable moves — so you can catch what's different since you last looked." /></h3>
          {unseen > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300 ring-1 ring-red-500/30">{unseen} new</span>}
          <span className="ml-auto text-xs text-slate-500">{smart.length} logged</span>
          {unseen > 0 && <Button size="sm" variant="outline" onClick={() => onAck && onAck()} className="h-7 gap-1.5 border-slate-700 text-xs text-slate-300 hover:bg-slate-800">Mark all read</Button>}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Coin</span>
          {filterCoins.map((c) => (
            <button
              key={c}
              onClick={() => onFilter && onFilter(c)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${filter === c ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800'}`}
            >
              {c !== 'ALL' && <CoinIcon symbol={c} size={14} />}
              {c === 'ALL' ? 'All Coins' : c}
            </button>
          ))}
        </div>
        <p className="mb-4 text-xs text-slate-500">State-change intelligence — non-price events triggered when the market regime, unified decision, data trust, quant score or event risk shifts between runs.</p>
        {smart.length === 0 ? (
          <p className="text-sm text-slate-500">No state changes logged{filter !== 'ALL' ? ` for ${filter}` : ''} yet. Alerts appear here automatically when the market’s regime, decision, trust or event risk changes.</p>
        ) : (
          <div className="space-y-2">
            {smart.map((a, i) => (
              <div key={a.id || i} className={`flex items-start gap-3 rounded-lg border p-3 ${sevStyle(a.severity)} ${!a.seen ? 'ring-1 ring-inset ring-sky-500/20' : ''}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevDot(a.severity)}`} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CoinIcon symbol={a.symbol || 'BTC'} size={16} />
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${catStyle(a.category)}`}>{a.category}</span>
                    <span className="text-sm font-semibold text-slate-100">{a.title}</span>
                    {!a.seen && <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300">new</span>}
                    <span className="ml-auto text-[11px] text-slate-500">{fmtTs(a.ts)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{a.message}</p>
                  {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-sky-400 hover:text-sky-300">Read source ↗</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="mb-3 flex items-center gap-2"><img src="/albert.png" alt="Albert" className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-600" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><Radio className="h-5 w-5 text-slate-400" /><h3 className="font-semibold text-slate-100">Albert&apos;s Current Market Read</h3><span className="text-sm text-slate-500">{live.length} active</span></div>
        <div className="space-y-2">
          {live.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${styleFor(a.level)}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot(a.level)}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-200">{a.type}</span><span className="text-[11px] text-slate-500">{a.ts}</span></div>
                <p className="text-sm text-slate-400">{a.message}</p>
              </div>
            </div>
          ))}
          {live.length === 0 && <p className="text-sm text-slate-500">No active signals right now.</p>}
        </div>
        <p className="mt-4 text-[11px] text-slate-600">In-app feed (no email yet). Add a SendGrid key later to push these as email/push alerts.</p>
      </Card>
    </div>
  );
}

/* --------------------------- Time Machine ---------------------------- */
const impColor = (i) => ({ 'Very High': 'text-red-400 border-red-500/30 bg-red-500/10',
  High: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  Medium: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Low: 'text-slate-400 border-slate-700 bg-slate-800/40' }[i] || 'text-slate-400 border-slate-700');
const volColor = (v) => ({ 'Very High': 'bg-red-500', High: 'bg-orange-500',
  Elevated: 'bg-amber-500', Low: 'bg-emerald-500' }[v] || 'bg-slate-600');
const volPct = (v) => ({ 'Very High': 100, High: 78, Elevated: 52, Low: 26 }[v] || 40);
const feedColor = (s) => ({ live: 'text-emerald-400', degraded: 'text-amber-400',
  stale: 'text-orange-400', down: 'text-red-400' }[s] || 'text-slate-400');
const feedDot = (s) => ({ live: 'bg-emerald-400', degraded: 'bg-amber-400',
  stale: 'bg-orange-400', down: 'bg-red-400' }[s] || 'bg-slate-500');
function ageTxt(m) { if (m == null) return 'live'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; }
/* ===================== Executive Summary / Morning Brief ===================== */
function biasMeta(score) {
  if (score == null) return { label: '—', short: '—', color: '#94a3b8', arrow: null };
  if (score >= 55) return { label: 'BULLISH', short: 'BULL', color: '#34d399', arrow: '↑' };
  if (score <= 45) return { label: 'BEARISH', short: 'BEAR', color: '#f87171', arrow: '↓' };
  return { label: 'NEUTRAL', short: 'NEU', color: '#fbbf24', arrow: '→' };
}

function ExecKpi({ label, children, sub, subColor, onClick }) {
  return (
    <button onClick={onClick} className="group flex h-full flex-col rounded-lg border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-2 text-left ring-1 ring-slate-800/60 transition-all hover:border-slate-700 hover:ring-sky-500/30 sm:rounded-2xl sm:p-5">
      <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-wider">{label}</p>
      <div className="mt-1 break-words">{children}</div>
      {sub && <p className="mt-0.5 text-[11px] font-semibold leading-tight sm:text-sm" style={{ color: subColor || '#94a3b8' }}>{sub}</p>}
    </button>
  );
}

function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

function ScenarioSimulator({ d, onNav }) {
  const [shock, setShock] = useState(0);
  const [hz, setHz] = useState('7D');
  const spot = d.last_close;
  const forecasts = [...(d.forecasts || []), ...(d.long_outlook || [])];
  const f = forecasts.find((x) => x.horizon === hz) || forecasts[0];
  const sb = (d.decision || {}).scenarios_block || {};
  const bull = (sb.scenarios || []).find((s) => s.type === 'bull');
  const bear = (sb.scenarios || []).find((s) => s.type === 'bear');
  if (!f || !f.quantiles || !spot) return null;
  const hypo = spot * (1 + shock / 100);
  // Map hypothetical price -> z via interpolation over the log-normal quantile grid, then -> percentile.
  const q = f.quantiles;
  const pts = [[q.p10, -1.2816], [q.p25, -0.6745], [q.p50, 0], [q.p75, 0.6745], [q.p90, 1.2816]];
  let z;
  if (hypo <= pts[0][0]) z = -2.2;
  else if (hypo >= pts[4][0]) z = 2.2;
  else { for (let i = 0; i < pts.length - 1; i++) { if (hypo >= pts[i][0] && hypo <= pts[i + 1][0]) { const r = (hypo - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1); z = pts[i][1] + r * (pts[i + 1][1] - pts[i][1]); break; } } }
  const pctile = Math.round(normCdf(z) * 100);
  // Simulator depth: re-estimate win-prob, EV and regime tilt under the price shock.
  const re0 = (d.decision || {}).regime_engine || {};
  const baseWin = f.ev ? f.ev.win_prob : 50;
  const momentumRegime = ['bull_momentum', 'bear_distribution'].includes(re0.current_regime);
  const k = momentumRegime ? 0.9 : 0.5; // trending regimes are more shock-sensitive
  const newWin = Math.max(2, Math.min(98, baseWin + shock * k));
  const up = (f.ev ? f.ev.avg_up_pct : 3) / 100;
  const dn = (f.ev ? f.ev.avg_down_pct : 3) / 100;
  const newEvPct = Math.round(((newWin / 100) * up - (1 - newWin / 100) * dn) * 10000) / 100;
  const tiltRegime = shock <= -5 ? 'High-Vol Squeeze' : shock <= -2 ? 'Bear Distribution'
    : shock >= 5 ? 'Bull Momentum' : shock >= 2 ? 'Bull Momentum' : (re0.regime_label || 'Current regime');
  const crossed = [];
  if (bull && hypo >= bull.trigger_level) crossed.push({ t: `Broke resistance $${bull.trigger_level.toLocaleString()}`, c: 'text-emerald-300' });
  if (bear && hypo <= bear.trigger_level) crossed.push({ t: `Lost support $${bear.trigger_level.toLocaleString()}`, c: 'text-red-300' });
  if (bear && hypo <= bear.target_level) crossed.push({ t: `Below invalidation $${bear.target_level.toLocaleString()}`, c: 'text-amber-300' });
  return (
    <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-white">Scenario Simulator</h3>
        <InfoTip text="Drag to apply a hypothetical price shock and see where it lands inside the calibrated forecast cone, plus which scenario levels it would cross. This maps a price to the model's distribution — it doesn't refit the model." />
        <div className="ml-auto flex gap-1">
          {['24H', '7D', '30D'].map((h) => (
            <button key={h} onClick={() => setHz(h)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${hz === h ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40' : 'text-slate-400 hover:text-slate-200'}`}>{h}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-red-400">−20%</span>
        <input type="range" min={-20} max={20} step={0.5} value={shock} onChange={(e) => setShock(parseFloat(e.target.value))} className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-500/40 via-slate-700 to-emerald-500/40 accent-sky-400" />
        <span className="text-xs font-semibold text-emerald-400">+20%</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setShock(-20)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-200 hover:bg-red-500/20">Flash crash −20%</button>
        <button onClick={() => setShock(-10)} className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-semibold text-orange-200 hover:bg-orange-500/20">Pullback −10%</button>
        <button onClick={() => setShock(15)} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20">ETF surge +15%</button>
        <button onClick={() => setShock(0)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-slate-600">Reset</button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Shock</p><p className={`text-lg font-black ${shock >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{shock > 0 ? '+' : ''}{shock}%</p></div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Hypothetical price</p><p className="text-lg font-black text-white">{fmtUsd(Math.round(hypo))}</p></div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">{hz} cone percentile</p><p className="text-lg font-black text-sky-300">p{pctile}</p></div>
      </div>
      <p className="mt-3 text-[12px] text-slate-400">A {shock > 0 ? '+' : ''}{shock}% move to <span className="font-semibold text-slate-200">{fmtUsd(Math.round(hypo))}</span> sits at the <span className="font-semibold text-sky-300">{pctile}th percentile</span> of the {hz} forecast cone — {pctile <= 10 ? 'a rare downside tail' : pctile >= 90 ? 'a rare upside tail' : pctile < 40 ? 'below the median path' : pctile > 60 ? 'above the median path' : 'near the median path'}.</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Adj. win prob</p><p className="text-base font-black text-slate-200">{Math.round(newWin)}%</p><p className="text-[9px] text-slate-600">from {Math.round(baseWin)}%</p></div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Adj. expected value</p><p className={`text-base font-black ${newEvPct > 0 ? 'text-emerald-400' : newEvPct < 0 ? 'text-red-400' : 'text-slate-300'}`}>{newEvPct > 0 ? '+' : ''}{newEvPct}%</p><p className="text-[9px] text-slate-600">{hz} horizon</p></div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] uppercase text-slate-500">Regime tilt</p><p className="text-xs font-bold leading-tight text-violet-300">{tiltRegime}</p></div>
      </div>
      {crossed.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {crossed.map((c, i) => <span key={i} className={`rounded-full border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] font-semibold ${c.c}`}>{c.t}</span>)}
        </div>
      )}
    </Card>
  );
}

function briefTimeAgo(iso) {
  if (!iso) return '';
  try {
    const norm = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z';
    const s = Math.max(0, Math.floor((Date.now() - new Date(norm).getTime()) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch (e) { return ''; }
}

function useBriefWatchlist() {
  const [wl, setWl] = useState(null); // { coins, available }
  useEffect(() => { fetch(`${API_BASE}/v1/albert/brief-watchlist`, { cache: 'no-store' }).then((r) => r.json()).then(setWl).catch(() => {}); }, []);
  const toggle = async (sym) => {
    if (sym === 'BTC' || !wl) return; // BTC always on
    const has = wl.coins.includes(sym);
    const next = has ? wl.coins.filter((c) => c !== sym) : [...wl.coins, sym];
    setWl({ ...wl, coins: next });
    try {
      const r = await fetch(`${API_BASE}/v1/albert/brief-watchlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coins: next.filter((c) => c !== 'BTC') }) });
      const j = await r.json();
      if (j && j.coins) setWl((w) => ({ ...w, coins: j.coins }));
    } catch (e) { /* noop */ }
  };
  return { wl, toggle };
}

function BriefWatchlistList({ wl, toggle }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      {(wl?.available || []).map((a) => {
        const on = wl.coins.includes(a.symbol);
        const locked = a.symbol === 'BTC';
        return (
          <button key={a.symbol} onClick={() => toggle(a.symbol)} disabled={locked}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${locked ? 'cursor-default opacity-70' : 'hover:bg-slate-800'}`}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-sky-400 bg-sky-500 text-white' : 'border-slate-600'}`}>{on && <Check className="h-3 w-3" />}</span>
            <span className={`font-semibold ${on ? 'text-white' : 'text-slate-400'}`}>{a.symbol}</span>
            <span className="truncate text-xs text-slate-500">{a.name}</span>
            {locked && <span className="ml-auto text-[9px] text-slate-600">always</span>}
          </button>
        );
      })}
    </div>
  );
}

// Inline panel for the Settings screen.
function BriefWatchlistPanel() {
  const { wl, toggle } = useBriefWatchlist();
  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-500">Pick which coins get a daily brief and a bell notification. Bitcoin is always included.</p>
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-1">
        <BriefWatchlistList wl={wl} toggle={toggle} />
      </div>
    </div>
  );
}

// Compact dropdown for the Morning Brief header.
function BriefCoinPicker() {
  const [open, setOpen] = useState(false);
  const { wl, toggle } = useBriefWatchlist();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Choose coins for daily briefs & alerts"
        className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-sky-500/50 hover:text-sky-200">
        <Bell className="h-4 w-4" />Daily coins{wl ? ` (${wl.coins.length})` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-60 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Coins for daily briefs &amp; alerts</p>
            <BriefWatchlistList wl={wl} toggle={toggle} />
          </div>
        </>
      )}
    </div>
  );
}


function ExecutiveSummary({ d, ticker, news, onNav, homeParams, setHomeParams }) {
  const [speaking, setSpeaking] = useState(false);
  const [warming, setWarming] = useState(false);
  const briefSym = (d && d.symbol) || 'BTC';
  const briefName = (d && d.coin_name) || (briefSym === 'BTC' ? 'Bitcoin' : briefSym);
  const [briefFetched] = useFetch(`${API_BASE}/v1/albert/brief${briefSym !== 'BTC' ? `?symbol=${encodeURIComponent(briefSym)}` : ''}`, [briefSym]);
  const [briefOverride, setBriefOverride] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshedRef = React.useRef(new Set());
  useEffect(() => { setBriefOverride(null); }, [briefSym]); // clear stale override on coin switch
  const brief = briefOverride || briefFetched;
  const briefAgeH = (() => { try { if (!brief || !brief.generated_at) return null; const norm = /[zZ]$/.test(brief.generated_at) ? brief.generated_at : brief.generated_at + 'Z'; return (Date.now() - new Date(norm).getTime()) / 3600000; } catch (e) { return null; } })();
  const staleBrief = briefAgeH != null && briefAgeH > 24;
  const [techOpen, setTechOpen] = useState(false);
  // Plain-first contract: technical content stays collapsed by default and is
  // opened only by explicit user action — never auto-opened from a Pro preference.
  const buildParts = (b) => [`Good morning! Here is your ${briefName} brief.`,
    ...((b && b.observations) || []), (b && b.take) ? `My take: ${b.take}` : '']
    .filter(Boolean).join(' ');
  // Instant Listen: pre-generate the audio as soon as the brief is ready.
  useEffect(() => {
    if (brief && (brief.observations || []).length) prefetchAlbert(buildParts(brief));
  }, [brief]); // eslint-disable-line
  const refreshBrief = async () => {
    if (refreshing) return;
    setRefreshing(true);
    stopAlbert(); setSpeaking(false); setWarming(false);
    try {
      const r = await fetch(`${API_BASE}/v1/albert/brief?refresh=1${briefSym !== 'BTC' ? `&symbol=${encodeURIComponent(briefSym)}` : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (j && j.status === 'ready') { setBriefOverride(j); prefetchAlbert(buildParts(j)); }
    } catch (e) { /* noop */ } finally { setRefreshing(false); }
  };
  // Freshness auto-refresh: the moment a stale brief's tab is opened, quietly fetch
  // Albert's latest read (once per coin per session).
  useEffect(() => {
    if (staleBrief && brief && !refreshing && !autoRefreshedRef.current.has(briefSym)) {
      autoRefreshedRef.current.add(briefSym);
      refreshBrief();
    }
  }, [staleBrief, briefSym, brief]); // eslint-disable-line
  const speakBrief = () => {
    try {
      if (speaking || warming) { stopAlbert(); setSpeaking(false); setWarming(false); return; }
      const hasBrief = brief && (brief.observations || []).length;
      const parts = hasBrief ? buildParts(brief)
        : (d.decision && d.decision.summary ? `Good morning! ${d.decision.summary}` : '');
      if (!parts.trim()) return;
      setWarming(true);
      speakAlbert(parts, {
        onStart: () => { setWarming(false); setSpeaking(true); },
        onEnd: () => { setSpeaking(false); setWarming(false); },
      });
    } catch (e) { setSpeaking(false); setWarming(false); }
  };
  const dec = d.decision || {};
  const bias = biasMeta(dec.overall_score);
  const price = ticker?.price ?? d.last_close;
  const chg = ticker?.change24h ?? d.day_change_pct;
  const conf = d.confidence != null ? d.confidence : null;
  const sb = dec.scenarios_block || {};
  const bull = (sb.scenarios || []).find((s) => s.type === 'bull');
  const bear = (sb.scenarios || []).find((s) => s.type === 'bear');
  const re = dec.regime_engine || {};
  const ohlc = (d.chart?.ohlc || []).map((o) => ({ t: o.t, c: o.c }));
  const cards = (news?.cards || []).slice(0, 5);
  const comps = dec.components || [];
  const compAssess = {
    'Macro / Policy': 'Global money conditions and policy backdrop.',
    'Technicals': 'Trend, momentum, volume and volatility read.',
    'Chart Structure': 'Support/resistance structure and breakouts.',
    'News Flow': 'Impact-weighted direction from the latest headlines.',
  };
  const catalyst = d.news_forecast_link?.top_driver || (cards[0] && cards[0].title) || '—';
  const mattersChips = [
    { label: 'ETF FLOWS', side: comps.find((c) => c.name === 'Macro / Policy')?.score >= 50 ? 'up' : 'down', nav: 'institutional' },
    { label: 'ON-CHAIN', side: (d.smart_money?.score ?? 50) >= 50 ? 'up' : 'down', nav: 'smartmoney' },
    { label: 'DERIVATIVES', side: 'flat', nav: 'leverage' },
    { label: 'MACRO', side: comps.find((c) => c.name === 'Macro / Policy')?.score >= 50 ? 'up' : 'warn', nav: 'macro' },
  ];
  const sideIcon = (s) => s === 'up' ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
    : s === 'down' ? <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
    : s === 'warn' ? <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
    : <Activity className="h-3.5 w-3.5 text-sky-400" />;

  return (
    <div className="space-y-4">
      <TraderHome symbol={briefSym || 'BTC'} onNav={onNav} params={homeParams} onParams={setHomeParams} />
      {/* KPI row — 4 across on every screen; compact on mobile */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <ExecKpi label="Market Bias" onClick={() => onNav('overview')}>
          <p className="flex items-baseline gap-0.5 text-sm font-black leading-tight sm:gap-1.5 sm:text-3xl" style={{ color: bias.color }}>
            <span className="sm:hidden">{bias.short}</span><span className="hidden sm:inline">{bias.label}</span>
            <span className="text-xs sm:text-2xl">{bias.arrow}</span>
          </p>
        </ExecKpi>
        <ExecKpi label={`${briefSym} Price`} onClick={() => onNav('market-intel')} sub={`${chg >= 0 ? '+' : ''}${chg}% 24h`} subColor={chg >= 0 ? '#34d399' : '#f87171'}>
          <p className="text-sm font-black leading-tight text-white sm:text-3xl">
            <span className="sm:hidden">{price >= 1000 ? `$${(price / 1000).toFixed(price >= 100000 ? 0 : 1)}k` : fmtUsd(price)}</span>
            <span className="hidden sm:inline">{fmtUsd(price)}</span>
          </p>
        </ExecKpi>
        <ExecKpi label="Conviction" onClick={() => onNav('overview')} sub={dec.overall_score_raw != null && dec.overall_score_raw !== dec.overall_score ? `ensemble-adj from ${dec.overall_score_raw}` : (dec.label || '')} subColor={scoreColor(dec.overall_score)}>
          <p className="text-sm font-black leading-tight sm:text-3xl" style={{ color: scoreColor(dec.overall_score) }}>{dec.overall_score ?? '—'}<span className="text-xs text-slate-500 sm:text-lg">/100</span></p>
        </ExecKpi>
        <ExecKpi label="Confidence" onClick={() => onNav('performance')} sub={conf != null ? 'model confidence' : ''}>
          <p className="text-sm font-black leading-tight text-sky-300 sm:text-3xl">{conf != null ? `${conf}%` : '—'}</p>
        </ExecKpi>
      </div>

      {/* Albert's Morning Brief */}
      <Card className="border-0 bg-gradient-to-br from-amber-500/[0.06] via-violet-500/[0.06] to-slate-900 p-6 ring-1 ring-violet-500/25">
        <div className="flex flex-wrap items-center gap-2">
          <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-400/50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <h3 className="text-lg font-bold text-white">{briefSym === 'BTC' ? 'Albert’s Morning Brief' : `Albert’s ${briefName} Brief`}</h3>
          {re.regime_label && <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-200">{re.regime_label}</span>}
          {dec.ensemble_health != null && (() => {
            const h0 = dec.ensemble_health;
            const m = h0 >= 0.9 ? { t: 'Strong', c: '#34d399' } : h0 >= 0.75 ? { t: 'Steady', c: '#a3e635' } : h0 >= 0.6 ? { t: 'Soft', c: '#fbbf24' } : { t: 'Weak', c: '#f87171' };
            return <span className="rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: m.c + '55', color: m.c }} title={`Ensemble health ${Math.round(h0 * 100)}%`}>Model health: {m.t}</span>;
          })()}
          {brief && brief.generated_at && (
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold text-slate-400" title={(() => { try { return new Date(brief.generated_at + (/[zZ]$/.test(brief.generated_at) ? '' : 'Z')).toLocaleString(); } catch (e) { return ''; } })()}>generated {briefTimeAgo(brief.generated_at)}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <BriefCoinPicker />
            <button onClick={refreshBrief} disabled={refreshing} title="Regenerate brief"
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-violet-500/50 hover:text-violet-200 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button onClick={speakBrief} className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${(speaking || warming) ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/50 hover:text-amber-200'}`}>
              {warming ? <><Loader2 className="h-4 w-4 animate-spin" />Albert is warming up…</> : speaking ? <><VolumeX className="h-4 w-4" />Stop</> : <><Volume2 className="h-4 w-4" />Listen</>}
            </button>
            <button onClick={() => onNav('ask')} className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-500/50 hover:text-sky-200"><MessageCircle className="h-4 w-4" />Ask Albert</button>
          </div>
        </div>
        {staleBrief && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="flex-1">{refreshing ? 'Albert is fetching a fresh read for you…' : `This brief is over a day old (${briefTimeAgo(brief.generated_at)}). Refresh for Albert's latest read.`}</span>
            <button onClick={refreshBrief} disabled={refreshing} className="shrink-0 rounded-md bg-amber-500/20 px-2 py-1 font-semibold text-amber-100 transition-colors hover:bg-amber-500/30 disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh now'}</button>
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-lg px-3 py-1 text-sm font-bold" style={{ backgroundColor: bias.color + '18', color: bias.color }}>{bias.label} · {dec.regime || '—'}</span>
            {brief && (brief.observations || []).length ? (
              <ul className="mt-3 space-y-1.5">
                {(brief.observations || []).map((o, i) => (<li key={i} className="flex gap-2 text-[15px] leading-relaxed text-slate-200"><span className="text-sky-500">•</span>{o}</li>))}
              </ul>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-slate-200">{(brief && brief.take) || dec.summary || 'Building today’s brief…'}</p>
            )}
            {brief && brief.take && (brief.observations || []).length ? (
              <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3 text-sm font-medium text-white"><span className="text-sky-400">Take:</span> {brief.take}</p>
            ) : null}
            {dec.summary && (
              <div className="mt-3">
                <button onClick={() => setTechOpen((o) => !o)} className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200">
                  <Brain className="h-3.5 w-3.5" />{techOpen ? 'Hide technical briefing' : 'Read Albert’s technical briefing'}
                </button>
                {techOpen && <p className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-3 text-[13px] leading-relaxed text-slate-300">{dec.summary}</p>}
              </div>
            )}
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">What matters today</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {mattersChips.map((c) => (
                <button key={c.label} onClick={() => onNav(c.nav)} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-500/40">
                  {c.label}{sideIcon(c.side)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <StrategiesBriefing onNav={onNav} />
            <WeeklyBriefCard onNav={onNav} />

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-2"><p className="text-[10px] uppercase text-slate-500">Support</p><p className="text-sm font-bold text-emerald-300">{bear ? `$${bear.trigger_level.toLocaleString()}` : '—'}</p></div>
              <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-2"><p className="text-[10px] uppercase text-slate-500">Resistance</p><p className="text-sm font-bold text-red-300">{bull ? `$${bull.trigger_level.toLocaleString()}` : '—'}</p></div>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2"><p className="text-[10px] uppercase text-slate-500">Invalidation</p><p className="text-sm font-bold text-amber-300">{bear ? `$${bear.target_level.toLocaleString()}` : '—'}</p></div>
            </div>
          </div>
        </div>
        {/* Focus area — moved below to make way for the strategies briefing */}
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Focus area</p>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2 text-left font-medium">Focus area</th><th className="px-3 py-2 text-right font-medium">Score</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {comps.map((c) => (
                  <tr key={c.name} className="cursor-pointer hover:bg-slate-800/30" onClick={() => onNav(c.name === 'News Flow' ? 'news' : c.name === 'Macro / Policy' ? 'macro' : 'market-intel')}>
                    <td className="px-3 py-2"><p className="font-medium text-slate-200">{c.name}</p><p className="text-[11px] text-slate-500">{compAssess[c.name] || ''}</p></td>
                    <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: scoreColor(c.score) }}>{c.score}<span className="text-[10px] text-slate-600"> · {c.weight}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Chart + Live sentiment feed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><CandlestickChart className="h-4 w-4 text-sky-400" />BTC / USD · 90-day</h3>
            <button onClick={() => onNav('market-intel')} className="text-[11px] font-semibold text-sky-400 hover:text-sky-300">Open chart →</button>
          </div>
          {ohlc.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={ohlc} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <defs><linearGradient id="execFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} /><stop offset="100%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} interval={14} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} width={54} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtUsd(v), 'Close']} />
                <Area type="monotone" dataKey="c" stroke="#38bdf8" strokeWidth={2} fill="url(#execFill)" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-slate-500">Price history loading…</p>}
        </Card>
        <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Radio className="h-4 w-4 text-violet-400" />Live Sentiment</h3>
            <button onClick={() => onNav('news')} className="text-[11px] font-semibold text-sky-400 hover:text-sky-300">View all →</button>
          </div>
          <div className="space-y-3">
            {cards.length === 0 ? <p className="text-sm text-slate-500">Loading headlines…</p> : cards.map((c, i) => {
              const bcol = c.direction === 'Bullish' ? 'text-emerald-300 border-emerald-500/30' : c.direction === 'Bearish' ? 'text-red-300 border-red-500/30' : 'text-amber-300 border-amber-500/30';
              return (
                <button key={i} onClick={() => onNav('news')} className="block w-full border-l-2 border-slate-700 pl-3 text-left hover:border-sky-500">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${bcol}`}>{c.direction || 'Neutral'}</span>
                    {c.impact_score != null && <span className="text-[10px] text-slate-500">impact {c.impact_score}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-200">{c.title}</p>
                  {c.source && <p className="text-[10px] text-slate-500">{c.source}</p>}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Decision engine & signal matrix */}
      <Card className="border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Brain className="h-4 w-4 text-amber-400" />Decision Engine &amp; Signal Matrix</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <button onClick={() => onNav('risk')} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-left hover:border-sky-500/40">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-500"><ShieldAlert className="h-3 w-3" />Risk Regime</p>
            <p className={`mt-1 text-lg font-black ${riskColor(dec.risk_level)}`}>{dec.risk_level || '—'}</p>
          </button>
          <button onClick={() => onNav('overview')} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-left hover:border-sky-500/40">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-500"><Scale className="h-3 w-3" />Signal Alignment</p>
            <p className={`mt-1 text-sm font-bold leading-tight ${alignColor(dec.alignment)}`}>{dec.alignment || '—'}</p>
          </button>
          <button onClick={() => onNav('smartmoney')} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-left hover:border-sky-500/40">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-500"><Waves className="h-3 w-3" />Market Regime</p>
            <p className="mt-1 text-lg font-bold leading-tight text-white">{re.regime_label || dec.regime || '—'}</p>
          </button>
          <button onClick={() => onNav('overview')} className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm font-semibold text-sky-200 hover:bg-sky-500/20">
            <BarChart3 className="h-4 w-4" />Inspect Signal Breakdown
          </button>
        </div>
      </Card>

      {/* Scenario simulator */}
      <ScenarioSimulator d={d} onNav={onNav} />
    </div>
  );
}

function DataTrustSection({ d }) {
  // Prefer the LIVE real-time audit (recomputed at request time from actual cache
  // timestamps); fall back to the frozen snapshot in the last run doc.
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`${API_BASE}/v1/data-audit`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (alive && j && j.status === 'ready') setLive(j); })
      .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const h = live || d.data_health;
  if (!h) return <ComingSoonSection section={sec('trust')} />;
  const col = h.score >= 90 ? '#34d399' : h.score >= 75 ? '#a3e635' : h.score >= 55 ? '#fbbf24' : '#f87171';
  const feeds = h.feeds || [];
  const coreFeeds = feeds.filter((f) => f.core !== false);
  const auxFeeds = feeds.filter((f) => f.core === false);
  const FeedCard = (f) => (
    <Card key={f.id} className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${feedDot(f.status)} ${f.status === 'live' ? 'animate-pulse' : ''}`} />
        <h3 className="font-semibold text-white">{f.label}</h3>
        <span className={`ml-auto text-xs font-bold uppercase ${feedColor(f.status)}`}>{f.status}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-slate-500">Provider</p><p className="font-medium text-slate-300">{f.provider}</p></div>
        <div><p className="text-slate-500">Freshness</p><p className="font-medium text-slate-300">{ageTxt(f.age_min)}</p></div>
        <div><p className="text-slate-500">Confidence</p><p className="font-medium text-slate-300">{f.confidence}%</p></div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full" style={{ width: `${f.confidence}%`, backgroundColor: f.confidence >= 90 ? '#34d399' : f.confidence >= 70 ? '#fbbf24' : '#f87171' }} /></div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{f.methodology}</p>
    </Card>
  );
  return (
    <div className="space-y-5">
      <SectionHead icon={ShieldCheck} title="Data Trust" blurb={sec('trust').blurb} />
      <Card className={`border-0 bg-gradient-to-br from-slate-900 to-slate-950 p-6 ring-1 ${h.faded ? 'ring-orange-500/40' : 'ring-emerald-500/25'}`}>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-400">Overall Data Trust<InfoTip below text="A 0–100 score for how fresh and reliable the underlying CORE data feeds are. When trust drops, the model automatically tones down its odds. Auxiliary feeds are shown for transparency but don't fade the odds." /></p>
            <p className="text-5xl font-black" style={{ color: col }}>{h.score}</p>
            <p className="text-sm font-semibold" style={{ color: col }}>{h.level}</p>
            {live && <p className="mt-1 text-[10px] text-emerald-400/80">● live · re-checked every 60s</p>}
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2 text-center"><p className="text-xl font-bold text-emerald-400">{h.live}</p><p className="text-[10px] text-slate-500">live</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2 text-center"><p className="text-xl font-bold text-amber-400">{h.degraded}</p><p className="text-[10px] text-slate-500">delayed</p></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2 text-center"><p className="text-xl font-bold text-orange-400">{h.stale}</p><p className="text-[10px] text-slate-500">stale/down</p></div>
          </div>
          <div className={`ml-auto max-w-md rounded-lg border p-3 text-sm ${h.faded ? 'border-orange-500/30 bg-orange-500/10 text-orange-200' : 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200'}`}>
            {h.faded ? <ShieldAlert className="mb-1 h-4 w-4" /> : <ShieldCheck className="mb-1 h-4 w-4" />}{h.note}
          </div>
        </div>
      </Card>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Core signals · drive the odds</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{coreFeeds.map(FeedCard)}</div>
      </div>
      {auxFeeds.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Auxiliary data · monitored, non-fading<InfoTip text="Supplementary feeds (ETF flows, on-chain, derivatives, sentiment). They're health-checked in real time and shown here, but a gap in these won't fade the directional odds." /></p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{auxFeeds.map(FeedCard)}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Event Calendar ---------------------------- */
const catColor = (c) => ({ Macro: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  Derivatives: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  'On-Chain': 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Regulatory: 'text-red-400 border-red-500/30 bg-red-500/10' }[c] || 'text-slate-400 border-slate-700');

function EventsSection({ d }) {
  const ec = d.event_calendar;
  if (!ec) return <ComingSoonSection section={sec('events')} />;
  const nx = ec.next_high_impact;
  return (
    <div className="space-y-5">
      <SectionHead icon={CalendarClock} title="Event Calendar" blurb={sec('events').blurb} />
      <AiReview section="events" text="Albert is reviewing the event calendar…" voice />
      {nx && (
        <Card className="border-0 bg-gradient-to-r from-orange-500/10 to-slate-900 p-5 ring-1 ring-orange-500/30">
          <div className="flex flex-wrap items-center gap-4">
            <div><p className="text-[11px] uppercase tracking-wider text-orange-300">Next high-impact event</p><p className="text-lg font-bold text-white">{nx.title}</p><p className="text-xs text-slate-400">{nx.description}</p></div>
            <div className="ml-auto text-center"><p className="text-3xl font-black text-orange-400">{countdown(nx.date)}</p><p className="text-[11px] text-slate-500">{nx.date}</p></div>
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ec.counts).map(([c, n]) => (
          <span key={c} className={`rounded-full border px-3 py-1 text-xs font-medium ${catColor(c)}`}>{c} · {n}</span>
        ))}
        <span className="ml-auto text-xs text-slate-500">next {ec.window_days} days · {ec.events.length} events</span>
      </div>
      <div className="space-y-2">
        {ec.events.map((e, i) => (
          <Card key={i} className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-16 text-center">
                <p className="text-lg font-black text-white">{countdown(e.date)}</p>
                <p className="text-[10px] text-slate-500">{e.date.slice(5)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${catColor(e.category)}`}>{e.category}</span>
                  <span className="font-semibold text-white">{e.title}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${impColor(e.importance)}`}>{e.importance}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{e.description}</p>
              </div>
              <div className="w-28">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Exp. volatility</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${volColor(e.expected_volatility)}`} style={{ width: `${volPct(e.expected_volatility)}%` }} /></div>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">{e.expected_volatility}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Ask Quant ----------------------------- */
function AskQuantSection({ d }) {
  const symbol = React.useContext(SymbolContext);
  const pid = React.useMemo(() => getPid(), []);
  const { messages, setMessages, sessionId, clear, threads, threadId, switchThread, newThread, renameThread, deleteThread } = useAlbertChat(pid);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [deep, setDeep] = React.useState(false);
  const [rateUntil, setRateUntil] = React.useState(0);
  const [, setRateTick] = React.useState(0);
  const endRef = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const shown = search.trim() ? messages.filter((m) => (m.text || '').toLowerCase().includes(search.trim().toLowerCase())) : messages;
  const copyAll = () => {
    const txt = chatToText(messages);
    if (!txt) return;
    try { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) { /* noop */ }
  };

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  React.useEffect(() => {
    if (!rateUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= rateUntil) setRateUntil(0);
      else setRateTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [rateUntil]);
  const rateSecondsLeft = rateUntil ? Math.max(0, Math.ceil((rateUntil - Date.now()) / 1000)) : 0;

  const suggestions = [
    'Critique my strategy: I DCA weekly with no stop — poke holes in it.',
    'What are the current cycle distribution / top signals?',
    'How are Fed policy & spot ETF flows shaping BTC right now?',
    'How should I set stop-loss and invalidation levels here?',
    'Healthy pullback to add, or structural breakdown to cut?',
    `Give me the candid 10-second read on ${symbol} right now.`,
    'How does BTC compare to gold, DXY and the S&P this month?',
    'Compare this setup to a past halving-cycle analog.',
  ];

  const send = async (text, extra) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setLoading(true);
    const ctrl = new AbortController();
    // 60s (non-deep) so an inline basket build (Basket from Chat, ~30-45s) completes; deep gets 95s.
    const timer = setTimeout(() => ctrl.abort(), deep ? 95000 : 60000);
    try {
      const r = await fetch(`${API_BASE}/v1/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msg, symbol, deep, pid, driver_context: extra && extra.driver_context }),
        signal: ctrl.signal,
      });
      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        const secs = Math.max(1, Math.min(120, Number(j.retry_in) || 30));
        setLoading(false);
        setMessages((m) => m.slice(0, -1));
        setInput(msg);
        setRateUntil(Date.now() + secs * 1000);
        return;
      }
      const j = await r.json();
      if (j && j.status === 'rate_limited') {
        const secs = Math.max(1, Math.min(120, Number(j.retry_in) || 30));
        setLoading(false);
        setMessages((m) => m.slice(0, -1));
        setInput(msg);
        setRateUntil(Date.now() + secs * 1000);
        return;
      }
      setRateUntil(0);
      setMessages((m) => [...m, { role: 'assistant', text: j.text || 'Sorry, I could not answer that just now.', sources: j.sources || [], basket_draft: j.basket_draft || null, basket_rebalance: j.basket_rebalance || null, basket_close: j.basket_close || null, mandate_change: j.mandate_change || null }]);
    } catch (e) {
      const aborted = e && e.name === 'AbortError';
      setMessages((m) => [...m, { role: 'assistant', error: true, retry: msg, text: aborted ? 'That took longer than expected — please try again (or turn off Deep dive for a faster answer).' : 'Network error — please try again.' }]);
    } finally { clearTimeout(timer); setLoading(false); }
  };

  // Driver -> chat handoff: consume an "albert:ask" (may have been dispatched just
  // before this section mounted, so also drain a one-shot window buffer). Uses a ref
  // so the latest send() (current thread/sessionId) is always called.
  const sendRef = React.useRef(send);
  sendRef.current = send;
  React.useEffect(() => {
    const consume = (detail) => {
      if (!detail || !detail.question) return;
      sendRef.current(detail.question, { driver_context: detail.driver_context });
    };
    try { if (window.__albertPendingAsk) { const p = window.__albertPendingAsk; window.__albertPendingAsk = null; setTimeout(() => consume(p), 60); } } catch (e) { /* noop */ }
    const onAsk = (e) => consume(e.detail);
    window.addEventListener('albert:ask', onAsk);
    return () => window.removeEventListener('albert:ask', onAsk);
  }, []); // eslint-disable-line

  return (
    <div className="space-y-5">
      <SectionHead icon={MessageCircle} title="Ask Albert" blurb={sec('ask').blurb} />
      <Card className="flex h-[calc(100vh-8rem)] min-h-[520px] flex-col overflow-hidden border-0 bg-slate-900 p-0 ring-1 ring-slate-800">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-3">
          <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-sky-500/40" />
          <div><p className="text-sm font-semibold text-white">Albert · Ask Albert HuCentAI Quant</p><p className="text-[10px] text-slate-500">Crypto strategist & advisor · live dashboard + web search · fast by default, Deep dive for depth</p></div>
          <div className="ml-auto flex items-center gap-1">
            {messages.length > 0 && (
              <>
                <div className="mr-1 hidden items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 sm:flex">
                  <Search className="h-3.5 w-3.5 text-slate-500" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-28 bg-transparent text-[12px] text-slate-100 placeholder-slate-500 focus:outline-none" />
                  {search && <span className="text-[10px] text-slate-500">{shown.length}</span>}
                  {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300"><X className="h-3 w-3" /></button>}
                </div>
                <button onClick={copyAll} title="Copy whole conversation" className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">{copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}</button>
                <button onClick={clear} title="Start a new chat" className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"><MessageSquarePlus className="h-3.5 w-3.5" />New</button>
              </>
            )}
            <ThreadMenu threads={threads} activeId={threadId} title="Chats" onSwitch={switchThread} onNew={newThread} onRename={renameThread} onDelete={deleteThread} />
            <span className="ml-1 flex items-center gap-1 text-[10px] font-bold text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400" />LIVE</span>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <img src="/albert.png" alt="Albert" className="h-24 w-24 rounded-full object-cover ring-2 ring-sky-500/40" />
              <div>
                <p className="font-semibold text-slate-200">Hi, I’m Albert — your market mentor & sounding board</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">I blend the live dashboard (score, regime, forecasts, flows) with 100+ years of market wisdom and live web search for macro, cycles and strategy. I’ll give you the candid read — never invent dashboard numbers.</p>
              </div>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => send(s)} className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-500/40 hover:text-sky-300">{s}</button>
                ))}
              </div>
            </div>
          )}
          {shown.map((m, i) => (
            <div key={i} className={`group flex items-end gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <img src="/albert.png" alt="Albert" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-sky-500/30" />}
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'whitespace-pre-wrap bg-sky-500/15 text-sky-50 ring-1 ring-sky-500/25' : 'bg-slate-950/60 text-slate-200 ring-1 ring-slate-800'}`}>
                {m.role === 'assistant' ? <><AlbertText text={m.text} />{m.error && m.retry ? <button onClick={() => send(m.retry)} disabled={loading} className="mt-2 flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-50"><RefreshCw className="h-3 w-3" />Retry</button> : m.basket_draft ? <BasketChatCard draft={m.basket_draft} pid={pid} /> : m.basket_rebalance ? <BasketRebalanceCard rebalance={m.basket_rebalance} /> : m.basket_close ? <BasketCloseCard close={m.basket_close} /> : m.mandate_change ? <MandateChangeCard change={m.mandate_change} pid={pid} /> : <AlbertReplyMeta text={m.text} sources={m.sources} symbol={symbol} pid={pid} />}</> : m.text}
              </div>
              {!m.error && (m.text || '').trim() && <CopyButton text={m.text} className="shrink-0 self-center text-slate-500 hover:text-slate-200" />}
            </div>
          ))}
          {loading && (
            <div className="flex items-end justify-start gap-2">
              <img src="/albert.png" alt="Albert" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-sky-500/30" />
              <div className="flex items-center gap-1.5 rounded-2xl bg-slate-950/60 px-4 py-3 ring-1 ring-slate-800">
                <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          {!loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
            <div className="flex flex-wrap gap-2 pl-9">
              {[
                ["Explain like I’m 5", "Explain your last answer like I’m 5 years old, in very simple plain words."],
                ["Give me the risks", "What are the main risks or things that could go wrong with what you just told me?"],
                ["What would change your mind?", "What would have to happen for your view to change?"],
                ["What do I watch next?", "In one or two lines, what key levels or signals should I watch next?"],
              ].map(([label, prompt]) => (
                <button key={label} onClick={() => send(prompt)} className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-sky-500/40 hover:text-sky-300">{label}</button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-slate-800 p-3">
          {rateSecondsLeft > 0 && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-300">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>You're chatting a little fast — Albert takes up to 10 messages a minute. Try again in <span className="font-semibold tabular-nums">{rateSecondsLeft}s</span>.</span>
            </div>
          )}
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => setDeep((v) => !v)} title="Deep dive uses the heavy reasoning model for a more thorough answer (slower)"
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${deep ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}>
              <Brain className="h-4 w-4" />Deep dive {deep ? 'ON' : 'OFF'}
            </button>
            {deep && <span className="text-[11px] text-slate-500">Heavy reasoning model · slower, more thorough</span>}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Ask Albert: is it time to buy or sell? entries/exits, strategy, macro, cycles…"
              className="max-h-32 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none"
            />
            <MicButton value={input} onChange={setInput} disabled={loading || rateSecondsLeft > 0} />
            <Button onClick={() => send()} disabled={loading || !input.trim() || rateSecondsLeft > 0} className="gap-1.5 bg-sky-500 hover:bg-sky-400"><Send className="h-4 w-4" />Send</Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-600">Albert blends the live Ask Albert dashboard with real-time web search · powerful, but markets are uncertain — always do your own research.</p>
        </div>
      </Card>
      <AlbertIntroCard />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <PortfolioPanel />
          <AlertManager />
        </div>
        <AlbertTrackRecord />
      </div>
      <WeeklyRecap />
    </div>
  );
}

// ---- Floating, screen-aware Ask Albert extracted to components/FloatingAlbert ----



// DailyReportModal moved to components/DailyReport (imported at top).

/* ---------------- Stage-1: Risk / Smart Money / Institutional / Settings --------------- */

function DemoMetricsCard({ title, icon: Icon, panel, sectionId }) {
  const expected = sectionId === 'smartmoney'
    ? ['MVRV Z-score', 'SOPR', 'Active addresses (30d)', 'Fear & Greed', 'Exchange balance (14d)', 'Accumulation trend score', 'Long-term holder supply (14d)', 'Exchange reserves (30d)', 'Whale wallets ≥1k BTC', 'Long-term holder supply', 'Realised profit/loss ratio', 'Dormant supply movement']
    : ['Futures open interest', 'Funding rate', 'Long/short account ratio', 'Taker buy/sell ratio', 'Spot ETF net flow (1d)', 'Spot ETF net flow (7d)', 'CME open interest', 'CME basis (annualised)', 'Grayscale/HODL trend'];
  const rows = panel?.demo ? [] : (panel?.metrics || []);
  const metrics = expected.map((name) => rows.find((m) => m.name === name || name === 'Fear & Greed' && m.name?.startsWith('Fear & Greed')) || { name, status: 'coming_soon' });
  const ready = metrics.some((m) => m.status === 'ready' && !m.inactive && observed(m.value, m.source, m.as_of));
  return (
    <div className="space-y-5">
      <SectionHead icon={Icon} title={title} blurb={sec(sectionId).blurb} />
      {ready && <AiReview section={sectionId} text={`Albert is reviewing sourced ${title.toLowerCase()} observations…`} voice />}
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Icon className="h-5 w-5 text-sky-400" />
          <h3 className="flex items-center gap-1 font-semibold text-white">{ready ? panel?.headline : 'Coming soon'}<InfoTip below text="Each observed metric has its own source and observation time. Missing metrics are not counted as neutral signals." /></h3>
          {ready && <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">Measured</span>}
        </div>
        <div className="space-y-2">
          {metrics.map((m, i) => {
            const valid = m.status === 'ready' && !m.inactive && observed(m.value, m.source, m.as_of);
            return <div key={`${m.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
              <span className="min-w-[150px] flex-1 text-slate-300">{m.name}</span>
              {valid && m.spark && <Spark data={m.spark} color={sigHex(m.signal)} />}
              <span className={`font-mono ${valid ? 'text-slate-200' : 'text-amber-300'}`}>{valid ? m.value : 'Coming soon'}</span>
              {valid && m.signal && <span className={`w-16 text-right text-xs font-semibold ${sigColor(m.signal)}`}>{m.signal}</span>}
              {valid && <div className="w-full"><MetricProvenance source={m.source} asOf={m.as_of} /></div>}
            </div>;
          })}
        </div>
        <p className="mt-4 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 text-[11px] text-slate-300">{ready ? 'Only individually sourced observations are shown. Other metrics remain Coming soon.' : 'Coming soon · no valid dated readings for this panel. Other sections, including separately reported ETF flows, remain available.'} Missing metrics are never counted as neutral evidence or paper-trading input.</p>
      </Card>
    </div>
  );
}

/* ---------------- Phase A: Network & Sentiment / Exchange Flow / Morning Brief / Admin ---------------- */
// useFetch moved to lib/useFetch (imported at top).

function MorningBriefCard() {
  const [d, loading] = useFetch(`${API_BASE}/v1/albert/brief`);
  const obs = (d && d.observations) || [];
  const [techOpen, setTechOpen] = React.useState(false);
  const [tech, setTech] = React.useState(null);
  const [techLoading, setTechLoading] = React.useState(false);
  const openTech = async () => {
    setTechOpen((o) => !o);
    if (!tech && !techLoading) {
      setTechLoading(true);
      try {
        const r = await fetch(`${API_BASE}/v1/albert/brief?mode=technical`, { cache: 'no-store' });
        setTech(await r.json());
      } catch (e) { /* noop */ } finally { setTechLoading(false); }
    }
  };
  const techObs = (tech && tech.observations) || [];
  const hasBrief = obs.length || (d && d.take);
  // Plain-first: technical brief opens only on explicit user action, never auto
  // from a stored Pro preference.
  return (
    <Card className="border-0 bg-gradient-to-br from-sky-950/40 to-slate-900 p-6 ring-1 ring-sky-900/50">
      <div className="mb-3 flex items-center gap-2">
        <img src="/albert.png" alt="Albert" className="h-9 w-9 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <h3 className="font-semibold text-white">Albert's Morning Brief</h3>
        <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-300">Plain English</span>
      </div>
      {loading ? <p className="text-sm text-slate-500">Albert is pulling together today's whole-market read…</p>
        : !hasBrief ? <p className="text-sm text-slate-500">Brief is generating — check back in a moment.</p>
          : (<>
            <ul className="space-y-1.5">{obs.map((o, i) => (<li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-sky-500">•</span>{o}</li>))}</ul>
            {d && d.take && <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3 text-sm font-medium text-white"><span className="text-sky-400">Take:</span> {d.take}</p>}
            <div className="mt-3 border-t border-slate-800 pt-2.5">
              <button onClick={openTech} className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-300 transition-colors hover:text-violet-200">
                <Brain className="h-3.5 w-3.5" />{techOpen ? 'Hide technical briefing' : "Read Albert’s technical briefing"}
              </button>
              {techOpen && (
                <div className="mt-2.5">
                  {techLoading && !tech ? <p className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />Albert is writing the technical briefing…</p>
                    : (<>
                      <ul className="space-y-1.5">{techObs.map((o, i) => (<li key={i} className="flex gap-2 text-[13px] text-slate-300"><span className="text-violet-400">•</span>{o}</li>))}</ul>
                      {tech && tech.take && <p className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-2.5 text-[13px] text-white"><span className="text-violet-300">Take:</span> {tech.take}</p>}
                    </>)}
                </div>
              )}
            </div>
          </>)}
    </Card>
  );
}

function NetworkSentimentSection() {
  const [fg, fgLoad] = useFetch(`${API_BASE}/v1/fear-greed`);
  const [nh, nhLoad] = useFetch(`${API_BASE}/v1/network-health`);
  const fgColor = (v) => v == null ? '#94a3b8' : v <= 25 ? '#f87171' : v <= 45 ? '#fb923c' : v <= 55 ? '#94a3b8' : v <= 75 ? '#a3e635' : '#34d399';
  const fgHist = (fg && fg.history || []).map((h) => ({ ts: h.ts, v: h.value }));
  const hseries = (nh && nh.hashrate_series || []);
  return (
    <div className="space-y-5">
      <SectionHead icon={Activity} title="Network & Sentiment" blurb={sec('network').blurb} coin="BTC" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Fear & Greed */}
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center gap-2"><h3 className="flex items-center gap-1 font-semibold text-white">Fear &amp; Greed Index<InfoTip below text="A 0-100 gauge of crypto crowd emotion (0 = Extreme Fear, 100 = Extreme Greed). Extremes can mark turning points but are not timing signals." /></h3><span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">Live</span></div>
          {fgLoad ? <p className="text-sm text-slate-500">Loading sentiment…</p> : !fg || fg.value == null ? <p className="text-sm text-slate-500">No Fear &amp; Greed data available.</p> : (<>
            <div className="flex items-center gap-5">
              <div className="text-center"><LevGauge value={fg.value} label={fg.label} color={fgColor(fg.value)} /></div>
              <div className="text-sm text-slate-400">
                <div>Now: <span className="font-bold" style={{ color: fgColor(fg.value) }}>{fg.value} · {fg.label}</span></div>
                <div className="mt-1">1 week ago: <span className="text-slate-200">{fg.week_ago}</span></div>
                <div>1 month ago: <span className="text-slate-200">{fg.month_ago}</span></div>
              </div>
            </div>
            <div className="mt-3 h-20 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fgHist} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
                  <YAxis domain={[0, 100]} hide /><XAxis dataKey="ts" hide />
                  <ReferenceLine y={25} stroke="#7f1d1d" strokeDasharray="3 3" /><ReferenceLine y={75} stroke="#14532d" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelFormatter={() => ''} formatter={(v) => [v, 'F&G']} />
                  <Line type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={1.6} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{fg.read}</p>
          </>)}
        </Card>
        {/* Network health */}
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <div className="mb-3 flex items-center gap-2"><h3 className="flex items-center gap-1 font-semibold text-white">Network Health<InfoTip below text="How secure and congested the Bitcoin network is: hashrate (mining power securing it), difficulty (auto-adjusts every ~2 weeks), mempool backlog and fees to confirm quickly." /></h3><span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">Live</span></div>
          {nhLoad ? <p className="text-sm text-slate-500">Loading network data…</p> : !nh ? <p className="text-sm text-amber-300">Coming soon · network feeds unavailable.</p> : (<>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2.5"><div className="text-[10px] text-slate-500">Hashrate</div><div className="font-semibold text-white">{nh.hashrate_ehs != null ? `${nh.hashrate_ehs} EH/s` : 'Coming soon'}</div></div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2.5"><div className="text-[10px] text-slate-500">Next difficulty</div><div className="font-semibold text-white">{nh.difficulty_change_pct != null ? `${nh.difficulty_change_pct >= 0 ? '+' : ''}${nh.difficulty_change_pct}%` : 'Coming soon'}</div><div className="text-[10px] text-slate-600">{nh.retarget_days != null ? `~${nh.retarget_days}d` : 'Time unavailable'}</div></div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2.5"><div className="text-[10px] text-slate-500">Fees ({nh.fees?.state || 'Coming soon'})</div><div className="font-semibold text-white">{nh.fees?.fastest != null ? `${nh.fees.fastest} sat/vB` : 'Coming soon'}</div></div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2.5"><div className="text-[10px] text-slate-500">Mempool</div><div className="font-semibold text-white">{nh.mempool?.congestion || 'Coming soon'}</div><div className="text-[10px] text-slate-600">{nh.mempool?.count != null ? `${Number(nh.mempool.count).toLocaleString()} txns` : 'Count unavailable'}</div></div>
            </div>
            {hseries.length > 1 && <div className="mt-3 h-20 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hseries} margin={{ top: 2, right: 4, left: -22, bottom: 0 }}>
                  <YAxis hide domain={['auto', 'auto']} /><XAxis dataKey="ts" hide />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelFormatter={() => ''} formatter={(v) => [v + ' EH/s', 'Hashrate']} />
                  <Line type="monotone" dataKey="v" stroke="#fbbf24" strokeWidth={1.6} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>}
            <p className="mt-2 text-[11px] text-slate-400">{nh.read}</p>
          </>)}
        </Card>
      </div>
    </div>
  );
}


// ---- AI Model Switcher (Flash vs Pro per feature) ----
function ModelSwitcher() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState('');
  const load = useCallback(() => {
    fetch(`${API_BASE}/v1/settings/models`, { cache: 'no-store' })
      .then((r) => r.json()).then(setData).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const setTier = (key, tier) => {
    if (!data || (data.prefs?.[key] === tier)) return;
    setSaving(key);
    setData((cur) => ({ ...cur, prefs: { ...cur.prefs, [key]: tier } })); // optimistic
    fetch(`${API_BASE}/v1/settings/models`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: { [key]: tier } }),
    }).then((r) => r.json())
      .then((d) => { if (d && d.prefs) setData((cur) => ({ ...cur, prefs: d.prefs })); })
      .catch(() => {}).finally(() => setSaving(''));
  };

  const flashName = data?.models?.flash || 'gemini-3-flash-preview';
  const proName = data?.models?.pro || 'gemini-3.1-pro-preview';

  return (
    <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
      <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-white">
        <Cpu className="h-4 w-4 text-sky-400" />AI Models
        <InfoTip below text="Choose which Gemini model powers each AI feature. Flash is fast and cheap; Pro reasons more deeply (slower, higher cost). Changes apply to the next request. Note: live web-search answers always run on Flash." />
      </h3>
      <p className="mb-4 text-[12px] text-slate-500">Balance speed, cost and depth per feature.</p>
      {!data ? (
        <p className="text-sm text-slate-500">Loading model settings…</p>
      ) : (
        <div className="space-y-2.5">
          {(data.features || []).map((f) => {
            const cur = data.prefs?.[f.key] || f.default;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">{f.label}</div>
                  <div className="font-mono text-[10px] text-slate-500">{cur === 'pro' ? proName : flashName}</div>
                </div>
                <div className="flex shrink-0 items-center rounded-md border border-slate-700 bg-slate-900 p-0.5">
                  <button
                    onClick={() => setTier(f.key, 'flash')}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition ${cur === 'flash' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  ><Zap className="h-3 w-3" />Flash</button>
                  <button
                    onClick={() => setTier(f.key, 'pro')}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition ${cur === 'pro' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  ><Brain className="h-3 w-3" />Pro</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-sky-400" />Flash · <span className="font-mono">{flashName}</span></span>
        <span className="flex items-center gap-1"><Brain className="h-3 w-3 text-violet-400" />Pro · <span className="font-mono">{proName}</span></span>
      </div>
    </Card>
  );
}



// ---- Data Audit (Composite Price · Provenance · GDELT · Cross-Asset · FRED Macro) ----
function AdminSection({ user, onSignOut }) {
  const [d, loading] = useFetch(`${API_BASE}/v1/admin/overview`);
  const stColor = (s) => s === 'Active' ? 'text-emerald-400' : 'text-slate-500';
  const ageColor = (m) => m == null ? 'text-slate-600' : m < 60 ? 'text-emerald-400' : m < 360 ? 'text-amber-400' : 'text-red-400';
  const em = (d && d.costs && d.costs.emergent) || {};
  return (
    <div className="space-y-5">
      <SectionHead icon={ShieldCheck} title="Admin" blurb={sec('admin').blurb} coin="BTC" />
      {user && (
        <Card className="border-0 bg-slate-900 p-4 ring-1 ring-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {user.picture
                ? <img src={user.picture} alt={user.name || user.email} className="h-10 w-10 rounded-full ring-1 ring-slate-700" referrerPolicy="no-referrer" />
                : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-sm font-semibold text-sky-300">{(user.name || user.email || '?').slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{user.name || 'Signed in'}</div>
                <div className="truncate text-[11px] text-slate-500">{user.email}</div>
              </div>
            </div>
            <Button onClick={onSignOut} variant="outline" className="shrink-0 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800">
              <LogOut className="mr-1.5 h-3.5 w-3.5" />Sign out
            </Button>
          </div>
        </Card>
      )}
      {loading ? <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-sm text-slate-500">Loading admin overview…</p></Card> : !d || d.status !== 'ready' ? <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800"><p className="text-sm text-slate-500">Admin data unavailable.</p></Card> : (<>
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4"><div className="text-[11px] text-slate-500">Integrations active</div><div className="text-2xl font-bold text-white">{d.integrations_active}<span className="text-sm text-slate-500">/{d.integrations_total}</span></div></div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4"><div className="text-[11px] text-slate-500">LLM calls (total)</div><div className="text-2xl font-bold text-white">{d.usage.llm_calls_total}</div><div className="text-[10px] text-slate-600">{d.usage.llm_calls_today} today</div></div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4"><div className="text-[11px] text-slate-500">Est. LLM cost</div><div className="text-2xl font-bold text-white">${d.costs.est_llm_cost_usd}</div><div className="text-[10px] text-slate-600">${d.costs.est_llm_cost_today_usd} today</div></div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4"><div className="text-[11px] text-slate-500">Whales tracked</div><div className="text-2xl font-bold text-white">{d.usage.whales_tracked}</div></div>
        </div>

        {/* Integrations */}
        <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
          <h3 className="mb-3 font-semibold text-white">Integrations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="pb-2">Service</th><th className="pb-2">Category</th><th className="pb-2">Auth</th><th className="pb-2">Cost</th><th className="pb-2 text-right">Status</th></tr></thead>
              <tbody>{(d.integrations || []).map((it, i) => (
                <tr key={i} className="border-t border-slate-800/60"><td className="py-2 font-medium text-slate-200">{it.name}</td><td className="py-2 text-slate-400">{it.category}</td><td className="py-2 text-slate-500">{it.auth}</td><td className="py-2 text-slate-500">{it.cost}</td><td className={`py-2 text-right font-semibold ${stColor(it.status)}`}>{it.status === 'Active' ? '● Active' : '○ ' + it.status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>

        <ModelSwitcher />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Emergent cost */}
          <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
            <h3 className="mb-3 flex items-center gap-1 font-semibold text-white">Gemini LLM Cost<InfoTip below text="Cost of the Gemini model calls made directly via your Google AI Studio API key. Figures are a rough estimate from call counts — exact spend is in your Google AI Studio / Cloud billing dashboard." /></h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-slate-800 bg-slate-950/40 p-3"><div className="text-[11px] text-slate-500">Model</div><div className="font-mono text-slate-200">{em.model}</div></div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-3"><div className="text-[11px] text-slate-500">Status</div><div className={`font-semibold ${stColor(em.status)}`}>{em.status}</div></div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-3"><div className="text-[11px] text-slate-500">Calls (total / today)</div><div className="font-semibold text-white">{em.llm_calls_total} / {em.llm_calls_today}</div></div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-3"><div className="text-[11px] text-slate-500">Est. cost (total / today)</div><div className="font-semibold text-white">${em.est_cost_total_usd} / ${em.est_cost_today_usd}</div></div>
            </div>
            <p className="mt-3 text-[11px] italic text-slate-500">{em.billing_note}</p>
          </Card>

          {/* Data freshness */}
          <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
            <h3 className="mb-3 font-semibold text-white">Data freshness</h3>
            <div className="space-y-1.5">{(d.freshness || []).map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm"><span className="text-slate-300">{f.source}</span><span className={`font-mono ${ageColor(f.age_min)}`}>{f.age_min == null ? 'no data' : f.age_min < 60 ? `${f.age_min}m ago` : `${(f.age_min / 60).toFixed(1)}h ago`}</span></div>
            ))}</div>
          </Card>
        </div>

        {/* Usage + scheduler + collections */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
            <h3 className="mb-3 font-semibold text-white">Usage & content</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[['Cached Albert insights', d.usage.cached_insights], ['Smart alerts', d.usage.alerts_total], ['Forecast runs logged', d.usage.runs_logged], ['Whales tracked', d.usage.whales_tracked]].map(([k, v], i) => (
                <div key={i} className="rounded border border-slate-800 bg-slate-950/40 p-2.5"><div className="text-[11px] text-slate-500">{k}</div><div className="font-semibold text-white">{v}</div></div>
              ))}
            </div>
            <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Scheduler jobs</h4>
            {(d.scheduler_jobs || []).length ? <div className="space-y-1 text-[11px]">{d.scheduler_jobs.map((j, i) => (<div key={i} className="flex justify-between"><span className="font-mono text-slate-300">{j.id}</span><span className="text-slate-500">{j.next_run ? new Date(j.next_run).toLocaleString() : '—'}</span></div>))}</div> : <p className="text-[11px] text-slate-500">No scheduled jobs reported.</p>}
          </Card>

          <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
            <h3 className="mb-3 font-semibold text-white">Database collections</h3>
            <div className="grid grid-cols-2 gap-1.5 text-sm">{Object.entries(d.collections || {}).map(([k, v], i) => (
              <div key={i} className="flex justify-between rounded border border-slate-800/60 bg-slate-950/40 px-2.5 py-1.5"><span className="font-mono text-[11px] text-slate-400">{k}</span><span className="font-semibold text-slate-200">{v}</span></div>
            ))}</div>
          </Card>
        </div>
        <p className="text-[11px] text-slate-600">As of {d.as_of ? new Date(d.as_of).toLocaleString() : '—'}. Costs for free/keyless feeds are $0; the only metered cost is the Gemini API key.</p>
      </>)}
    </div>
  );
}

/* ---------------- Leverage screen ---------------- */

function BreakerDemoCard({ passcode }) {
  const [active, setActive] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  React.useEffect(() => {
    fetch(`${API_BASE}/v1/admin/simulate-shock`).then((r) => r.json()).then((j) => setActive(!!j.active)).catch(() => {});
  }, []);
  const toggle = async () => {
    const pc = passcode || (typeof window !== 'undefined' ? window.localStorage.getItem('btciq_admin_passcode') : '') || '';
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/v1/admin/simulate-shock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: pc, on: !active }),
      });
      if (r.status === 401) { setErr('Enter & save the admin passcode above first.'); setBusy(false); return; }
      const j = await r.json();
      setActive(!!j.active);
    } catch (e) { setErr('Network error — please try again.'); } finally { setBusy(false); }
  };
  return (
    <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-white"><Zap className="h-4 w-4 text-red-400" />Circuit-breaker demo</h3>
      <p className="mb-3 text-xs text-slate-500">Admin-only: simulate a market shock to force the feature-drift circuit breaker to trip live — the dashboard immediately shows <span className="font-semibold text-slate-300">Low</span> model confidence and a rule-based fallback. No recompute needed. Toggle off to restore the real model state.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={toggle} disabled={busy || active === null} data-testid="breaker-demo-toggle"
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${active ? 'bg-red-500' : 'bg-slate-700'} disabled:opacity-50`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className={`text-sm font-semibold ${active ? 'text-red-300' : 'text-slate-400'}`}>{active === null ? 'Loading…' : active ? 'Simulated shock ACTIVE' : 'Off (real model state)'}</span>
      </div>
      {active && <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200"><ShieldAlert className="h-3.5 w-3.5 shrink-0" />Breaker tripped (simulated). See the hero chip and the Performance → Feature-Drift Circuit Breaker panel.</p>}
      {err && <p className="mt-2 text-[11px] font-semibold text-amber-400">{err}</p>}
    </Card>
  );
}

function SettingsSection({ onManualRun }) {
  const symbol = React.useContext(SymbolContext);
  const [pass, setPass] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    if (typeof window !== 'undefined') setPass(window.localStorage.getItem('btciq_admin_passcode') || '');
  }, []);
  const save = () => { if (typeof window !== 'undefined') { window.localStorage.setItem('btciq_admin_passcode', pass); setSaved(true); setTimeout(() => setSaved(false), 2000); } };
  return (
    <div className="space-y-5">
      <SectionHead icon={Cpu} title="Settings" blurb={sec('settings').blurb} coin={symbol} />
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-1 flex items-center gap-2 font-semibold text-white"><Lock className="h-4 w-4 text-amber-400" />Admin passcode</h3>
        <p className="mb-3 text-xs text-slate-500">Required to trigger a manual CryptoMarkAI forecast run. Stored only in this browser. Manual runs are rate-limited and audit-logged.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Enter admin passcode"
            className="w-64 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/50 focus:outline-none" />
          <Button onClick={save} className="bg-sky-500 hover:bg-sky-400">Save</Button>
          {saved && <span className="text-xs font-semibold text-emerald-400">Saved ✓</span>}
        </div>
      </Card>
      <BreakerDemoCard passcode={pass} />
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-1 flex items-center gap-2 font-semibold text-white"><Bell className="h-4 w-4 text-sky-400" />Daily brief coins</h3>
        <BriefWatchlistPanel />
      </Card>
      <NotificationSettings />
      <Card className="border-0 bg-slate-900 p-6 ring-1 ring-slate-800">
        <h3 className="mb-2 font-semibold text-white">About & compliance</h3>
        <p className="text-xs leading-relaxed text-slate-400">Ask Albert — Bitcoin Market Analysis, powered by CryptoCentAI, our Bitcoin-Centred Intelligence Engine. CryptoMarkAI measures the market and produces probability-based forecasts. Albert is Ask Albert’s HuCentAI Quant Analyst.</p>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Ask Albert provides Bitcoin market analysis, probability-based forecasts and educational information. It does not provide personalised financial advice or guarantee future outcomes. Albert is an original fictional Ask Albert HuCentAI Quant character and does not represent any real or other fictional person or character.</p>
        <a href="https://askalbert.app" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300"><Globe className="h-3 w-3" />askalbert.app</a>
      </Card>
    </div>
  );
}

function PerformanceHubSection({ d }) {
  const isBtc = React.useContext(SymbolContext) === 'BTC';
  return (
    <div className="space-y-8">
      {isBtc && <ScorecardSection d={d} />}
      <PerformanceSection d={d} />
      {isBtc && <DataTrustSection d={d} />}
    </div>
  );
}

const COMPARE_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };
const COMPARE_SYMS = ['BTC', 'ETH', 'SOL'];

function CoinSparkline({ data, up }) {
  if (!data || data.length < 2) return null;
  const w = 200, h = 44;
  const mn = Math.min(...data), mx = Math.max(...data), rng = (mx - mn) || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 4) - 2}`).join(' ');
  const col = up ? '#34d399' : '#f87171';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full">
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" />
    </svg>
  );
}

function oddsColor(v) { return v == null ? '#94a3b8' : (v >= 55 ? '#34d399' : (v <= 45 ? '#f87171' : '#fbbf24')); }

function CompareCoinCard({ d, onRemove }) {
  const up = (d.day_change_pct || 0) >= 0;
  return (
    <Card className="relative flex flex-col border-0 bg-slate-900 p-5 ring-1 ring-slate-800">
      {onRemove && <button onClick={onRemove} title="Remove coin" className="absolute right-2 top-2 rounded-full p-1 text-slate-500 hover:bg-slate-800 hover:text-red-300"><X className="h-3.5 w-3.5" /></button>}
      <div className="mb-3 flex items-center gap-2 pr-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-black text-sky-300">{d.symbol}</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{d.name}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">{d.symbol}/USD · {d.source}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-white">${d.price?.toLocaleString()}</p>
          <p className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '+' : ''}{d.day_change_pct}%</p>
        </div>
      </div>
      <CoinSparkline data={d.spark} up={up} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-950/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Quant Score</p>
          <p className="text-2xl font-black" style={{ color: scoreColor(d.quant_score) }}>{d.quant_score}<span className="text-xs font-medium text-slate-500">/100</span></p>
          <p className="text-[11px]" style={{ color: scoreColor(d.quant_score) }}>{d.quant_label}</p>
        </div>
        <div className="rounded-lg bg-slate-950/50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Market Regime</p>
          <p className="mt-1 text-sm font-bold leading-tight text-white">{d.regime}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-950/50 p-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">24h higher</p>
          <p className="font-mono text-lg font-bold" style={{ color: oddsColor(d.forecast_24h?.higher) }}>{d.forecast_24h?.higher ?? '—'}%</p>
          <p className="text-[10px] text-slate-500">{d.forecast_24h?.confidence}</p>
        </div>
        <div className="rounded-lg bg-slate-950/50 p-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">7d higher</p>
          <p className="font-mono text-lg font-bold" style={{ color: oddsColor(d.forecast_7d?.higher) }}>{d.forecast_7d?.higher ?? '—'}%</p>
          <p className="text-[10px] text-slate-500">{d.forecast_7d?.confidence}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-between rounded-lg bg-slate-950/50 p-2 text-xs">
        <span className="text-emerald-300">Support ${d.support?.toLocaleString() ?? '—'}</span>
        <span className="text-red-300">Resistance ${d.resistance?.toLocaleString() ?? '—'}</span>
      </div>
      {d.bullish?.[0] && <p className="mt-3 flex gap-1.5 text-[11px] text-slate-400"><TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />{d.bullish[0]}</p>}
      {d.risk?.[0] && <p className="mt-1.5 flex gap-1.5 text-[11px] text-slate-400"><TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />{d.risk[0]}</p>}
    </Card>
  );
}

function CompareSection() {
  const [selected, setSelected] = React.useState(['BTC', 'ETH', 'SOL']);
  const [allCoins, setAllCoins] = React.useState([]);
  const [data, setData] = React.useState({});
  const [loading, setLoading] = React.useState({ BTC: true, ETH: true, SOL: true });
  const [err, setErr] = React.useState({});

  React.useEffect(() => {
    fetch(`${API_BASE}/v1/compare/coins`).then((r) => r.json()).then((j) => { if (j.coins) setAllCoins(j.coins); }).catch(() => {});
  }, []);

  const loadCoin = React.useCallback((s, force) => {
    setLoading((l) => ({ ...l, [s]: true }));
    setErr((e) => ({ ...e, [s]: null }));
    fetch(`${API_BASE}/v1/compare/coin?symbol=${s}${force ? '&refresh=1' : ''}`)
      .then((r) => r.json())
      .then((j) => { if (j.status === 'ready') setData((d) => ({ ...d, [s]: j.data })); else setErr((e) => ({ ...e, [s]: j.reason || 'error' })); })
      .catch(() => setErr((e) => ({ ...e, [s]: 'network' })))
      .finally(() => setLoading((l) => ({ ...l, [s]: false })));
  }, []);

  React.useEffect(() => { selected.forEach((s) => { if (!data[s] && !err[s]) loadCoin(s); }); }, [selected, loadCoin, data, err]);

  const addCoin = (s) => { if (s && !selected.includes(s)) setSelected((sel) => [...sel, s]); };
  const removeCoin = (s) => setSelected((sel) => sel.length > 1 ? sel.filter((x) => x !== s) : sel);

  const nameOf = (s) => (allCoins.find((c) => c.symbol === s)?.name) || COMPARE_NAMES[s] || s;
  const pending = selected.filter((s) => loading[s] && !data[s]);
  const anyPending = pending.length > 0;
  const available = allCoins.filter((c) => !selected.includes(c.symbol));

  return (
    <div className="space-y-5">
      <SectionHead icon={Scale} title="Compare Coins" blurb={sec('compare').blurb} />

      <Card className="border-0 bg-gradient-to-br from-sky-500/10 to-violet-500/[0.06] p-4 ring-1 ring-sky-500/25">
        <div className="flex flex-wrap items-center gap-3">
          <img src="/albert.png" alt="Albert" className="h-11 w-11 rounded-full object-cover ring-2 ring-sky-500/40" />
          <div className="min-w-[220px] flex-1">
            <p className="text-sm font-semibold text-sky-100">Albert</p>
            {anyPending ? (
              <p className="flex items-center gap-2 text-xs text-slate-300"><RefreshCw className="h-3.5 w-3.5 animate-spin text-violet-300" />Crunching the quant model on {pending.map((s) => nameOf(s)).join(', ')}… first run per coin takes a few seconds, then it’s cached.</p>
            ) : (
              <p className="text-xs text-slate-300">Add any coin below to run it on the same engine. Scores are 0–100 conviction; odds are probabilities, not promises — never financial advice.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 px-2 py-1">
              <Plus className="h-3.5 w-3.5 text-sky-300" />
              <select value="" onChange={(e) => { addCoin(e.target.value); e.target.value = ''; }} disabled={!available.length} className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none disabled:opacity-50">
                <option value="" className="bg-slate-900">{available.length ? 'Add a coin…' : 'All added'}</option>
                {available.map((c) => <option key={c.symbol} value={c.symbol} className="bg-slate-900">{c.symbol} · {c.name}</option>)}
              </select>
            </div>
            <button onClick={() => selected.forEach((s) => loadCoin(s, true))} disabled={anyPending} className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-sky-500/40 hover:text-sky-300 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${anyPending ? 'animate-spin' : ''}`} />Recompute
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {selected.map((s) => {
          if (data[s]) return <CompareCoinCard key={s} d={data[s]} onRemove={() => removeCoin(s)} />;
          if (err[s]) return (
            <Card key={s} className="relative flex flex-col items-center justify-center border-0 bg-slate-900 p-8 text-center ring-1 ring-slate-800">
              <button onClick={() => removeCoin(s)} className="absolute right-2 top-2 rounded-full p-1 text-slate-500 hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
              <p className="text-sm font-bold text-white">{nameOf(s)}</p>
              <p className="mt-1 text-xs text-red-300">Couldn’t load {s} — this market may not be available.</p>
              <button onClick={() => loadCoin(s, true)} className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">Retry</button>
            </Card>
          );
          return (
            <Card key={s} className="flex flex-col items-center justify-center border-0 bg-slate-900 p-8 text-center ring-1 ring-slate-800">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-black text-sky-300">{s}</span>
              <p className="mt-3 text-sm font-semibold text-white">{nameOf(s)}</p>
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5 animate-spin text-violet-300" />Albert is computing…</p>
              <div className="mt-3 h-1 w-32 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-1/2 animate-pulse rounded-full bg-violet-400/70" /></div>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-600">Same price-agnostic quant engine (trend, momentum, volatility, volume) applied per coin on daily data via Kraken/Coinbase. BTC-specific context (halving cycle, dominance) isn’t shown here as it doesn’t apply to alts. Research signals only — not financial advice.</p>
    </div>
  );
}

function CompareOverlay({ coinData, coinSymbol, coinName, onClose }) {
  const [btc, setBtc] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/v1/dashboard`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (alive && j.status === 'ready') setBtc(j); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const horizons = [['24H', '24-Hour'], ['7D', '7-Day'], ['30D', '30-Day']];
  const getf = (dd, h) => ((dd && dd.forecasts) || []).find((x) => x.horizon === h);
  const chartData = btc ? horizons.map(([h, lbl]) => {
    const b = getf(btc, h); const c = getf(coinData, h);
    return { horizon: lbl, Bitcoin: b ? b.higher : null, [coinName]: c ? c.higher : null };
  }) : [];

  const Col = ({ dd, name, sym }) => {
    const qs = dd ? dd.quant_score : null;
    return (
      <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[10px] font-black text-sky-300">{sym}</span>
          <p className="text-sm font-bold text-white">{name}</p>
        </div>
        <p className="mt-3 text-4xl font-black" style={{ color: qs != null ? scoreColor(qs) : '#94a3b8' }}>{qs != null ? qs : '—'}</p>
        <p className="text-xs text-slate-400">{(dd && dd.quant_label) || 'Quant Score'}</p>
        <div className="mt-3 space-y-1 text-left text-xs text-slate-300">
          <p><span className="text-slate-500">Regime:</span> {(dd && dd.regime && dd.regime.regime) || '—'}</p>
          <p><span className="text-slate-500">Next-day:</span> {(dd && dd.signal) || '—'} {dd && dd.confidence ? `(${dd.confidence}%)` : ''}</p>
          <p><span className="text-slate-500">Market share:</span> {dd && dd.dominance ? `${dd.dominance.dominance}%` : '—'}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Scale className="h-5 w-5 text-sky-400" /><h2 className="text-lg font-bold text-white">{coinName} vs Bitcoin</h2></div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {loading && !btc ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading Bitcoin data…</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Col dd={btc} name="Bitcoin" sym="BTC" />
              <Col dd={coinData} name={coinName} sym={coinSymbol} />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Probability of closing higher (%)</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="horizon" stroke="#64748b" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Bitcoin" fill="#f7931a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={coinName} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="mt-3 text-[11px] italic text-slate-500">Higher % = the model&apos;s estimated chance of a higher close over that horizon. Odds, not certainty — not financial advice.</p>
          </>
        )}
      </div>
    </div>
  );
}

function CoinPicker({ coins, symbol, onSelect }) {
  const [open, setOpen] = React.useState(false);
  const current = coins.find((c) => c.symbol === symbol) || { symbol, name: symbol };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Switch coin — the whole dashboard follows"
        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold text-white transition-colors ${open ? 'border-sky-500/60 bg-slate-800' : 'border-slate-700 bg-slate-900 hover:border-sky-500/50'}`}>
        <CoinIcon symbol={current.symbol} size={24} />
        <span className="hidden sm:inline">{current.name}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[100] mt-2 max-h-[70vh] w-56 overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150">
            <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Choose an asset</p>
            {coins.map((c) => (
              <button key={c.symbol} onClick={() => { onSelect(c.symbol); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${c.symbol === symbol ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300 hover:bg-slate-800'}`}>
                <CoinIcon symbol={c.symbol} size={24} />
                <span className="flex-1">{c.name}</span>
                {c.symbol === 'BTC' && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">FULL</span>}
                {c.symbol === symbol && <Check className="h-3.5 w-3.5 text-sky-300" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Module-level caches survive a Fast-Refresh / remount so the dashboard never
// flickers back to the full-screen loader once data has been fetched once.
let __dashCache = null;
let __tickerCache = null;
let __newsCache = null;
let __alertsCache = null;
let __notifCache = null;


// ---- Account menu (avatar + sign-out) shown in the top header ----
function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const initial = (user.name || user.email || '?').slice(0, 1).toUpperCase();
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title={user.email}
        className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 py-1 pl-1 pr-2 text-slate-200 transition-colors hover:border-sky-500/50"
      >
        {user.picture
          ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full ring-1 ring-slate-700" />
          : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300">{initial}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl shadow-black/50">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              {user.picture
                ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full ring-1 ring-slate-700" />
                : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-sm font-semibold text-sky-300">{initial}</span>}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{user.name || 'Signed in'}</div>
                <div className="truncate text-[11px] text-slate-500">{user.email}</div>
              </div>
            </div>
            <div className="my-1 h-px bg-slate-800" />
            <button
              onClick={() => { setOpen(false); onSignOut && onSignOut(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}


// Screens whose asset is always Bitcoin (no picker).
const FIXED_BTC_SCREENS = new Set([
  'home', 'scenarios', 'scenario-evaluation', 'smartmoney', 'whales', 'etf',
  'leverage', 'timemachine', 'drivers', 'network',
]);
// Screens with no single-coin dimension (market, portfolio, system, chat).
const NO_COIN_SCREENS = new Set([
  'briefing', 'macro', 'events', 'paper', 'paperengine', 'strategies',
  'ask', 'opportunities', 'alert-engine', 'alerts', 'dataaudit', 'admin',
  'checkup', 'settings',
]);
// Screens that fetch their own data and don't need the global dashboard payload.
const SELF_FETCHING_SCREENS = new Set([
  'crossmarket', 'analogs', 'whales', 'etf', 'leverage', 'smartmoney',
  'timemachine', 'network', 'drivers', 'checkup', 'alert-engine',
  'ask', 'alerts', 'dataaudit', 'admin', 'settings', 'paperengine',
  'scenarios', 'scenario-evaluation', 'opportunities',
]);

export default function DashboardPage() {
  // Per-screen asset selection: each screen remembers its own coin independently.
  const [screenSymbols, setScreenSymbols] = useState({});
  const [coins, setCoins] = useState([{ symbol: 'BTC', name: 'Bitcoin' }]);
  const [data, setData] = useState(__dashCache);
  const [status, setStatus] = useState(__dashCache ? 'ready' : 'loading');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [passPrompt, setPassPrompt] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passRemember, setPassRemember] = useState(true);
  const [passAutoClear, setPassAutoClear] = useState(false);
  const [ticker, setTicker] = useState(__tickerCache);
  const [active, setActive] = useState('home');
  const [homeParams, setHomeParams] = useState({ horizon: '7D', focus: null, mdHorizon: 'SWING' });
  const skipUrlPush = React.useRef(false);
  const [chatStrategy, setChatStrategy] = useState(null); // Unsaved chat plan routed to Studio review
  const [showReport, setShowReport] = useState(false);
  const [news, setNews] = useState(__newsCache);
  const [newsStatus, setNewsStatus] = useState(__newsCache ? 'ready' : 'loading');
  const [newsRefreshing, setNewsRefreshing] = useState(false);
  const [alertsData, setAlertsData] = useState(__alertsCache);
  const [notif, setNotif] = useState(__notifCache);
  const [alertFilter, setAlertFilter] = useState('BTC');
  const [compareOpen, setCompareOpen] = useState(false);
  const [albertBioOpen, setAlbertBioOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Derive the effective symbol from the active screen's own selection.
  const symbol = useMemo(() => {
    if (FIXED_BTC_SCREENS.has(active)) return 'BTC';
    if (active.startsWith('dashboard-')) return 'BTC';
    if (NO_COIN_SCREENS.has(active)) return 'BTC';
    return screenSymbols[active] || 'BTC';
  }, [active, screenSymbols]);
  // Track whether a symbol change came from an explicit picker action (vs navigation).
  const pickerTriggered = React.useRef(false);
  // Change the current screen's selected asset.
  const setScreenSymbol = useCallback((sym) => {
    pickerTriggered.current = true;
    setScreenSymbols((prev) => ({ ...prev, [active]: sym }));
  }, [active]);
  // Auth gate: undefined = checking, null = signed out, {user} = signed in.
  const [authUser, setAuthUser] = useState(undefined);
  const [authError, setAuthError] = useState(false);
  const [authRetry, setAuthRetry] = useState(0);
  React.useEffect(() => {
    let alive = true;
    fetchMe().then((u) => {
      if (!alive) return;
      if (u) { rememberUser(u); hydrateVoicePrefFromServer(); }
      setAuthError(false);
      setAuthUser(u || null);
    }).catch(() => {
      if (alive) setAuthError(true);
    });
    return () => { alive = false; };
  }, [authRetry]);
  // One owner-scoped read set feeds the entire Home, including its global ticker.
  // Keep it mounted on evaluation/research deep links so Back restores the snapshot.
  const oneScreen = useOneScreenData(
    !!authUser && (['home', 'scenario-evaluation', 'opportunities'].includes(active) || active.startsWith('dashboard-')),
    active.startsWith('dashboard-') ? active.slice('dashboard-'.length) : active === 'scenario-evaluation' ? 'btc' : active === 'opportunities' ? 'radar' : 'home',
    authUser?.id || null
  );
  const navigate = useCallback((id, sym) => {
    if (sym) setScreenSymbols((prev) => ({ ...prev, [id]: sym }));
    setActive(id);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  // Trader Home: no blocking post-sign-in modals. Users land directly on the
  // briefing; the Welcome/Weekly recaps are available inline (WeeklyBriefCard).
  const handleSignOut = React.useCallback(async () => {
    await authLogout();
    setAuthUser(null);
    try { window.location.reload(); } catch (e) { /* noop */ }
  }, []);
  React.useEffect(() => {
    const onDocClick = (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.getAttribute('alt') === 'Albert') {
        e.preventDefault();
        e.stopPropagation();
        setAlbertBioOpen(true);
      }
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, []);
  const failCount = React.useRef(0);

  // Load the supported coin list after authentication.
  useEffect(() => {
    if (!authUser) return;
    fetch(`${API_BASE}/v1/compare/coins`).then((r) => r.json()).then((j) => { if (j.coins) setCoins([{ symbol: 'BTC', name: 'Bitcoin' }, ...j.coins.filter((c) => c.symbol !== 'BTC')]); }).catch(() => {});
  }, [authUser]);

  // --- Deep-linking: shareable URL state (section / symbol / horizon / focus) ---
  // Read the URL once on mount so a shared link opens the exact same view.
  // ?symbol=ETH&section=crossmarket opens Cross-Market with ETH as its local asset.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const s = (q.get('symbol') || '').toUpperCase();
      const sec = q.get('section');
      const hz = q.get('horizon');
      const fc = q.get('focus');
      const mdh = q.get('mdh');
      if (s || sec || hz || fc || mdh) {
        skipUrlPush.current = true;
        if (s && sec) setScreenSymbols((prev) => ({ ...prev, [sec]: s }));
        if (sec) setActive(sec);
        setHomeParams((p) => ({ ...p, horizon: hz || p.horizon, focus: fc || null, mdHorizon: mdh || p.mdHorizon }));
      }
    } catch (e) { /* noop */ }
  }, []);

  // Push state -> URL on every navigation so Back/Forward walk the history.
  useEffect(() => {
    if (skipUrlPush.current) { skipUrlPush.current = false; return; }
    try {
      const q = new URLSearchParams();
      q.set('section', active);
      if (symbol && symbol !== 'BTC') q.set('symbol', symbol);
      if (active === 'briefing') {
        if (homeParams.horizon) q.set('horizon', homeParams.horizon);
        if (homeParams.focus) q.set('focus', homeParams.focus);
      }
      if (active === 'drivers' && homeParams.mdHorizon) q.set('mdh', homeParams.mdHorizon);
      const url = `${window.location.pathname}?${q.toString()}`;
      if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history.pushState({ active, symbol, ...homeParams }, '', url);
      }
    } catch (e) { /* noop */ }
  }, [active, symbol, homeParams]);

  // Back/Forward -> restore state from the URL without re-pushing.
  useEffect(() => {
    const onPop = () => {
      try {
        const q = new URLSearchParams(window.location.search);
        skipUrlPush.current = true;
        const sec = q.get('section') || 'home';
        const s = (q.get('symbol') || '').toUpperCase();
        if (s) setScreenSymbols((prev) => ({ ...prev, [sec]: s }));
        setActive(sec);
        setHomeParams({ horizon: q.get('horizon') || '7D', focus: q.get('focus') || null, mdHorizon: q.get('mdh') || 'SWING' });
      } catch (e) { /* noop */ }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);


  // Reset dashboard data when the derived symbol changes (e.g. local picker or navigation).
  useEffect(() => {
    if (!authUser) return;
    const btc = symbol === 'BTC';
    setData(btc ? (__dashCache || null) : null);
    setStatus(btc && __dashCache ? 'ready' : 'loading');
    // Show the "compiling…" overlay only for explicit picker changes, not navigation.
    if (pickerTriggered.current) {
      setSwitching(!(btc && __dashCache));
      pickerTriggered.current = false;
    }
    setError(null);
    setNews(btc ? (__newsCache || null) : null);
    setNewsStatus(btc && __newsCache ? 'ready' : 'loading');
    setTicker(btc ? (__tickerCache || null) : null);
  }, [symbol, authUser]);

  // Chat can initiate only Studio's draft -> review -> save flow. Never create a
  // Chat → Strategy Studio handoff: receive structured proposal from chat and open Studio.
  useEffect(() => {
    const onBuild = (e) => {
      const proposal = e.detail?.proposal;
      const proposalId = e.detail?.proposalId;
      const revision = e.detail?.revision || 1;
      const assets = e.detail?.assets || [];
      if (proposal && Array.isArray(proposal.legs) && proposal.legs.length > 0) {
        // Structured proposal — open Studio with it directly for review.
        setChatStrategy({ proposal, proposalId, revision, assets, key: `${Date.now()}-${Math.random()}` });
      } else {
        // Fallback for legacy events without structured data.
        setChatStrategy({ goal: '', key: `${Date.now()}-${Math.random()}` });
      }
      // Close floating chat if open, so Studio is visible.
      try { window.dispatchEvent(new CustomEvent('albert:close-chat')); } catch (x) { /* noop */ }
      setActive('strategies');
    };
    window.addEventListener('albert:build-strategy', onBuild);
    return () => window.removeEventListener('albert:build-strategy', onBuild);
  }, []);

  // Driver -> chat handoff: buffer the ask and jump to the Ask Albert section so the
  // chat (which mounts on demand) can drain it and send with the driver context.
  useEffect(() => {
    const onAsk = (e) => {
      try { window.__albertPendingAsk = e.detail || null; } catch (x) { /* noop */ }
      setActive('ask');
    };
    window.addEventListener('albert:ask', onAsk);
    return () => window.removeEventListener('albert:ask', onAsk);
  }, []);


  // Clear the coin-switch overlay once the new coin's data is ready (or errors out).
  useEffect(() => {
    if ((data && status === 'ready') || status === 'error') setSwitching(false);
  }, [data, status]);

  // Alerts operate independently of the research coin — they keep their own filter.

  // Reflect the selected coin's price in the browser tab title only.
  // (The favicon stays the Ask Albert app icon — we no longer swap it per coin.)
  useEffect(() => {
    const coin = coins.find((c) => c.symbol === symbol);
    const name = (coin && coin.name) || (data && data.coin_name) || symbol;
    const price = ticker && ticker.price;
    document.title = price ? `${symbol} ${fmtUsd(price)} · Ask Albert` : `${name} · Ask Albert`;
  }, [symbol, ticker, coins, data]);


  const symQs = (base) => (symbol === 'BTC' ? base : `${base}${base.includes('?') ? '&' : '?'}symbol=${encodeURIComponent(symbol)}`);

  const loadAlerts = useCallback(async () => {
    try {
      const q = alertFilter && alertFilter !== 'ALL' ? `?symbol=${encodeURIComponent(alertFilter)}` : '';
      const r = await fetch(`${API_BASE}/v1/alerts${q}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.status === 'ready') { __alertsCache = j; setAlertsData(j); }
    } catch (e) { /* noop */ }
  }, [alertFilter]);

  const ackAlerts = useCallback(async (ids) => {
    try {
      const body = ids ? { ids } : (alertFilter && alertFilter !== 'ALL' ? { symbol: alertFilter } : {});
      await fetch(`${API_BASE}/v1/alerts/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      loadAlerts();
    } catch (e) { /* noop */ }
  }, [loadAlerts, alertFilter]);

  useEffect(() => {
    if (!authUser) return;
    loadAlerts();
    const id = setInterval(loadAlerts, 30000);
    return () => clearInterval(id);
  }, [loadAlerts, authUser]);

  // Global (all-coins) notification feed that powers the top-bar bell + sidebar
  // badge, so the unread count stays accurate no matter which coin is selected.
  // Merges the global smart-alert feed with this user's personal Albert feed
  // (watchlist flips + paper fills + drawdown recoveries) so those follow the
  // user across every screen.
  const loadNotif = useCallback(async () => {
    try {
      const pid = getPid();
      const [gr, ar] = await Promise.all([
        fetch(`${API_BASE}/v1/alerts?limit=50`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        pid ? fetch(`${API_BASE}/v1/albert/notifications?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null) : Promise.resolve(null),
      ]);
      const gAlerts = (gr && gr.status === 'ready' && gr.alerts) || [];
      const aAlerts = (ar && ar.status === 'ready' && ar.alerts) || [];
      const merged = [...aAlerts, ...gAlerts].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
      const unseen = ((gr && gr.unseen) || 0) + ((ar && ar.unseen) || 0);
      const combined = { status: 'ready', alerts: merged, unseen, total: ((gr && gr.total) || 0) + ((ar && ar.total) || 0) };
      __notifCache = combined; setNotif(combined);
    } catch (e) { /* noop */ }
  }, []);

  const ackNotif = useCallback(async (ids) => {
    try {
      const pid = getPid();
      // Route ids to the right ack endpoint by their prefix (Albert feed ids are
      // prefixed flip_/fill_/recovery_); no ids => mark everything read on both.
      const albertIds = ids ? ids.filter((i) => /^(flip_|fill_|recovery_)/.test(i)) : null;
      const globalIds = ids ? ids.filter((i) => !/^(flip_|fill_|recovery_)/.test(i)) : null;
      const calls = [];
      if (!ids || (globalIds && globalIds.length)) {
        calls.push(fetch(`${API_BASE}/v1/alerts/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(globalIds && globalIds.length ? { ids: globalIds } : {}) }));
      }
      if (pid && (!ids || (albertIds && albertIds.length))) {
        calls.push(fetch(`${API_BASE}/v1/albert/notifications/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(albertIds && albertIds.length ? { pid, ids: albertIds } : { pid }) }));
      }
      await Promise.all(calls);
      loadNotif();
      loadAlerts();
    } catch (e) { /* noop */ }
  }, [loadNotif, loadAlerts]);

  useEffect(() => {
    if (!authUser) return;
    loadNotif();
    const id = setInterval(loadNotif, 30000);
    return () => clearInterval(id);
  }, [loadNotif, authUser]);

  const loadNews = useCallback(async () => {
    try {
      const r = await fetch(symbol === 'BTC' ? `${API_BASE}/v1/news` : `${API_BASE}/v1/news?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.status === 'ready') { if (symbol === 'BTC') __newsCache = j; setNews(j); setNewsStatus('ready'); setNewsRefreshing(false); }
      else setNewsStatus(j.status || 'computing');
    } catch (e) { setNewsStatus('error'); }
  }, [symbol]);

  useEffect(() => {
    if (!authUser) return;
    loadNews();
    const id = setInterval(() => { setNewsStatus((s) => { if (s !== 'ready') loadNews(); return s; }); }, 5000);
    return () => clearInterval(id);
  }, [loadNews, authUser]);

  const handleNewsRefresh = async () => {
    if (symbol !== 'BTC') { loadNews(); return; }
    setNewsRefreshing(true);
    await fetch(`${API_BASE}/v1/news/refresh`, { method: 'POST' });
    const id = setInterval(loadNews, 5000);
    setTimeout(() => clearInterval(id), 70000);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(symbol === 'BTC' ? `${API_BASE}/v1/dashboard` : `${API_BASE}/v1/dashboard?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.status === 'ready') { failCount.current = 0; if (symbol === 'BTC') __dashCache = json; setData(json); setStatus('ready'); setRefreshing(false); }
      else if (json.status === 'error') { setError(json.error || 'Unknown error'); setStatus((s) => s === 'ready' || s === 'stale' ? 'stale' : 'error'); }
      else { failCount.current = 0; setStatus((s) => s === 'ready' || s === 'stale' ? 'stale' : 'computing'); }
    } catch (e) {
      // Transient during cold start: the ingress can return an HTML page before the
      // backend is ready, which fails JSON.parse. Keep showing the skeleton and
      // auto-retry a few times before surfacing a hard error, so a brief restart
      // never strands the user on the "Engine error" screen.
      failCount.current += 1;
      if (failCount.current <= 6) setStatus((s) => s === 'ready' || s === 'stale' ? 'stale' : 'computing');
      else { setError(String(e)); setStatus((s) => s === 'ready' || s === 'stale' ? 'stale' : 'error'); }
    }
  }, [symbol]);

  useEffect(() => {
    if (!authUser) return;
    load();
    const id = setInterval(() => { setStatus((s) => { if (s !== 'ready') load(); return s; }); }, 4000);
    return () => clearInterval(id);
  }, [load, authUser]);

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    const loadTicker = async () => {
      try { const r = await fetch(symbol === 'BTC' ? `${API_BASE}/v1/ticker` : `${API_BASE}/v1/ticker?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' }); const j = await r.json(); if (alive && j && j.price) { if (symbol === 'BTC') __tickerCache = j; setTicker(j); } } catch (e) { /* noop */ }
    };
    loadTicker();
    const t = setInterval(loadTicker, 10000);
    const dref = setInterval(() => load(), 60000);
    return () => { alive = false; clearInterval(t); clearInterval(dref); };
  }, [load, symbol, authUser]);

  const doRefresh = async (passcode, remember = true, autoClear = false) => {
    setRefreshing(true);
    setPassError('');
    try {
      const r = await fetch(`${API_BASE}/v1/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (r.status === 401) {
        setRefreshing(false);
        setPassPrompt(true);
        setPassError('Incorrect passcode. Please try again.');
        return;
      }
      if (r.status === 429) {
        setRefreshing(false);
        setPassPrompt(false);
        if (typeof window !== 'undefined') window.alert('Too many refreshes — please wait a moment and try again.');
        return;
      }
      // Accepted — persist the passcode only if the admin opted to remember it on this device.
      if (typeof window !== 'undefined') {
        if (remember && passcode) {
          window.localStorage.setItem('btciq_admin_passcode', passcode);
          if (autoClear) window.localStorage.setItem('btciq_admin_passcode_exp', String(Date.now() + 24 * 60 * 60 * 1000));
          else window.localStorage.removeItem('btciq_admin_passcode_exp');
        } else {
          window.localStorage.removeItem('btciq_admin_passcode');
          window.localStorage.removeItem('btciq_admin_passcode_exp');
        }
      }
      setPassPrompt(false);
      setPassInput('');
      const id = setInterval(load, 4000);
      setTimeout(() => clearInterval(id), 90000);
    } catch (e) {
      setRefreshing(false);
      setPassError('Network error — please try again.');
    }
  };

  // Read a saved passcode, honouring an optional 24h auto-clear expiry.
  const readStoredPasscode = () => {
    if (typeof window === 'undefined') return '';
    const p = window.localStorage.getItem('btciq_admin_passcode') || '';
    const exp = window.localStorage.getItem('btciq_admin_passcode_exp');
    if (p && exp && Date.now() > Number(exp)) {
      window.localStorage.removeItem('btciq_admin_passcode');
      window.localStorage.removeItem('btciq_admin_passcode_exp');
      return '';
    }
    return p;
  };

  const handleRefresh = () => {
    const stored = readStoredPasscode();
    if (!stored) { setPassError(''); setPassInput(''); setPassRemember(true); setPassAutoClear(false); setPassPrompt(true); return; }
    doRefresh(stored, true, false);
  };

  const submitPasscode = () => {
    const p = (passInput || '').trim();
    if (!p) { setPassError('Enter the admin passcode.'); return; }
    doRefresh(p, passRemember, passAutoClear);
  };

  if (authUser === undefined) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
        <img src="/albert.png" alt="Albert" className="h-16 w-16 animate-pulse rounded-full ring-2 ring-sky-500/40" />
        {authError ? (
          <>
            <p role="alert" className="max-w-sm text-sm text-slate-300">Albert couldn’t connect to check your session. Nothing has changed; please try again.</p>
            <Button type="button" onClick={() => { setAuthError(false); setAuthRetry((n) => n + 1); }} className="bg-sky-600 text-white hover:bg-sky-500">Retry connection</Button>
          </>
        ) : <p role="status" className="text-sm text-slate-400">Waking Albert…</p>}
      </main>
    );
  }
  if (!authUser) {
    return <HomePage onAuthed={(u) => { rememberUser(u); hydrateVoicePrefFromServer(); setAuthUser(u); }} />;
  }

  // Strategy Studio owns its data. A slow market dashboard must not hide paper
  // strategy review/validation behind an unrelated analytics skeleton.
  const dashboardFirst = active === 'home' || active === 'scenario-evaluation' || active === 'opportunities' || active.startsWith('dashboard-');
  // The published market run is only one source. Screens that fetch their own data
  // (Cross-Market, Analogs, Whale Watch, etc.) render immediately even without `d`.
  const needsDashboard = !dashboardFirst && active !== 'strategies' && active !== 'paper' && !SELF_FETCHING_SCREENS.has(active);
  if (needsDashboard && !data && (status === 'loading' || status === 'computing')) {
    return (
      <>
        <DashboardSkeleton ticker={ticker} />
        {switching && <CoinSwitchOverlay symbol={symbol} coins={coins} />}
      </>
    );
  }
  if (needsDashboard && !data && status === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6">
        <div className="rounded-full bg-red-500/10 p-4"><Activity className="h-8 w-8 text-red-400" /></div>
        <h2 className="text-lg font-semibold text-slate-100">Engine error</h2>
        <p className="max-w-md text-center text-sm text-slate-400">{error}</p>
        <Button onClick={handleRefresh} className="bg-sky-500 hover:bg-sky-400">Retry</Button>
      </main>
    );
  }

  const d = data || {};
  const activeSection = sec(active);
  const visibleSections = SECTIONS.filter((s) => !REMOVED_SECTIONS.includes(s.id));

  // Local coin picker bar for screens that support asset selection.
  const researchBar = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <CoinPicker coins={coins} symbol={symbol} onSelect={setScreenSymbol} />
      {symbol !== 'BTC' && (
        <>
          <button type="button" onClick={() => setCompareOpen(true)} title="Overlay this coin vs Bitcoin" className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-500/50"><Scale className="h-4 w-4" /><span className="hidden sm:inline">vs Bitcoin</span></button>
          <button type="button" onClick={() => setScreenSymbol('BTC')} className="text-xs text-slate-500 hover:text-slate-300">← Back to Bitcoin</button>
        </>
      )}
    </div>
  );

  const renderSection = () => {
    if (active === 'home') return <OneScreenHome d={data} dashboardStatus={status} ticker={ticker} news={news} newsStatus={newsStatus} snapshot={oneScreen} onNav={navigate} />;
    if (active.startsWith('dashboard-') && DASHBOARD_AREAS[active.slice('dashboard-'.length)]) return <ConsolidatedDetail
      key={`${active}-${symbol}`} kind={active.slice('dashboard-'.length)} dashboard={data} dashboardStatus={status} news={news} newsStatus={newsStatus} snapshot={oneScreen}
      symbol={symbol} onNav={navigate} onBack={() => navigate('home')} />;
    if (active === 'scenarios') return <AlbertHome onNav={navigate} />;
    if (active === 'scenario-evaluation') return <ScenarioEvaluation snapshot={oneScreen} levels={Array.isArray(d?.chart?.sr_levels) ? d.chart.sr_levels : []} onNav={navigate} />;
    if (active === 'opportunities') return <OpportunityResearch snapshot={oneScreen} onNav={navigate} />;
    if (active === 'briefing') return <ExecutiveSummary d={d} ticker={ticker} news={news} onNav={setActive} homeParams={homeParams} setHomeParams={setHomeParams} />;
    // Screens with a local coin picker:
    if (active === 'overview') return <>{researchBar}<OverviewSection d={d} ticker={ticker} /></>;
    if (active === 'forecasts') return <>{researchBar}<ForecastsHubSection d={d} /></>;
    if (active === 'market-intel') return <>{researchBar}<MarketIntelligenceSection d={d} /></>;
    if (active === 'crossmarket') return <>{researchBar}<CrossMarketSection /></>;
    if (active === 'analogs') return <>{researchBar}<AnalogsSection /></>;
    if (active === 'institutional') return <>{researchBar}<div className="space-y-5"><DemoMetricsCard title="Institutional & Derivatives" icon={Landmark} panel={d.institutional} sectionId="institutional" />{symbol === 'BTC' && <EtfFlowsCard />}</div></>;
    if (active === 'news') return <>{researchBar}<NewsSection news={news} status={newsStatus} onRefresh={handleNewsRefresh} refreshing={newsRefreshing} ohlc={data?.chart?.ohlc} /></>;
    if (active === 'risk') return <>{researchBar}<RiskSection d={d} /></>;
    if (active === 'performance') return <>{researchBar}<PerformanceHubSection d={d} /></>;
    // Fixed-scope screens (no picker):
    if (active === 'drivers') return <MarketDrivers horizon={homeParams.mdHorizon} onHorizon={(h) => setHomeParams((p) => ({ ...p, mdHorizon: h }))} />;
    if (active === 'checkup') return <DiagnosticsCheckup />;
    if (active === 'paper') return <PaperTradingBot onNav={setActive} />;
    if (active === 'paperengine') return <PaperEngineTechnical onNav={setActive} />;
    if (active === 'smartmoney') return <DemoMetricsCard title="Smart Money" icon={Waves} panel={d.smart_money} sectionId="smartmoney" />;
    if (active === 'whales') return <WhaleWatch />;
    if (active === 'network') return <NetworkSentimentSection />;
    if (active === 'dataaudit') return <DataAuditSection />;
    if (active === 'admin') return <AdminSection user={authUser} onSignOut={handleSignOut} />;
    if (active === 'leverage') return <LeverageSection />;
    if (active === 'etf') return <EtfFlowsCard />;
    if (active === 'macro') return <PolicySection d={d} />;
    if (active === 'events') return <EventsSection d={d} />;
    if (active === 'timemachine') return <TimeMachineSection />;
    if (active === 'ask') return <AskAlbert onNav={setActive} />;
    if (active === 'strategies') return <StrategyStudio chatGoal={chatStrategy?.goal || ''} chatDraftKey={chatStrategy?.key} chatProposal={chatStrategy?.proposal || null} onChatDismiss={() => setChatStrategy(null)} />;
    if (active === 'alert-engine') return <AlertEngineSection />;
    if (active === 'alerts') return <AlertsSection d={d} alertsData={alertsData} onAck={ackAlerts} filter={alertFilter} onFilter={setAlertFilter} coins={coins} />;
    if (active === 'settings') return <SettingsSection />;
    return <ComingSoonSection section={activeSection} />;
  };

  return (
    <SymbolContext.Provider value={symbol}>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      {albertBioOpen && <AlbertBioModal onClose={() => setAlbertBioOpen(false)} />}
      <AlbertVoiceToast />
      <style>{`img[alt="Albert"]{cursor:pointer}`}</style>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(55rem_38rem_at_-8%_-12%,rgba(247,147,26,0.10),transparent_58%),radial-gradient(52rem_40rem_at_112%_6%,rgba(109,94,246,0.14),transparent_55%)]" />
      {compareOpen && symbol !== 'BTC' && d && (
        <CompareOverlay coinData={d} coinSymbol={symbol} coinName={(coins.find((c) => c.symbol === symbol) || {}).name || symbol} onClose={() => setCompareOpen(false)} />
      )}
      <div className="relative">
        {/* Every screen shares the same global hamburger menu and header. */}
        <div className="min-w-0">
          {/* One global header: no global coin picker — each screen owns its asset selection. */}
          <header className="sticky top-0 z-30 flex min-w-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2 md:px-4">
            <a href="/?section=home" onClick={(e) => { e.preventDefault(); navigate('home'); }} aria-label="Ask Albert Home" className="flex shrink-0 items-center gap-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
              <img src="/ask-albert-logo.png" alt="Ask Albert" className="h-14 w-auto max-w-[135px] object-contain" />
            </a>
            {active === 'home' ? <HomeTicker d={data} ticker={ticker} snapshot={oneScreen} dashboardStatus={status} onNav={navigate} /> : <div className="flex min-w-0 flex-1 items-center gap-2">
              {ticker?.price && <CoinIcon symbol={symbol} size={24} />}
              <span className="hidden truncate text-sm font-semibold text-white lg:inline">{ticker?.price ? `${(coins.find((c) => c.symbol === symbol) || {}).name || symbol} ${fmtUsd(ticker.price)} · ${ticker.change24h ?? '—'}%` : ''}</span>
            </div>}
            <NotificationBell alertsData={notif} onAck={ackNotif} onViewAll={() => navigate('alerts')} onNavSection={(s) => navigate(s || 'strategies')} onOpenBrief={(sym) => { navigate('briefing'); }} />
            {active !== 'home' && <Button onClick={() => setShowReport(true)} size="sm" variant="outline" title="Shareable daily report" className="hidden gap-1.5 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 sm:inline-flex"><ClipboardList className="h-4 w-4" /><span className="hidden lg:inline">Report</span></Button>}
            <div className="relative">
              {active !== 'home' && <Button onClick={handleRefresh} disabled={refreshing} size="sm" className="hidden gap-1.5 bg-sky-600 text-white hover:bg-sky-500 sm:inline-flex"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /><span className="hidden lg:inline">{refreshing ? 'Retraining' : 'Retrain'}</span></Button>}
              {passPrompt && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPassPrompt(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/50">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <Lock className="h-4 w-4 text-amber-400" />Admin passcode
                    </div>
                    <p className="mb-2 text-[11px] leading-relaxed text-slate-400">A full retrain is an admin action. Enter the passcode to run it now.</p>
                    <input
                      type="password"
                      autoFocus
                      value={passInput}
                      onChange={(e) => { setPassInput(e.target.value); setPassError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitPasscode(); if (e.key === 'Escape') setPassPrompt(false); }}
                      placeholder="Enter admin passcode"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                    />
                    {passError && <p className="mt-1.5 text-[11px] font-medium text-red-400">{passError}</p>}
                    <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[11px] text-slate-400 select-none">
                      <input
                        type="checkbox"
                        checked={passRemember}
                        onChange={(e) => setPassRemember(e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-950 accent-sky-500"
                      />
                      Remember on this device
                    </label>
                    {!passRemember && <p className="mt-1 text-[10px] leading-snug text-amber-400/80">Recommended on shared or public devices — the passcode won't be saved.</p>}
                    {passRemember && (
                      <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[11px] text-slate-400 select-none">
                        <input
                          type="checkbox"
                          checked={passAutoClear}
                          onChange={(e) => setPassAutoClear(e.target.checked)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-950 accent-sky-500"
                        />
                        Auto-clear after 24 hours
                      </label>
                    )}
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <button onClick={() => setPassPrompt(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200">Cancel</button>
                      <button onClick={submitPasscode} disabled={refreshing} className="rounded-lg bg-gradient-to-r from-sky-500 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-sky-400 hover:to-violet-500 disabled:opacity-60">
                        {refreshing ? 'Running…' : 'Run retrain'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <AccountMenu user={authUser} onSignOut={handleSignOut} />
            <GlobalMenu active={active} symbol={symbol} onNav={navigate} unread={notif?.unseen || 0} onReport={() => setShowReport(true)} onRefresh={handleRefresh} />
          </header>

          <main className={`mx-auto ${active === 'home' || active.startsWith('dashboard-') ? 'max-w-[1920px] px-3 py-3 md:px-4' : 'max-w-6xl px-4 py-6 md:px-8'}`}><ErrorBoundary label={activeSection?.label || DASHBOARD_AREAS[active.slice('dashboard-'.length)]?.title || active} resetKey={active}>{renderSection()}</ErrorBoundary></main>
          <footer className="space-y-2 px-4 pb-8 text-center md:px-8">
            <div className="flex justify-center"><PublishStamp publishedAt={process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true' ? new Date().toISOString() : d?.created_at} /></div>
          </footer>
        </div>
      </div>
    </div>
    {active !== 'home' && <FloatingAlbert active={active} symbol={symbol} onExpand={() => navigate('ask')} />}
    {/* WallAlertToaster removed */}
    {showReport && <DailyReportModal d={d} onClose={() => setShowReport(false)} />}
    </SymbolContext.Provider>
  );
}


/* ===================== Coin-switch loading overlay ===================== */
function CoinSwitchOverlay({ symbol, coins }) {
  const name = ((coins || []).find((c) => c.symbol === symbol) || {}).name || symbol;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/90 px-8 py-7 shadow-2xl">
        <div className="relative">
          <img src="/albert.png" alt="Albert" className="h-16 w-16 rounded-full object-cover ring-2 ring-sky-500/40" />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 ring-1 ring-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
          </span>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Albert is compiling the analytics</p>
          <p className="mt-0.5 text-xs text-slate-400">Pulling together the full read for <span className="font-semibold text-sky-300">{name}</span>…</p>
        </div>
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" />
        </div>
      </div>
    </div>
  );
}

/* ===================== Preview vs Production environment marker ===================== */
function EnvBadge() {
  const [env, setEnv] = useState(null); // null on first render (avoid SSR mismatch)
  useEffect(() => {
    const host = (typeof window !== 'undefined' && window.location.hostname) || '';
    // Production = the live custom domain(s). Everything else (emergent preview URLs,
    // localhost) is treated as preview.
    const isProd = /(^|\.)(askalbert|btciq)\.app$/i.test(host);
    setEnv(isProd ? 'production' : 'preview');
  }, []);
  if (!env) return null;
  const prod = env === 'production';
  return (
    <span suppressHydrationWarning
      className={`mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${prod ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${prod ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {prod ? 'Production' : 'Preview'}
    </span>
  );
}

/* PublishStamp is shared from ./components/PublishStamp (used in the sidebar + every footer) */


/* ===================== Albert voice picker (Meet Albert) ===================== */
function VoicePicker() {
  const [data, setData] = useState({ voices: [], tts_available: true, default: 'Charon' });
  const [pref, setPref] = useState(() => (typeof window !== 'undefined' ? getVoicePref() : { engine: 'gemini', voice: 'Charon', browserVoiceURI: '' }));
  const [browserVoices, setBrowserVoices] = useState([]);
  const [sampling, setSampling] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/v1/tts/voices`).then((r) => r.json()).then((j) => { if (alive && j && j.voices) setData(j); }).catch(() => {});
    const loadVoices = () => {
      try {
        const vs = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en(\b|[-_])/i.test(v.lang || ''));
        setBrowserVoices(vs.length ? vs : (window.speechSynthesis?.getVoices() || []));
      } catch (e) { /* noop */ }
    };
    loadVoices();
    try { window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices); } catch (e) { /* noop */ }
    return () => { alive = false; try { window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices); } catch (e) { /* noop */ } };
  }, []);

  const choose = (next) => { const p = setVoicePref({ ...pref, ...next }); setPref(p); };

  const sample = async (key) => {
    if (sampling) { stopAlbert(); setSampling(''); return; }
    setSampling(key);
    try { await previewVoice("Hello! I'm Albert, your crypto quant. Let's read the market together and find your edge."); }
    finally { setSampling(''); }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-bold text-white">Albert&apos;s voice</h3>
        <span className="ml-auto text-[10px] text-slate-500">saved automatically</span>
      </div>
      {!data.tts_available && (
        <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">Premium voices are offline right now — device voices are available below.</p>
      )}
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {(data.voices || []).map((v) => {
          const selected = pref.engine === 'gemini' && pref.voice === v.id;
          const key = `g:${v.id}`;
          return (
            <button key={v.id} onClick={() => choose({ engine: 'gemini', voice: v.id })}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? 'border-amber-500/60 bg-amber-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-amber-400 bg-amber-400/20' : 'border-slate-600'}`}>{selected && <Check className="h-3 w-3 text-amber-300" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-100">{v.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{v.desc}</span>
              </span>
              <span onClick={(e) => { e.stopPropagation(); choose({ engine: 'gemini', voice: v.id }); sample(key); }}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${sampling === key ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-300 hover:text-white'}`}>
                {sampling === key ? <><Loader2 className="h-3 w-3 animate-spin" />Stop</> : <><Volume2 className="h-3 w-3" />Sample</>}
              </span>
            </button>
          );
        })}

        {/* Device (browser) voice */}
        <div className={`rounded-lg border px-3 py-2 ${pref.engine === 'browser' ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 bg-slate-900/50'}`}>
          <button onClick={() => choose({ engine: 'browser', browserVoiceURI: pref.browserVoiceURI || (browserVoices[0] && (browserVoices[0].voiceURI || browserVoices[0].name)) || '' })}
            className="flex w-full items-center gap-3 text-left">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${pref.engine === 'browser' ? 'border-sky-400 bg-sky-400/20' : 'border-slate-600'}`}>{pref.engine === 'browser' && <Check className="h-3 w-3 text-sky-300" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-slate-100">Device voice</span>
              <span className="block text-[11px] text-slate-400">Uses your device&apos;s built-in voice · always free, no quota</span>
            </span>
          </button>
          {pref.engine === 'browser' && (
            <div className="mt-2 flex items-center gap-2">
              <select value={pref.browserVoiceURI} onChange={(e) => choose({ engine: 'browser', browserVoiceURI: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 focus:border-sky-500/60 focus:outline-none">
                {browserVoices.length === 0 && <option value="">Default device voice</option>}
                {browserVoices.map((v) => (<option key={v.voiceURI || v.name} value={v.voiceURI || v.name}>{v.name}{v.lang ? ` (${v.lang})` : ''}</option>))}
              </select>
              <button onClick={() => sample('browser')}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold ${sampling === 'browser' ? 'border-sky-500/60 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-300 hover:text-white'}`}>
                {sampling === 'browser' ? <><Loader2 className="h-3 w-3 animate-spin" />Stop</> : <><Volume2 className="h-3 w-3" />Sample</>}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Premium voices are generated by Albert&apos;s server so they sound the same on every device. If they&apos;re busy, Albert falls back to your device voice.</p>
    </div>
  );
}

/* Global toast for voice fallback / notices (mounted once at the app root). */
function AlbertVoiceToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let timer = null;
    const onNotice = (e) => {
      setMsg((e.detail && e.detail.msg) || '');
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(''), 5000);
    };
    window.addEventListener('albert:voice-notice', onNotice);
    return () => { window.removeEventListener('albert:voice-notice', onNotice); clearTimeout(timer); };
  }, []);
  if (!msg) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 px-4">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-slate-900/95 px-4 py-2 text-[12px] font-medium text-amber-200 shadow-lg backdrop-blur">
        <Volume2 className="h-4 w-4 shrink-0" />{msg}
      </div>
    </div>
  );
}


/* ===================== Albert bio popup (tap any Albert avatar) ===================== */
function AlbertBioModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-slate-300 backdrop-blur transition-colors hover:bg-black/60 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="px-5 pt-8">
          <img src="/albert-full.png" alt="Albert portrait" className="mx-auto w-[60%] rounded-xl object-cover" />
          <div className="mt-3 text-center">
            <h2 className="text-2xl font-black text-white">Albert</h2>
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-sky-300">
              <Sparkles className="h-4 w-4" />Ask Albert HuCentAI Quant Analyst
            </p>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-[14px] leading-relaxed text-slate-200">
            Meet <span className="font-semibold text-white">Albert</span> — Ask Albert&apos;s resident quant analyst. He reads the live dashboard end to end (price action, on-chain flows, derivatives positioning, macro and sentiment) and turns it into plain-English calls you can actually act on.
          </p>
          <p className="text-[14px] leading-relaxed text-slate-300">
            Ask him anything — &ldquo;Is it time to buy or sell?&rdquo;, &ldquo;Why did the score fall?&rdquo;, &ldquo;What could move Bitcoin next?&rdquo; He grounds every answer strictly in real dashboard numbers, logs his directional calls, and grades himself honestly so you can see his track record over time.
          </p>
          <ul className="space-y-1.5 text-[13px] text-slate-300">
            <li className="flex gap-2"><span className="text-sky-400">•</span><span>Ask him on any tab and he answers about <span className="font-semibold text-slate-200">that</span> screen — the metrics, charts and signals you&apos;re looking at right then</span></li>
            <li className="flex gap-2"><span className="text-sky-400">•</span>Daily Morning Brief &amp; Weekly Recap in your own reading level</li>
            <li className="flex gap-2"><span className="text-sky-400">•</span>Directional calls with entries, targets &amp; invalidation — auto-graded</li>
            <li className="flex gap-2"><span className="text-sky-400">•</span>Live web-grounded deep dives on strategy, macro &amp; cycles</li>
          </ul>
          <VoicePicker />
          <button onClick={onClose}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90">
            <MessageCircle className="h-4 w-4" />Got it
          </button>
          <p className="text-center text-[10px] leading-relaxed text-slate-500">
            Albert is an original fictional Ask Albert HuCentAI Quant character and does not represent any real or other fictional person or character. Educational analysis — not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
