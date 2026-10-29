import React from 'react';
import { TYPES } from '../takeoff/types.js';
import { CABLE_TYPES, PRICE_SOURCE } from '../takeoff/materials.mjs';

const money=v=>v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
export default function MaterialsPanel({estimate,onSettings,onPrice,onHighlight,onExport,onClose}){
  const s=estimate.settings;
  return <aside className="w-[400px] shrink-0 border-l bg-white flex flex-col min-h-0" aria-label="Priced materials">
    <header className="p-4 border-b flex justify-between items-start"><div><h2 className="font-bold">Material estimate</h2><p className="text-xs text-slate-500">Devices · boxes & plates · shown cable runs</p></div><button aria-label="Close materials" onClick={onClose}>×</button></header>
    <div className="p-4 overflow-y-auto space-y-4 flex-1">
      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4"><p className="text-xs text-violet-800">Material allowance · USD</p><p data-testid="material-total" className="text-3xl font-semibold text-violet-900">{money(estimate.total)}</p><p className="text-[10px] mt-2 text-slate-600">Excludes labor, tax and undrawn circuits. Unit prices are editable allowances.</p></div>
      {(estimate.unpriced>0 || estimate.unresolvedRuns>0) && <p role="alert" className="text-xs text-amber-800 bg-amber-50 p-2 rounded">Partial estimate: {estimate.unpriced} unpriced rows; {estimate.unresolvedRuns} included runs need scale or endpoint repair.</p>}
      <details className="text-xs" open><summary className="font-semibold cursor-pointer">Scale & routing assumptions</summary><div className="space-y-2 mt-3">
        <label className="flex justify-between items-center gap-2">PDF points per real foot<input aria-label="PDF points per foot" className="w-20 border rounded p-1" type="number" min="0.01" step="0.01" value={s.pointsPerFoot ?? ''} onChange={e=>onSettings({pointsPerFoot:e.target.value===''?null:Number(e.target.value)})}/></label>
        <p className="text-[10px] text-slate-500">18 points/ft = 1/4″ = 1′-0″. Confirm scale before pricing an unfamiliar sheet.</p>
        <label className="flex justify-between items-center gap-2">Rise / drop per switch end (ft)<input aria-label="Switch vertical allowance" className="w-20 border rounded p-1" type="number" min="0" step="0.5" value={s.switchRiseFt} onChange={e=>onSettings({switchRiseFt:Number(e.target.value)})}/></label>
        <label className="flex justify-between items-center gap-2">Waste allowance (%)<input aria-label="Cable waste percent" className="w-20 border rounded p-1" type="number" min="0" step="1" value={s.wastePercent} onChange={e=>onSettings({wastePercent:Number(e.target.value)})}/></label>
        <label className="flex justify-between items-center gap-2">Lighting run<select aria-label="Default cable" className="border rounded p-1" value={s.defaultCable} onChange={e=>onSettings({defaultCable:e.target.value})}>{CABLE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
        <label className="flex justify-between items-center gap-2">Motor / receptacle control<select aria-label="Other load cable" className="border rounded p-1" value={s.otherLoadCable} onChange={e=>onSettings({otherLoadCable:e.target.value})}>{CABLE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
        <label className="flex justify-between items-center gap-2">3-way traveler route<select aria-label="Traveler cable" className="border rounded p-1" value={s.travelerCable} onChange={e=>onSettings({travelerCable:e.target.value})}>{CABLE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={s.includeOptionalFans} onChange={e=>onSettings({includeOptionalFans:e.target.checked})}/> Include optional ceiling-fan supply</label>
        <p className="text-[10px] text-slate-500 leading-relaxed">Use the drawn curve as the horizontal routing proxy, add rise/drop and waste, then round each run up to a whole foot. Note 6 specifies minimum 14 AWG at lighting, 12 AWG elsewhere. NM-B prices are an assembly-cost proxy; the notes name TW/THW copper, so confirm installation method. Each run can be overridden. Recessed fixtures and exhaust/IAQ fans include their integral enclosure allowance.</p>
      </div></details>
      {['device','box','cable'].map(category=><section key={category}><h3 className="font-semibold text-xs uppercase text-slate-500 mb-2">{category==='device'?'Devices':category==='box'?'Boxes & covers':'Cable'}</h3>
        <table className="w-full text-[11px]"><thead><tr className="border-b text-slate-500"><th className="text-left">Item / drawn evidence</th><th>Qty</th><th>USD / unit</th><th className="text-right">Amount</th></tr></thead><tbody>
          {estimate.rows.filter(r=>r.category===category).map(row=>{
            const label=category==='device'?(TYPES[row.label]?.label ?? row.label):row.label;
            return <tr key={row.id} className="border-b border-slate-100" data-material-row={row.id}><td className="py-2 pr-1"><button className="text-left text-violet-800 hover:underline" title="Highlight every drawn object behind this quantity" onClick={()=>onHighlight(row)}>{label}</button>{row.note && <p className="text-[9px] text-slate-500">{row.note}</p>}</td>
              <td className="text-center whitespace-nowrap px-1" data-quantity={row.quantity}>{row.quantity} {row.unit}</td><td><input aria-label={`Unit price: ${label}`} className="w-16 border rounded p-1" type="number" min="0" step="0.01" value={row.unitPrice ?? ''} onChange={e=>onPrice(row.priceKey,e.target.value===''?null:Number(e.target.value))}/></td><td className="text-right pl-1">{money(row.total)}</td></tr>;
          })}
        </tbody></table></section>)}
      <p className="text-[10px] text-slate-500">{PRICE_SOURCE}</p><p className="text-[10px] text-slate-500">{estimate.coverage}</p>
    </div><footer className="p-3 border-t"><button onClick={onExport} className="w-full rounded-lg bg-violet-600 text-white py-2 text-sm">Export priced BOM CSV</button></footer>
  </aside>;
}
