import React, { useRef, useState, useCallback } from 'react';
import { TYPES } from '../takeoff/types.js';
import { roomOf } from '../takeoff/model.js';

export default function PlanCanvas({ planUrl, sheet, onAdd, onSelect, onMove, onRoomUpdate, selectedId, draftMode, setDraftMode }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drawRect, setDrawRect] = useState(null);       // mirrored for rendering
  const drawRectRef = useRef(null);                     // authoritative during drag
  const imgRef = useRef(null);
  const wrapRef = useRef(null);
  const dragMarker = useRef(null);
  const panStart = useRef(null);
  const [hoverId, setHoverId] = useState(null);

  // wheel zoom centered on cursor
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setZoom(z => {
      const next = Math.min(12, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setPan(p => ({
        x: cx - ((cx - p.x) * next) / z,
        y: cy - ((cy - p.y) * next) / z,
      }));
      return next;
    });
  }, []);

  const mousePos = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onMouseDown = (e) => {
    if (draftMode === 'room') {
      const p = mousePos(e);
      drawRectRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      setDrawRect(drawRectRef.current);
    } else if (e.target === imgRef.current) {
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const onMouseMove = (e) => {
    if (drawRectRef.current) {
      const p = mousePos(e);
      drawRectRef.current = { ...drawRectRef.current, x1: p.x, y1: p.y };
      setDrawRect(drawRectRef.current);
    } else if (dragMarker.current) {
      const p = mousePos(e);
      onMove(dragMarker.current, p.x, p.y);
    } else if (panStart.current) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    }
  };

  const onMouseUp = (e) => {
    if (drawRectRef.current) {
      const { x0, y0, x1, y1 } = drawRectRef.current;
      if (Math.abs(x1 - x0) > 0.01 && Math.abs(y1 - y0) > 0.01) {
        let name = null;
        try { name = window.prompt('Room name:', ''); } catch { name = null; }
        if (!name || !name.trim()) name = `Room ${(sheet.rooms?.length ?? 0) + 1}`;
        onRoomUpdate({
          id: `room_${Date.now()}`,
          name: name.trim(),
          x0: Math.min(x0, x1), y0: Math.min(y0, y1),
          x1: Math.max(x0, x1), y1: Math.max(y0, y1),
        });
      }
      drawRectRef.current = null;
      setDrawRect(null);
      setDraftMode(null);
    }
    dragMarker.current = null;
    panStart.current = null;
  };

  const onClick = (e) => {
    if (draftMode === 'add') {
      const p = mousePos(e);
      onAdd(p.x, p.y);
      setDraftMode(null);
    }
  };

  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={wrapRef}
      className="relative flex-1 overflow-hidden bg-slate-950 select-none"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onClick}
      style={{ cursor: draftMode === 'add' ? 'crosshair' : draftMode === 'room' ? 'cell' : 'grab' }}
    >
      {/* zoom bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-slate-800/90 backdrop-blur rounded-xl px-2 py-1 border border-slate-700">
        <button className="px-2 text-slate-300 hover:text-white text-lg" onClick={() => setZoom(z => Math.max(0.5, z / 1.25))}>−</button>
        <button className="px-2 py-1 text-xs font-medium text-slate-300 hover:text-white" onClick={fitToScreen}>{Math.round(zoom * 100)}%</button>
        <button className="px-2 text-slate-300 hover:text-white text-lg" onClick={() => setZoom(z => Math.min(12, z * 1.25))}>+</button>
      </div>

      <div
        className="absolute origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <img
          ref={imgRef}
          src={planUrl}
          alt="plan"
          draggable={false}
          className="block max-w-none h-auto"
          style={{ width: 1400, height: 933 }}
          onClick={(e) => e.stopPropagation()}
        />

        {/* rooms */}
        {sheet.rooms.map(r => (
          <div key={r.id} style={{ left: r.x0 * 1400, top: r.y0 * 933, width: (r.x1 - r.x0) * 1400, height: (r.y1 - r.y0) * 933 }}
            className="absolute border-2 border-dashed border-emerald-400/50 bg-emerald-400/5 pointer-events-none"
          >
            <span className="absolute -top-1 left-1 -translate-y-full text-[10px] font-semibold text-emerald-300 bg-slate-950/70 px-1 rounded">
              {r.name}
            </span>
          </div>
        ))}

        {/* in-progress room rect */}
        {drawRect && (
          <div
            className="absolute border-2 border-dashed border-emerald-300 pointer-events-none"
            style={{
              left: Math.min(drawRect.x0, drawRect.x1) * 1400,
              top: Math.min(drawRect.y0, drawRect.y1) * 933,
              width: Math.abs(drawRect.x1 - drawRect.x0) * 1400,
              height: Math.abs(drawRect.y1 - drawRect.y0) * 933,
            }}
          />
        )}

        {/* detections */}
        {sheet.detections.map(d => {
          const t = TYPES[d.type] ?? { color: '#888' };
          const isSel = d.id === selectedId;
          const isHover = d.id === hoverId;
          return (
            <div
              key={d.id}
              onMouseEnter={() => setHoverId(d.id)}
              onMouseLeave={() => setHoverId(null)}
              onMouseDown={(e) => { e.stopPropagation(); dragMarker.current = d.id; onSelect(d.id); }}
              onClick={(e) => e.stopPropagation()}
              className={`absolute flex items-center justify-center rounded-full border-2 cursor-pointer transition-transform ${isSel ? 'ring-2 ring-white scale-125 z-20' : isHover ? 'scale-125 z-10' : ''}`}
              style={{
                left: d.x * 1400, top: d.y * 933,
                width: 14, height: 14,
                marginLeft: -7, marginTop: -7,
                background: t.color + '33',
                borderColor: t.color,
              }}
              title={`${t.label}${d.confidence ? ` · AI ${(d.confidence * 100).toFixed(0)}%` : ' · user'} · room: ${roomOf(d, sheet.rooms)}`}
            >
              <span className="w-1 h-1 rounded-full" style={{ background: t.color }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
