import React from 'react';
import { TYPES, TYPE_GROUPS, DEFAULT_ROOMS } from '../takeoff/types.js';
import { roomOf } from '../takeoff/model.js';

export default function Inspector({ det, sheet, rooms, onUpdate, onDelete, onClose }) {
  const roomChoices = [
    ...new Set([...DEFAULT_ROOMS, ...rooms.map(r => r.name), 'Unassigned']),
  ];

  return (
    <div className="absolute right-6 top-20 w-72 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4 z-30">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Detection detail</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">×</button>
      </div>

      <div className="text-xs text-slate-400 flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full`} style={{ background: TYPES[det.type]?.color }} />
        {det.source === 'ai' ? `AI · confidence ${(det.confidence * 100).toFixed(0)}%` : 'User-added'}
        {det.source === 'ai' && det.roomId === null && <span className="text-amber-400">· room auto</span>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Type</label>
        <select
          value={det.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg p-2 text-sm"
        >
          {Object.entries(TYPE_GROUPS).map(([g, gLabel]) => (
            <optgroup key={g} label={gLabel}>
              {Object.entries(TYPES).filter(([, t]) => t.group === g).map(([k, t]) => (
                <option key={k} value={k}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Room</label>
        <select
          value={roomOf(det, rooms) === null ? 'Unassigned' : (det.roomId ? (rooms.find(r => r.id === det.roomId)?.name ?? 'Unassigned') : 'Auto (drawn rooms)')}
          onChange={(e) => {
            const r = rooms.find(x => x.name === e.target.value);
            onUpdate({ roomId: r ? r.id : null });
          }}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg p-2 text-sm"
        >
          <option value="Auto (drawn rooms)">Auto (drawn rooms)</option>
          <option value="Unassigned">Unassigned</option>
          {roomChoices.filter(n => n !== 'Unassigned' && !n.includes('Unassigned')).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500 mt-1">
          Currently: <b>{roomOf(det, rooms)}</b>
        </p>
      </div>

      <button
        onClick={() => onDelete(det.id)}
        className="w-full py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg text-sm font-medium transition-colors"
      >
        Delete detection
      </button>
    </div>
  );
}
