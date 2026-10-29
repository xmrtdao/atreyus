import React from 'react';
import { TYPES } from '../takeoff/types.js';

export default function BoxInspector({box,onGangChange,onSelectDevice,onDelete,onClose}){
  return <section className="absolute right-4 top-16 z-30 w-72 bg-white border rounded-xl shadow-xl p-4 space-y-3 text-xs">
    <header className="flex justify-between"><h3 className="font-semibold text-sm">{box.label} location</h3><button aria-label="Close box detail" onClick={onClose}>×</button></header>
    <p>{box.members.length} device{box.members.length===1?'':'s'} share this location. One box and one matching plate are counted for a switch bank.</p>
    {box.kind==='gang' && <label className="block">Gang size / spare capacity<select aria-label="Box gang size" value={box.gangs} onChange={e=>onGangChange(Number(e.target.value))} className="border rounded p-2 w-full mt-1">{Array.from({length:Math.max(0,7-box.members.length)},(_,i)=>i+box.members.length).map(n=><option key={n} value={n}>{n}-gang</option>)}</select></label>}
    <ul className="space-y-2">{box.members.map(d=><li key={d.id}><button className="text-violet-700 underline" onClick={()=>onSelectDevice(d.id)}>{TYPES[d.type]?.label ?? d.type}</button></li>)}</ul>
    <p className="text-slate-500">Move a device on the plan to change its automatic box location. “Separate box” in the device inspector overrides grouping.</p>
    <button onClick={onDelete} className="w-full text-red-700 bg-red-50 p-2 rounded">Delete location and devices</button>
  </section>;
}
