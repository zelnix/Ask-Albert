'use client';

import React, { useState, useEffect, useCallback, useRef, Children, createContext, useContext } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw, Minimize2, Maximize2 } from 'lucide-react';

const STORAGE_KEY = 'albert-dashboard-card-order';
const SIZE_KEY = 'albert-dashboard-card-sizes';
const API_URL = '/api/v1/user/dashboard-layout';

/* ── Card size context ── */
const CardSizeContext = createContext({ sizes: {}, toggleSize: () => {} });
export const useCardSize = (cardId) => {
  const { sizes } = useContext(CardSizeContext);
  return sizes[cardId] || 'expanded';
};

/* ── Individual sortable item wrapper ── */
const SortableItem = ({ id, children, isCompact, onToggleSize }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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
      {/* Controls — visible on hover */}
      <div className="absolute right-2 top-1.5 z-20 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/drag:opacity-100">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSize(id); }}
          className="rounded bg-slate-700/95 p-1 text-slate-400 shadow-md backdrop-blur-sm transition-all hover:bg-sky-600 hover:text-white"
          aria-label={isCompact ? 'Expand card' : 'Compact card'}
          title={isCompact ? 'Expand' : 'Compact'}
        >
          {isCompact ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
        </button>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded bg-slate-700/95 p-1 text-slate-400 shadow-md backdrop-blur-sm transition-all hover:bg-sky-600 hover:text-white active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>
      {children}
    </div>
  );
};

/* ── Helpers to extract card IDs from React children ── */
const getCardId = (child, i) =>
  child.props?.cardId || child.props?.['data-card-id'] || `card-${i}`;

/* ── API helpers ── */
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
  fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cardOrder: order }),
  }).catch(() => {});
};

const deleteLayoutFromApi = () => {
  fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cardOrder: [] }),
  }).catch(() => {});
};

/* ── Main DraggableGrid component ── */
const DraggableGrid = ({ children, className = '' }) => {
  const childArray = Children.toArray(children);
  const defaultOrder = childArray.map((child, i) => getCardId(child, i));

  const [cardOrder, setCardOrder] = useState(defaultOrder);
  const [cardSizes, setCardSizes] = useState({});
  const [mounted, setMounted] = useState(false);
  const initializedRef = useRef(false);

  /* Load saved order + sizes on mount */
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

    // Load card sizes from localStorage
    try {
      const savedSizes = localStorage.getItem(SIZE_KEY);
      if (savedSizes) setCardSizes(JSON.parse(savedSizes));
    } catch (_) {}

    // Load card order from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const order = validateOrder(JSON.parse(saved));
        if (order) setCardOrder(order);
      }
    } catch (_) {}

    // Load card order from API (authoritative)
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const handleReset = useCallback(() => {
    setCardOrder(defaultOrder);
    setCardSizes({});
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SIZE_KEY); } catch (_) {}
    deleteLayoutFromApi();
  }, [defaultOrder]);

  const toggleSize = useCallback((id) => {
    setCardSizes((prev) => {
      const cur = prev[id] || 'expanded';
      const next = { ...prev, [id]: cur === 'expanded' ? 'compact' : 'expanded' };
      try { localStorage.setItem(SIZE_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const isCustomOrder = JSON.stringify(cardOrder) !== JSON.stringify(defaultOrder);
  const hasCompact = Object.values(cardSizes).some((v) => v === 'compact');
  const isCustom = isCustomOrder || hasCompact;

  const childMap = {};
  childArray.forEach((child, i) => {
    childMap[getCardId(child, i)] = child;
  });

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

  return (
    <CardSizeContext.Provider value={{ sizes: cardSizes, toggleSize }}>
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
                <SortableItem key={id} id={id} isCompact={(cardSizes[id] || 'expanded') === 'compact'} onToggleSize={toggleSize}>
                  {childMap[id]}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </CardSizeContext.Provider>
  );
};

export default DraggableGrid;
