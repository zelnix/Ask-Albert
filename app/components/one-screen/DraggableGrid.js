'use client';

import React, { useState, useEffect, useCallback, useRef, Children } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'albert-dashboard-card-order';
const API_URL = '/api/v1/user/dashboard-layout';

/* ── Individual sortable item wrapper ── */
const SortableItem = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  /* Use translate-only (no scale) to prevent distortion in grids */
  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative h-full group/drag ${isDragging ? 'ring-2 ring-sky-500/50 rounded-lg shadow-lg shadow-sky-500/10' : ''}`}>
      {/* Drag handle — visible on hover */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute right-9 top-1.5 z-20 cursor-grab rounded bg-slate-700/95 p-1 text-slate-400 opacity-0 shadow-md backdrop-blur-sm transition-all hover:bg-sky-600 hover:text-white active:cursor-grabbing group-hover/drag:opacity-100 touch-none"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
};

/* ── Helpers to extract card IDs from React children ── */
const getCardId = (child, i) =>
  child.props?.cardId || child.props?.['data-card-id'] || `card-${i}`;

/* ── API helpers (fire-and-forget save, async load) ── */
const loadLayoutFromApi = async () => {
  try {
    const res = await fetch(API_URL, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      return data.cardOrder || null;
    }
  } catch (_) {}
  return null;
};

const saveLayoutToApi = (order) => {
  try {
    fetch(API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cardOrder: order }),
    }).catch(() => {});
  } catch (_) {}
};

const deleteLayoutFromApi = () => {
  try {
    fetch(API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cardOrder: [] }),
    }).catch(() => {});
  } catch (_) {}
};

/* ── Main DraggableGrid component ── */
const DraggableGrid = ({ children, className = '' }) => {
  const childArray = Children.toArray(children);
  const defaultOrder = childArray.map((child, i) => getCardId(child, i));

  const [cardOrder, setCardOrder] = useState(defaultOrder);
  const [mounted, setMounted] = useState(false);
  const initializedRef = useRef(false);

  /* Load saved order: localStorage first (instant), then API (authoritative) */
  useEffect(() => {
    setMounted(true);
    if (initializedRef.current) return;
    initializedRef.current = true;

    const validateOrder = (parsed) => {
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const valid = parsed.filter((id) => defaultOrder.includes(id));
      const added = defaultOrder.filter((id) => !parsed.includes(id));
      return valid.length > 0 ? [...valid, ...added] : null;
    };

    // 1. Instant load from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const order = validateOrder(JSON.parse(saved));
        if (order) setCardOrder(order);
      }
    } catch (_) {}

    // 2. Async load from API (authoritative — overrides localStorage)
    loadLayoutFromApi().then((apiOrder) => {
      if (apiOrder) {
        const order = validateOrder(apiOrder);
        if (order) {
          setCardOrder(order);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch (_) {}
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* DnD sensors with activation constraint to avoid accidental drags */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* Reorder on drag end + persist to localStorage + API */
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCardOrder((prev) => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
      saveLayoutToApi(next);
      return next;
    });
  }, []);

  /* Reset to default order — clear localStorage + API */
  const handleReset = useCallback(() => {
    setCardOrder(defaultOrder);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    deleteLayoutFromApi();
  }, [defaultOrder]);

  const isCustom = JSON.stringify(cardOrder) !== JSON.stringify(defaultOrder);

  /* Build child map: id -> React element */
  const childMap = {};
  childArray.forEach((child, i) => {
    childMap[getCardId(child, i)] = child;
  });

  /* SSR / initial render: default order without DnD (single wrapper div) */
  if (!mounted) {
    return (
      <div className="min-w-0">
        <div className={className}>
          {defaultOrder.map((id) => (
            <div key={id}>{childMap[id]}</div>
          ))}
        </div>
      </div>
    );
  }

  /* Always render a single wrapper div to avoid breaking parent grid layouts */
  return (
    <div className="min-w-0">
      {isCustom && (
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <RotateCcw className="h-3 w-3" />
            Reset layout
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cardOrder} strategy={rectSortingStrategy}>
          <div className={className}>
            {cardOrder.map((id) => (
              <SortableItem key={id} id={id}>
                {childMap[id]}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default DraggableGrid;
