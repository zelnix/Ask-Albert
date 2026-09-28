'use client';

import React, { useState, useEffect } from 'react';
import { Menu, SlidersHorizontal, ChevronDown, Bell, ClipboardList, RefreshCw } from 'lucide-react';
import { PRIMARY_NAV, TECH_GROUPS, REMOVED_SECTIONS, sec } from '../../lib/sections';
import ModalShell from './ModalShell';

const GlobalMenu = ({ active, symbol, onNav, unread = 0, onReport, onRefresh }) => {
  const [open, setOpen] = useState(false);
  const [technical, setTechnical] = useState(false);
  useEffect(() => { if (open && !PRIMARY_NAV.some((item) => item.id === active)) setTechnical(true); }, [open, active]);
  const go = (e, id) => { e.preventDefault(); setOpen(false); onNav(id); };
  const link = (item) => {
    const Icon = item.icon;
    const selected = active === item.id;
    return <a key={item.id} href={`/?section=${encodeURIComponent(item.id)}`} onClick={(e) => go(e, item.id)} aria-current={selected ? 'page' : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${selected ? 'bg-sky-500/20 font-bold text-sky-200 ring-1 ring-sky-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
      <Icon className="h-4 w-4 shrink-0" />{item.label}
      {item.id === 'alerts' && unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] text-white">{unread > 9 ? '9+' : unread}</span>}
    </a>;
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation menu" aria-haspopup="dialog" aria-expanded={open}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
      <Menu className="h-5 w-5" />
    </button>
    {open && <ModalShell title="Explore Ask Albert" label="Navigation menu" placement="side" onClose={() => setOpen(false)} className="max-w-sm">
      <nav aria-label="Global navigation" className="space-y-1">
        {PRIMARY_NAV.map(link)}
        <button type="button" onClick={() => setTechnical((v) => !v)} aria-expanded={technical}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <SlidersHorizontal className="h-4 w-4" />Technical Centre<ChevronDown className={`ml-auto h-4 w-4 ${technical ? 'rotate-180' : ''}`} />
        </button>
        {technical && <div className="ml-3 space-y-3 border-l border-slate-700 pl-3">
          {TECH_GROUPS.map((group) => {
            const items = group.ids.filter((id) => !REMOVED_SECTIONS.includes(id));
            return items.length ? <div key={group.label}>
              <p className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
              {items.map((id) => link(sec(id)))}
            </div> : null;
          })}
        </div>}
        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">Quick actions</p>
          <a href="/?section=alerts" onClick={(e) => go(e, 'alerts')} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><Bell className="h-4 w-4" />Alerts {unread > 0 ? `(${unread})` : ''}</a>
          <button type="button" onClick={() => { setOpen(false); onReport(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><ClipboardList className="h-4 w-4" />Daily report</button>
          <button type="button" onClick={() => { setOpen(false); onRefresh(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><RefreshCw className="h-4 w-4" />Retrain (admin)</button>
        </div>
      </nav>
    </ModalShell>}
  </>;
};

export default GlobalMenu;
