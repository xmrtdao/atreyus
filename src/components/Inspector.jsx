import React, { useState } from 'react';
import { TYPES, TYPE_GROUPS, DEFAULT_ROOMS } from '../takeoff/types.js';
import { roomOf } from '../takeoff/model.js';

export default function Inspector({ det, sheet, rooms, onUpdate, onDelete, onClose }) {
  const roomChoices = [
    ...new Set([...DEFAULT_ROOMS, ...rooms.map(r => r.name), 'Unassigned']),
  ];

  const [customType, setCustomType] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const handleTypeChange = (val) => {
    if (val === 'custom') {
      setIsAddingCustom(true);
    } else {
      setIsAddingCustom(false);
      onUpdate({ type: val });
    }
  };

  const saveCustomType = () => {
    if (!customType.trim()) return;
    onUpdate({ type: `custom:${customType.trim()}` });
    setIsAddingCustom(false);
  };

  const getLabel = (type) => {
    if (type && type.startsWith('custom:')) {
      return type.replace('custom:', '');
    }
    return TYPES[type]?.label ?? type;
  };

  const getColor = (type) => {
    if (type && type.startsWith('custom:')) return '#94a3b8';
    return TYPES[type]?.color ?? '#94a3b8';
  };

  return (
    <div className="absolute right-6 top-20 w-72 bg-white border border-[#E8E4F2] rounded-2xl shadow-2xl p-5 space-y-4 z-30 overflow-y-auto" style={{maxHeight:'calc(100vh - 7rem)'}}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Detection detail</h3>
        <button onClick={onClose} className="text-[#6B6878] hover:text-white">×</button>
      </div>

      <div className="text-xs text-[#6B6878] flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: getColor(det.type) }} />
        {det.source === 'user' ? 'User-added' : `${det.source} · ${det.source === 'pdf-keynote' ? 'geometry match' : det.source.includes('legend') ? 'similarity' : 'confidence'} ${(det.confidence * 100).toFixed(0)}%`}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold text-[#6B6878] uppercase mb-1">Type</label>
        {!isAddingCustom ? (
          <select
            aria-label="Detection type"
            value={det.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full bg-[#F0ECF8] border border-[#E8E4F2] rounded-lg p-2 text-sm"
          >
            {Object.entries(TYPE_GROUPS).map(([g, gLabel]) => (
              <optgroup key={g} label={gLabel}>
                {Object.entries(TYPES).filter(([, t]) => t.group === g).map(([k, t]) => (
                  <option key={k} value={k}>{t.label}</option>
                ))}
              </optgroup>
            ))}
            {det.type?.startsWith('custom:') && <option value={det.type}>{getLabel(det.type)}</option>}
            <option value="custom">+ Add Custom Type...</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              autoFocus
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCustomType()}
              className="flex-1 bg-[#F0ECF8] border border-[#6B3FF7] rounded-lg p-2 text-sm"
              placeholder="Enter type name..."
            />
            <button onClick={saveCustomType} className="px-3 py-2 bg-[#6B3FF7] text-white rounded-lg text-xs">Save</button>
            <button onClick={() => setIsAddingCustom(false)} className="px-3 py-2 bg-gray-200 rounded-lg text-xs">Cancel</button>
          </div>
        )}
        <p className="text-[10px] text-[#6B6878]/80">
          Currently: <b>{getLabel(det.type)}</b>
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold text-[#6B6878] uppercase mb-1">Room</label>
        <select
          aria-label="Detection room"
          value={det.roomId ?? ''}
          onChange={(e) => {
            onUpdate({ roomId: e.target.value || null, roomMethod: 'user correction' });
          }}
          className="w-full bg-[#F0ECF8] border border-[#E8E4F2] rounded-lg p-2 text-sm"
        >
          <option value="">Auto (drawn rooms)</option>
          <option value="Unassigned">Unassigned</option>
          {rooms.filter(r => r.id !== 'Unassigned').map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
          {DEFAULT_ROOMS.filter(n => n !== 'Unassigned' && !rooms.some(r=>r.id===n || r.name===n)).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <p className="text-[10px] text-[#6B6878]/80 mt-1">
          {det.roomMethod ?? 'Assign the room containing this device.'}
        </p>
      </div>

      <label className="flex gap-2 text-xs items-center"><input type="checkbox" checked={!!det.reviewed} onChange={e=>onUpdate({reviewed:e.target.checked})} /> Reviewed against drawing</label>
      {det.type.startsWith('switch') && <label className="flex gap-2 text-xs items-center"><input type="checkbox" checked={!!det.separateBox} onChange={e=>onUpdate({separateBox:e.target.checked})}/> Separate box (override nearby switch grouping)</label>}
      {det.rawClass && <p className="text-[10px] text-slate-500">Original class: {det.rawClass}</p>}
      {!!det.tags?.length && <p className="text-[10px] text-slate-600">Printed tags: {det.tags.join(' · ')}</p>}
      {det.classificationNote && <p className="text-[10px] text-amber-800">{det.classificationNote}</p>}
      <p className="text-[10px] text-slate-500">Drag the mark to correct its position. Changes update counts immediately.</p>
      <button
        onClick={() => onDelete(det.id)}
        className="w-full py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg text-sm font-medium transition-colors"
      >
        Delete detection
      </button>
    </div>
  );
}
