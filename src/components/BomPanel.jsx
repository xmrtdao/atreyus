import React from 'react';
import { TYPES } from '../takeoff/types.js';

export default function BomPanel({ roomRows, activeRoom, setActiveRoom, activeType, setActiveType }) {
  const all = {};
  for (const row of roomRows) for (const [type,count] of Object.entries(row.byType)) all[type] = (all[type] ?? 0) + count;
  const rows = activeRoom ? roomRows.filter(r => r.roomId === activeRoom) : roomRows;
  const counts = {};
  for (const row of rows) for (const [type,count] of Object.entries(row.byType)) counts[type] = (counts[type] ?? 0) + count;
  return <section className="space-y-3">
    <div className="flex justify-between items-center"><h2 className="text-xs font-bold uppercase tracking-wider">Component takeoff</h2>
      <span className="rounded-full px-2 py-1 bg-violet-100 text-violet-800 text-xs">{Object.values(all).reduce((a,b)=>a+b,0)} marks</span></div>
    <label className="text-xs block">Room
      <select aria-label="Filter by room" className="mt-1 w-full rounded-lg border p-2 bg-white" value={activeRoom ?? ''} onChange={e=>setActiveRoom(e.target.value || null)}>
        <option value="">All rooms · home total</option>
        {roomRows.map(r=><option key={r.roomId} value={r.roomId}>{r.name} ({r.total})</option>)}
      </select>
    </label>
    <p className="text-[11px] text-slate-500">Click a type to isolate its marks on the drawing.</p>
    <table className="w-full text-xs"><thead><tr className="text-slate-500 border-b"><th className="text-left py-2">Component</th><th>Room</th><th>Home</th></tr></thead>
      <tbody>{Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)).map(([type,count])=><tr key={type} className={`border-b border-slate-100 ${activeType===type?'bg-violet-100':''}`}>
        <td><button className="text-left py-2 flex items-center gap-2" onClick={()=>setActiveType(activeType===type?null:type)}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{background:TYPES[type]?.color ?? '#64748b'}} />{TYPES[type]?.label ?? type.replace('custom:','')}</button></td>
        <td className="text-center font-semibold">{count}</td><td className="text-center text-slate-500">{all[type]}</td></tr>)}</tbody>
    </table>
    {!Object.keys(all).length && <p className="text-xs text-slate-500">Run detection or add a component to begin.</p>}
    {(activeType || activeRoom) && <button className="text-xs text-violet-700 underline" onClick={()=>{setActiveType(null);setActiveRoom(null);}}>Show all marks</button>}
  </section>;
}
