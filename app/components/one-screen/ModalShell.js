'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// One dismissal path for menu, explanations and full-size charts. Focus returns
// to the exact button that opened the dialog (including on Escape).
const ModalShell = ({ title, onClose, children, className = 'max-w-3xl', label, placement = 'center' }) => {
  const ref = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])') || []);
      if (!elements.length) return;
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <div className={`fixed inset-0 z-[100] flex items-start overflow-y-auto bg-slate-950/90 p-3 backdrop-blur-sm sm:p-5 ${placement === 'full' ? '!items-stretch !justify-stretch !overflow-hidden !p-0' : placement === 'side' ? 'justify-start' : 'justify-center sm:items-center'}`} role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={ref} role="dialog" aria-modal="true" aria-label={label || title}
        className={`relative w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl ${placement === 'full' ? 'flex h-[100dvh] !max-w-none !w-screen flex-col !rounded-none !border-0' : placement === 'side' ? 'ml-0 mr-auto' : 'mx-auto'} ${className}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="min-w-0 text-base font-bold text-white">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${label || title}`}
            className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={placement === 'full' ? 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-5' : 'max-h-[calc(100dvh-7rem)] overflow-y-auto p-4 sm:p-5'}>{children}</div>
      </section>
    </div>
  );
};

export default ModalShell;
