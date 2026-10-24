import React from 'react';
import { TYPE_GROUPS } from '../takeoff/types.js';

export default function BomPanel({ roomRows, totals, activeRoom, setActiveRoom }) {
  return (
    <section>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Bill of materials
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-400">
              <th className="text-left py-1 pr-2">Room</th>
              {Object.values(TYPE_GROUPS).map(g => (
                <th key={g} className="text-center py-1 px-1">{g.slice(0, 4)}</th>
              ))}
              <th className="text-center py-1 px-1">Σ</th>
            </tr>
          </thead>
          <tbody>
            {roomRows.filter(r => r.total > 0).map(r => (
              <tr
                key={r.roomId}
                onClick={() => setActiveRoom(r.roomId)}
                className={`cursor-pointer hover:bg-slate-700/60 ${activeRoom === r.roomId ? 'bg-slate-700/80' : ''}`}
              >
                <td className="py-1 pr-2 font-medium text-slate-200 truncate max-w-[120px]">{r.name}</td>
                {Object.keys(TYPE_GROUPS).map(gKey => (
                  <td key={gKey} className="text-center py-1 text-slate-300">
                    {r.byGroup[gKey] ?? '·'}
                  </td>
                ))}
                <td className="text-center py-1 font-bold text-blue-300">{r.total}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-600 font-semibold">
              <td className="py-1.5 pr-2 text-slate-300">Total</td>
              {Object.keys(TYPE_GROUPS).map(gKey => (
                <td key={gKey} className="text-center py-1.5 text-slate-200">{totals[gKey] ?? 0}</td>
              ))}
              <td className="text-center py-1.5 text-blue-300">
                {Object.values(totals).reduce((a, b) => a + b, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {roomRows.every(r => r.total === 0) && (
        <p className="text-xs text-slate-500 italic pt-2">No detections yet — run AI or click + Add.</p>
      )}
    </section>
  );
}
