import React, { useState, useEffect, useRef } from 'react';
import { Upload, Plus, Download, Sparkles, Square, Undo2, Trash2, FileText, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import PlanCanvas from './PlanCanvas.jsx';
import Inspector from './Inspector.jsx';
import BomPanel from './BomPanel.jsx';
import MaterialsPanel from './MaterialsPanel.jsx';
import RunInspector from './RunInspector.jsx';
import BoxInspector from './BoxInspector.jsx';
import { computeMaterials } from '../takeoff/materials.mjs';
import { deletedSheetIds, removeSheets, restoreSheets, restoreExamples } from '../takeoff/workspace.mjs';
import { emptySheet, loadAll, saveAll, computeBom, downloadJson, roomOf } from '../takeoff/model.js';
import { TYPES } from '../takeoff/types.js';
import { mapDetections } from '../takeoff/ai.js';
import { request, waitForJob } from '../takeoff/api.js';

const FALLBACK_PLANS = [
  { id: 'plan1-studio', label: 'Plan 1 · Studio', sheet: 'A1-111' },
  { id: 'plan2-2bed', label: 'Plan 2 · 2 bed', sheet: 'A2-111' },
  { id: 'plan3-2bed', label: 'Plan 3 · 2 bed', sheet: 'A3-111' },
  { id: 'plan4-3bed', label: 'Plan 4 · 3 bed', sheet: 'A4-111' },
];
const button = 'px-3 py-2 rounded-lg text-xs border border-[#D9D3E8] bg-white hover:bg-violet-50 disabled:opacity-40 flex items-center justify-center gap-1.5';

export default function AtreyusApp() {
  const [sheets, setSheets] = useState(loadAll);
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draftMode, setDraftMode] = useState(null);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [engine, setEngine] = useState('hybrid');
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeType, setActiveType] = useState(null);
  const [saved, setSaved] = useState(true);
  const [showMaterials, setShowMaterials] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [materialFocus, setMaterialFocus] = useState(null);
  const [manageSheets, setManageSheets] = useState(false);
  const [checkedSheets, setCheckedSheets] = useState([]);
  const [lastRemoval, setLastRemoval] = useState(null);
  const [undoVersion, setUndoVersion] = useState(0);
  const history = useRef({});
  const working = status === 'working';
  const deletedIds = deletedSheetIds(sheets);
  const uploaded = Object.values(sheets).filter(s=>s?.sheetId?.startsWith('upload-'));
  const allPlans = [...plans, ...uploaded.map(s=>({id:s.sheetId,label:s.label,sheet:s.sheet,importedAt:s.importedAt,savedAt:s.updatedAt}))].filter(p=>!deletedIds.includes(p.id));
  const activePlan = allPlans.find(p=>p.id===activeId);
  const sheet = activeId ? {...emptySheet(activeId),...activePlan,...sheets[activeId],sheetId:activeId} : null;

  useEffect(() => { setSaved(saveAll(sheets)); }, [sheets]);
  useEffect(() => {
    request('/api/plans').then(data=>setPlans(data.sheets)).catch(e=>{setStatus('fail');setMessage(`Could not load sheets: ${e.message}`);});
    const cancel = e => { if (e.key === 'Escape') setDraftMode(null); };
    window.addEventListener('keydown',cancel);
    return ()=>window.removeEventListener('keydown',cancel);
  }, []);
  useEffect(()=>{
    const sync=e=>{if(e.key==='atreyus-takeoffs-v3')setSheets(loadAll());};
    window.addEventListener('storage',sync);
    return ()=>window.removeEventListener('storage',sync);
  },[]);
  useEffect(()=>{
    if(activeId && !allPlans.some(p=>p.id===activeId))selectPlan(allPlans[0]?.id ?? null);
  },[sheets,plans,activeId]);

  const selectPlan = id => {setActiveId(id);setSelectedId(null);setSelectedRunId(null);setSelectedBoxId(null);setMaterialFocus(null);setDraftMode(null);setActiveRoom(null);setActiveType(null);};
  const selectDetection = id => {setSelectedId(id);setSelectedRunId(null);setSelectedBoxId(null);};
  const deleteWorkspaceSheets = ids => {
    const targets=allPlans.filter(p=>ids.includes(p.id));
    if(working || !targets.length)return;
    const title=targets.length===1?`“${targets[0].label}”`:`${targets.length} selected sheets`;
    if(!window.confirm(`Delete ${title} from this workspace? Its saved marks, rooms, cable routes and estimate settings will be removed. You can undo this deletion until the page is reloaded.`))return;
    const removal=removeSheets(sheets,targets.map(p=>p.id));
    if(!saveAll(removal.workspace)){setStatus('fail');setMessage('Could not delete sheets: browser storage is unavailable.');return;}
    setLastRemoval({...removal,previousActive:activeId});setSheets(removal.workspace);
    for(const id of removal.ids)delete history.current[id];
    setCheckedSheets(prev=>prev.filter(id=>!removal.ids.includes(id)));
    if(removal.ids.includes(activeId)){
      const remaining=allPlans.filter(p=>!removal.ids.includes(p.id));
      const index=Math.min(allPlans.findIndex(p=>p.id===activeId),remaining.length-1);
      selectPlan(remaining[Math.max(0,index)]?.id ?? null);setShowMaterials(false);
    }
    setStatus('ok');setMessage(`${targets.length} sheet${targets.length===1?'':'s'} deleted from this workspace.`);
  };
  const undoSheetDeletion = () => {
    if(!lastRemoval || working)return;
    const next=restoreSheets(sheets,lastRemoval);
    if(!saveAll(next)){setStatus('fail');setMessage('Could not restore sheets: browser storage is unavailable.');return;}
    setSheets(next);setLastRemoval(null);
    if(lastRemoval.ids.includes(lastRemoval.previousActive))selectPlan(lastRemoval.previousActive);
    setStatus('ok');setMessage('Deleted sheets and their saved takeoffs restored.');
  };
  const restoreExampleSheets = () => {
    const next=restoreExamples(sheets,plans.map(p=>p.id));
    if(!saveAll(next)){setStatus('fail');setMessage('Could not restore examples: browser storage is unavailable.');return;}
    setSheets(next);setStatus('ok');setMessage('Example sheets restored to the list. Run detection to create a new takeoff.');
  };
  const changeSheet = (patch, id = activeId) => {
    if (!id) return;
    setSheets(prev => {
      if(deletedSheetIds(prev).includes(id))return prev; // a completed job must not resurrect a sheet deleted in another tab
      const before={...emptySheet(id),...allPlans.find(p=>p.id===id),...prev[id]};
      history.current[id]=[...(history.current[id] ?? []).slice(-39),before];
      return {...prev,[id]:{...before,...patch,updatedAt:Date.now()}};
    });
  };
  const undo = () => {
    const prior=history.current[activeId]?.pop();
    if (prior) {setSheets(prev=>({...prev,[activeId]:prior}));setSelectedId(null);setSelectedRunId(null);setSelectedBoxId(null);setUndoVersion(v=>v+1);}
  };
  const updateDetection = (id, patch) => {
    const before=sheet.detections.find(d=>d.id===id);
    changeSheet({detections:sheet.detections.map(d=>d.id===id?{...d,...patch,correctedAt:Date.now()}:d),
      corrections:[...(sheet.corrections ?? []),{action:'update',id,before,patch,at:new Date().toISOString()}]});
  };
  const addDetection = (x,y) => {
    const d={id:crypto.randomUUID(),type:activeType ?? 'light-recessed',x,y,confidence:1,source:'user',roomId:activeRoom,reviewed:true};
    changeSheet({detections:[...sheet.detections,d],corrections:[...(sheet.corrections ?? []),{action:'create',detection:d,at:new Date().toISOString()}]});
    selectDetection(d.id);
  };
  const deleteDetection = id => {
    changeSheet({detections:sheet.detections.filter(d=>d.id!==id),runs:(sheet.runs ?? []).filter(r=>r.fromId!==id && r.toId!==id),corrections:[...(sheet.corrections ?? []),{action:'delete',detection:sheet.detections.find(d=>d.id===id),at:new Date().toISOString()}]});
    setSelectedId(null);
  };
  const addRoom = room => changeSheet({rooms:[...sheet.rooms,room],detections:sheet.detections.map(d=>
    room.x0<=d.x && d.x<=room.x1 && room.y0<=d.y && d.y<=room.y1 ? {...d,roomId:room.id,roomMethod:'user-drawn boundary'} : d)});

  const runAi = async () => {
    if (!activeId || working) return;
    if (sheet.detections.length && !window.confirm('Replace this sheet’s detections, rooms and cable routes with a new analysis? You can Undo to restore your corrections.')) return;
    const target=activeId;
    setStatus('working');setMessage('Starting detection…');
    try {
      const job=await request('/api/takeoff/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:target,engine})});
      const data=await waitForJob(job,setMessage);
      changeSheet({...data,sheetId:target,detections:mapDetections(data.detections,data.imageWidth,data.imageHeight,target),rejectedDetections:mapDetections(data.rejectedDetections,data.imageWidth,data.imageHeight,target),corrections:[]},target);
      setStatus(data.warnings?.length?'warn':'ok');
      setMessage(`${data.detections.length} candidates · ${data.cached?'saved analysis':'analysis complete'}. ${data.warnings?.join('. ') ?? ''}`);
    } catch(e) {setStatus('fail');setMessage(e.message);}
  };
  const uploadPdf = async e => {
    const file=e.target.files?.[0];e.target.value='';
    if (!file || working) return;
    setStatus('working');setMessage('Uploading PDF…');
    try {
      const fd=new FormData();fd.append('file',file);
      const job=await request('/api/takeoff/upload',{method:'POST',body:fd});
      const data=await waitForJob(job,setMessage);
      const importedAt=Date.now();
      setSheets(prev=>({...prev,...Object.fromEntries(data.sheets.map(p=>[p.id,{...emptySheet(p.id),...p,sheetId:p.id,importedAt}]))}));
      selectPlan(data.sheets[0].id);setStatus('ok');setMessage(`${data.pageCount} sheets ready. Select a sheet and run detection.`);
    } catch(e) {setStatus('fail');setMessage(`Upload failed: ${e.message}`);}
  };
  const bom=sheet ? computeBom(sheet.detections,sheet.rooms) : null;
  const estimate=sheet ? computeMaterials(sheet) : null;
  const selected=sheet?.detections.find(d=>d.id===selectedId);
  const selectedRun=estimate?.runs.find(r=>r.id===selectedRunId);
  const selectedBox=estimate?.boxes.find(b=>b.id===selectedBoxId);
  const exportData=()=>({...sheet,exportedAt:new Date().toISOString(),detections:bom.dets,summary:bom.roomRows,materialEstimate:estimate,pipelineVersion:sheet.pipelineVersion ?? '3.0.0'});
  const updateRun=(id,patch)=>changeSheet({runs:(sheet.runs ?? []).map(r=>r.id===id?{...r,...patch,correctedAt:Date.now()}:r),corrections:[...(sheet.corrections ?? []),{action:'update-run',id,patch,at:new Date().toISOString()}]});
  const addRun=(points,fromId,toId)=>{
    const run={id:'run-user-'+crypto.randomUUID(),points,fromId,toId,source:'user',cableType:'auto',included:true,reviewed:false};
    changeSheet({runs:[...(sheet.runs ?? []),run]});setSelectedRunId(run.id);setSelectedId(null);setSelectedBoxId(null);setDraftMode(null);
  };
  const moveRunVertex=(id,index,x,y)=>{
    const r=estimate.runs.find(v=>v.id===id);const points=r.points.map(p=>[...p]);points[index]=[x,y];
    updateRun(id,{points,source:'user-edited',...(index===0?{fromId:null}:{}),...(index===points.length-1?{toId:null}:{})});
  };
  const exportMaterials=()=>{
    const rows=[['Category','Item','Quantity','Unit','Unit price USD','Amount USD','Source object IDs'],...estimate.rows.map(r=>[r.category,TYPES[r.label]?.label ?? r.label,r.quantity,r.unit,r.unitPrice ?? '',r.total ?? '',r.sourceIds.join(';')]),['TOTAL','','','','',estimate.total],['Price source',estimate.priceSource],['Routing assumptions',JSON.stringify(estimate.settings)],['Coverage',estimate.coverage]];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`${activeId}-priced-bom.csv`;a.click();URL.revokeObjectURL(url);
  };
  const exportCsv=()=>{
    const rows=[['Room','Type','Quantity'],...bom.roomRows.flatMap(r=>Object.entries(r.byType).map(([t,n])=>[r.name,TYPES[t]?.label ?? t,n]))];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`${activeId}-counts.csv`;a.click();URL.revokeObjectURL(url);
  };

  return <div className="flex h-screen bg-white text-[#1C1A26] font-sans">
    <aside className="w-[330px] shrink-0 bg-[#F7F5FC] border-r border-[#E8E4F2] flex flex-col">
      <header className="p-5 border-b border-[#E8E4F2] flex items-center gap-3 shrink-0">
        <img src="/logo.svg" alt="" className="w-9 h-9" />
        <div><h1 className="text-xl font-bold tracking-tight">Atreyus <span className="text-[#6B3FF7]">Takeoff</span></h1><p className="text-[10px] text-slate-500 uppercase tracking-[.18em]">From drawing to decisions</p></div>
      </header>
      <div className="p-4 overflow-y-auto flex-1 space-y-5">
        <section className="space-y-2"><div className="flex justify-between items-center"><h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Electrical sheets · {allPlans.length}</h2><button className="text-[11px] text-violet-700" onClick={()=>{setManageSheets(v=>!v);setCheckedSheets([]);}}>{manageSheets?'Done managing':'Manage sheets'}</button></div>
          {manageSheets && <div className="flex gap-2 text-xs"><button disabled={working || !allPlans.length} className={button} onClick={()=>setCheckedSheets(checkedSheets.length===allPlans.length?[]:allPlans.map(p=>p.id))}>{checkedSheets.length===allPlans.length && allPlans.length?'Deselect all':'Select all'}</button><button disabled={working || !checkedSheets.length} className={`${button} text-red-700`} onClick={()=>deleteWorkspaceSheets(checkedSheets)}>Delete selected ({checkedSheets.length})</button></div>}
          {allPlans.map(p=><div key={p.id} data-sheet-row={p.id} className={`w-full rounded-lg text-xs border flex items-center gap-1 ${activeId===p.id?'bg-violet-100 border-violet-400 text-violet-900':'bg-white border-[#E8E4F2] hover:border-violet-300'}`}>
            {manageSheets && <input aria-label={`Select sheet: ${p.label}`} type="checkbox" className="ml-2" checked={checkedSheets.includes(p.id)} disabled={working} onChange={e=>setCheckedSheets(prev=>e.target.checked?[...prev,p.id]:prev.filter(id=>id!==p.id))}/>}
            <button data-sheet-open={p.id} aria-current={activeId===p.id?'page':undefined} title={p.label} onClick={()=>selectPlan(p.id)} className="text-left p-3 min-w-0 flex-1"><span className="font-medium block truncate">{p.label}</span><span className="block text-[10px] text-slate-500 mt-1">{p.id.startsWith('upload-')?`${p.importedAt?'Uploaded':'Saved'} ${Number.isFinite(p.importedAt ?? p.savedAt)?new Date(p.importedAt ?? p.savedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'sheet'} · `:''}{sheets[p.id]?.detections?.length ? `${sheets[p.id].detections.length} marks` : p.sheet}</span></button>
            <button aria-label={`Delete sheet: ${p.label}`} title="Delete sheet from workspace" className="p-2 mr-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 disabled:opacity-30" disabled={working} onClick={()=>deleteWorkspaceSheets([p.id])}><Trash2 size={14}/></button>
          </div>)}
          {!allPlans.length && <p className="text-xs text-slate-500 py-2">No sheets in this workspace. Upload a PDF or restore the example sheets.</p>}
          {lastRemoval && <button disabled={working} className="text-xs text-violet-700 underline" onClick={undoSheetDeletion}>Undo sheet deletion</button>}
          {plans.some(p=>deletedIds.includes(p.id)) && <button disabled={working} className="block text-xs text-violet-700 underline" onClick={restoreExampleSheets}>Restore example sheets</button>}
          <label className={`${button} cursor-pointer border-dashed`}><Upload size={14}/> Upload PDF · all sheets<input aria-label="Upload PDF" type="file" accept=".pdf,application/pdf" className="hidden" disabled={working} onChange={uploadPdf}/></label>
          <a className="block text-[11px] text-violet-700 underline text-center" href="/api/plans/source" target="_blank" rel="noreferrer">Download original four-sheet PDF</a>
        </section>
        <section className="space-y-2">
          <label className="block text-xs font-semibold">Detection engine<select aria-label="Detection engine" className="mt-1 w-full border rounded-lg p-2 text-xs bg-white" value={engine} onChange={e=>setEngine(e.target.value)} disabled={working}>
            <option value="hybrid">Hybrid · MEPdetect + custom Roboflow</option><option value="mepdetect">MEPdetect + legend</option><option value="roboflow">Custom Roboflow + legend</option></select></label>
          <button onClick={runAi} disabled={!activeId || working} className="w-full py-3 rounded-lg bg-[#6B3FF7] hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-40 flex gap-2 items-center justify-center">
            {working?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>} {working?'Processing…':'Run detection'}</button>
          {message && <p role="status" className={`text-xs leading-relaxed p-2 rounded-lg ${status==='fail'?'bg-red-50 text-red-800':status==='warn'?'bg-amber-50 text-amber-900':'bg-violet-50 text-violet-800'}`}>{message}</p>}
        </section>
        <section className="grid grid-cols-2 gap-2">
          <button disabled={!sheet} className={`${button} ${draftMode==='add'?'!bg-violet-200':''}`} onClick={()=>setDraftMode(draftMode==='add'?null:'add')}><Plus size={14}/> Add component</button>
          <button disabled={!sheet} className={`${button} ${draftMode==='room'?'!bg-violet-200':''}`} onClick={()=>setDraftMode(draftMode==='room'?null:'room')}><Square size={14}/> Draw room</button>
          <button disabled={!sheet} className={`${button} ${draftMode==='run'?'!bg-violet-200':''}`} onClick={()=>{setDraftMode(draftMode==='run'?null:'run');setActiveRoom(null);setActiveType(null);setMaterialFocus(null);}}>Trace cable</button>
          <button disabled={!sheet} className={button} onClick={()=>setShowMaterials(v=>!v)}>Priced materials</button>
          <button disabled={!history.current[activeId]?.length} className={button} onClick={undo}><Undo2 size={14}/> Undo</button>
          <button disabled={!sheet || working} className={button} onClick={()=>{if(window.confirm('Clear this sheet’s marks, rooms and cable routes? Undo will restore them.'))changeSheet({detections:[],rooms:[],runs:[],boxOverrides:{}});}}><Trash2 size={14}/> Clear</button>
        </section>
        {bom && <BomPanel {...bom} activeRoom={activeRoom} setActiveRoom={setActiveRoom} activeType={activeType} setActiveType={setActiveType}/>}
        {sheet?.providers && <details className="text-xs"><summary className="cursor-pointer font-semibold">Analysis provenance</summary><div className="mt-2 space-y-2 text-slate-600">{sheet.providers.map(p=><p key={p.provider}><b>{p.provider}</b>: {p.count} raw proposals{p.tiles?` across ${p.tiles} tiles${p.fullImage?' + full image':''}`:''}<br/><span className="text-[10px] break-all">{p.model}</span></p>)}<p>Overlapping proposals are merged. Legend similarity is not an AI probability. Unreviewed marks are candidates.</p><p>Pipeline {sheet.pipelineVersion} · {sheet.build}</p></div></details>}
        {sheet?.rooms.length>0 && <details className="text-xs"><summary className="cursor-pointer font-semibold">Edit rooms ({sheet.rooms.length})</summary><div className="space-y-2 mt-2">{sheet.rooms.map(r=><div key={r.id} className="flex gap-1"><input aria-label={`Room name ${r.name}`} className="border p-1 rounded min-w-0 flex-1" value={r.name} onChange={e=>changeSheet({rooms:sheet.rooms.map(v=>v.id===r.id?{...v,name:e.target.value}:v)})}/><button aria-label={`Delete room ${r.name}`} onClick={()=>changeSheet({rooms:sheet.rooms.filter(v=>v.id!==r.id),detections:sheet.detections.map(d=>d.roomId===r.id?{...d,roomId:null}:d)})}>×</button></div>)}</div></details>}
      </div>
      <footer className="p-4 border-t border-[#E8E4F2] space-y-2 shrink-0"><div className="grid grid-cols-2 gap-2"><button disabled={!sheet} className={button} onClick={()=>downloadJson(exportData(),`${activeId}-takeoff.json`)}><Download size={14}/> Export JSON</button><button disabled={!sheet} className={button} onClick={exportCsv}><Download size={14}/> Export CSV</button></div>
        <p className={`text-[10px] text-center ${saved?'text-slate-500':'text-red-700'}`}>{saved?'Autosaved in this browser · export for a portable copy':'Browser storage unavailable — export to save your work'}</p></footer>
    </aside>
    <main className="flex-1 min-w-0 relative flex flex-col">
      {activePlan ? <>
        <header className="px-5 py-3 border-b flex items-center justify-between gap-3"><div><h2 className="font-semibold text-sm">{activePlan.label}</h2><p className="text-[11px] text-slate-500">{sheet.detections.length} components · {sheet.detections.filter(d=>d.reviewed).length} reviewed · drag marks to correct placement</p></div>
          <div className="flex gap-4 items-center"><button className="text-xs text-violet-800 border rounded-lg p-2" onClick={()=>setShowMaterials(v=>!v)}>Materials · ${estimate.total.toFixed(2)}</button>{(sheet.fullSheetUrl ?? activePlan.fullSheetUrl) && <a className="text-xs text-violet-700 flex items-center gap-1" target="_blank" rel="noreferrer" href={sheet.fullSheetUrl ?? activePlan.fullSheetUrl}>Full sheet & legend <ExternalLink size={12}/></a>}</div></header>
        {sheet.detections.length>0 && <div className="text-[11px] px-5 py-2 bg-amber-50 text-amber-900 border-b border-amber-100">Draft takeoff · check each mark against the legend. Room boundaries are editable; check devices at doors and open-plan divisions.</div>}
        {draftMode && <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 bg-violet-700 text-white text-xs px-4 py-2 rounded-full shadow pointer-events-none">{draftMode==='add'?'Click a symbol to add a component':draftMode==='run'?'Click points along a run, then Finish cable':'Drag a rectangle around a room'} · Esc to cancel</div>}
        <div className="flex flex-1 min-h-0"><div className="flex flex-1 min-w-0 relative">
          <PlanCanvas key={activeId} planUrl={sheet.planUrl ?? activePlan.planUrl} sheet={sheet} draftMode={draftMode} setDraftMode={setDraftMode} selectedId={selectedId} onAdd={addDetection} onSelect={selectDetection} onMove={(id,x,y)=>updateDetection(id,{x,y,bbox:null,roomId:null,roomMethod:'Moved by user — drawn room lookup'})} onRoomUpdate={addRoom} activeRoom={activeRoom} activeType={activeType} estimate={estimate} selectedRunId={selectedRunId} selectedBoxId={selectedBoxId} materialFocus={materialFocus} onClearFocus={()=>setMaterialFocus(null)} onSelectRun={id=>{setSelectedRunId(id);setSelectedId(null);setSelectedBoxId(null);}} onSelectBox={id=>{setSelectedBoxId(id);setSelectedId(null);setSelectedRunId(null);}} onAddRun={addRun} onMoveRunVertex={moveRunVertex}/>
          {selected && <Inspector key={selected.id} det={selected} rooms={sheet.rooms} onUpdate={patch=>updateDetection(selected.id,patch)} onDelete={deleteDetection} onClose={()=>setSelectedId(null)}/>}
          {selectedRun && <RunInspector run={selectedRun} devices={sheet.detections} onUpdate={patch=>updateRun(selectedRun.id,patch)} onDelete={()=>{changeSheet({runs:sheet.runs.filter(r=>r.id!==selectedRun.id)});setSelectedRunId(null);}} onClose={()=>setSelectedRunId(null)}/>}
          {selectedBox && <BoxInspector box={selectedBox} onGangChange={gangs=>changeSheet({boxOverrides:{...sheet.boxOverrides,[selectedBox.id]:{gangs}}})} onSelectDevice={selectDetection} onDelete={()=>{if(!window.confirm('Delete this location and its devices? Connected cable runs will also be removed.'))return;const ids=selectedBox.memberIds;changeSheet({detections:sheet.detections.filter(d=>!ids.includes(d.id)),runs:(sheet.runs ?? []).filter(r=>!ids.includes(r.fromId)&&!ids.includes(r.toId))});setSelectedBoxId(null);}} onClose={()=>setSelectedBoxId(null)}/>}
        </div>{showMaterials && <MaterialsPanel estimate={estimate} onSettings={patch=>changeSheet({estimateSettings:{...sheet.estimateSettings,...patch}})} onPrice={(key,value)=>changeSheet({priceOverrides:{...sheet.priceOverrides,[key]:value}})} onHighlight={row=>{setActiveRoom(null);setActiveType(null);setMaterialFocus({category:row.category,ids:row.sourceIds});}} onExport={exportMaterials} onClose={()=>setShowMaterials(false)}/>}</div>
      </> : <div className="m-auto max-w-lg p-8 text-center"><div className="inline-flex p-5 bg-violet-50 rounded-3xl text-violet-600 mb-6"><FileText size={44}/></div><p className="text-xs text-violet-600 tracking-widest uppercase font-bold mb-3">Electrical estimating workspace</p><h2 className="text-3xl font-semibold tracking-tight mb-4">Every count starts<br/>with a mark on the plan.</h2><p className="text-sm text-slate-500 leading-relaxed">Choose one of the four Escondido homes, or upload a PDF. Detect, inspect, and correct components directly on the drawing.</p><div className="flex gap-4 justify-center text-xs text-slate-500 mt-8"><span>01 · Load sheets</span><span>02 · Detect & review</span><span>03 · Export counts</span></div></div>}
    </main>
  </div>;
}
