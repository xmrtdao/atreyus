import React from 'react';
import { TYPES } from '../takeoff/types.js';
import { CABLE_TYPES } from '../takeoff/materials.mjs';

export default function RunInspector({run,devices,onUpdate,onDelete,onClose}){
  const eligible=devices.filter(d=>d.type.startsWith('switch')||d.type.startsWith('light-')||d.type.startsWith('receptacle')||d.type.includes('fan'));
  const endpoints=[['fromId','From'],['toId','To']];
  return <section className="absolute right-4 top-16 z-30 w-72 bg-white border rounded-xl shadow-xl p-4 space-y-3 text-xs overflow-auto" style={{maxHeight:'calc(100vh - 12rem)'}}>
    <header className="flex justify-between"><h3 className="font-semibold text-sm">Cable run</h3><button aria-label="Close cable detail" onClick={onClose}>×</button></header>
    <p>{run.source==='pdf-vector'?'Traced from PDF strokes':'Estimator-drawn / edited route'} · {run.sourceStrokeIndices?.length ?? 0} source strokes</p>
    <p className="text-lg font-semibold text-violet-800">{run.lengthFt?.toFixed(1) ?? 'Set scale'} ft · {run.resolvedCable}</p>
    <p className="text-slate-500">Horizontal {run.horizontalFt?.toFixed(1) ?? '—'} ft + vertical {run.riseFt.toFixed(1)} ft + waste. Billable: {run.billableFeet ?? '—'} ft.</p>
    <label className="block">Cable type<select aria-label="Run cable type" className="w-full border rounded p-2 mt-1" value={run.cableType ?? 'auto'} onChange={e=>onUpdate({cableType:e.target.value})}><option value="auto">Auto · {run.resolvedCable}</option>{CABLE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
    <p className="text-[10px] text-slate-500">{run.cableReason}</p>
    {endpoints.map(([key,label])=><label key={key} className="block">{label}<select aria-label={`Run ${label.toLowerCase()} device`} className="w-full border rounded p-2 mt-1" value={run[key] ?? ''} onChange={e=>onUpdate({[key]:e.target.value || null})}><option value="">Free endpoint</option>{eligible.map((d,i)=><option key={d.id} value={d.id}>{i+1}. {TYPES[d.type]?.label ?? d.type}</option>)}</select></label>)}
    <p className="text-slate-500">Drag the route’s square handles to reshape it. Dragging an endpoint detaches it from its device.</p>
    <div className="flex gap-2"><button className="border rounded p-2" onClick={()=>{const points=run.points.map(p=>[...p]);let longest=0,at=1;for(let i=1;i<points.length;i++){const length=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);if(length>longest){longest=length;at=i;}}points.splice(at,0,[(points[at][0]+points[at-1][0])/2,(points[at][1]+points[at-1][1])/2]);onUpdate({points,source:'user-edited'});}}>Add bend</button><button className="border rounded p-2" onClick={()=>onUpdate({points:[run.points[0],run.points.at(-1)],source:'user-edited'})}>Straighten</button></div>
    <label className="flex gap-2"><input type="checkbox" checked={run.included!==false} onChange={e=>onUpdate({included:e.target.checked})}/> Include in material estimate</label>
    <label className="flex gap-2"><input type="checkbox" checked={!!run.reviewed} onChange={e=>onUpdate({reviewed:e.target.checked})}/> Route and cable reviewed</label>
    <button className="w-full text-red-700 bg-red-50 p-2 rounded" onClick={onDelete}>Delete cable run</button>
  </section>;
}
