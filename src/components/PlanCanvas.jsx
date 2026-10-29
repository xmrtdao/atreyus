import React, { useRef, useState, useEffect } from 'react';
import { TYPES } from '../takeoff/types.js';
import { roomOf } from '../takeoff/model.js';

export default function PlanCanvas({ planUrl, sheet, onAdd, onSelect, onMove, onRoomUpdate, selectedId, draftMode, setDraftMode, activeRoom, activeType, estimate, selectedRunId, selectedBoxId, materialFocus, onClearFocus, onSelectRun, onSelectBox, onAddRun, onMoveRunVertex }) {
  const wrap = useRef(null);
  const img = useRef(null);
  const drag = useRef(null);
  const [size,setSize] = useState({w:1000,h:1000});
  const [view,setView] = useState({zoom:1,x:0,y:0});
  const [rect,setRect] = useState(null);
  const [moving,setMoving] = useState(null);
  const [showMarks,setShowMarks] = useState(true);
  const [showRooms,setShowRooms] = useState(true);
  const [boxes,setBoxes] = useState(false);
  const [showRejected,setShowRejected] = useState(false);
  const [error,setError] = useState(false);
  const [roomDraft,setRoomDraft] = useState(null);
  const [roomName,setRoomName] = useState('');
  const [showCables,setShowCables] = useState(false);
  const [showLocations,setShowLocations] = useState(false);
  const [runDraft,setRunDraft] = useState([]);
  const [movingVertex,setMovingVertex] = useState(null);
  useEffect(()=>{if(draftMode!=='run')setRunDraft([]);},[draftMode]);

  const fit = () => {
    const el=wrap.current, image=img.current;
    if (!el || !image?.naturalWidth) return;
    const scale=Math.min((el.clientWidth-56)/image.naturalWidth,(el.clientHeight-100)/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    setSize({w,h});setView({zoom:1,x:(el.clientWidth-w)/2,y:(el.clientHeight-h)/2+18});
  };
  useEffect(()=>{
    const observer=new ResizeObserver(()=>fit());
    observer.observe(wrap.current);
    return ()=>observer.disconnect();
  },[]);
  const point = e => {
    const r=img.current.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
  };
  const zoomAt = (factor,cx,cy) => setView(v=>{
    const z=Math.max(.3,Math.min(16,v.zoom*factor));
    return {zoom:z,x:cx-(cx-v.x)*z/v.zoom,y:cy-(cy-v.y)*z/v.zoom};
  });
  useEffect(()=>{
    const el=wrap.current;
    const wheel=e=>{e.preventDefault();const r=el.getBoundingClientRect();zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top);};
    el.addEventListener('wheel',wheel,{passive:false});
    return ()=>el.removeEventListener('wheel',wheel);
  },[]);
  const down=e=>{
    if(e.button!==0 || e.target.closest('[data-controls]'))return;
    const p=point(e);
    const mark=e.target.closest('[data-marker]');
    const vertex=e.target.closest('[data-run-vertex]');
    const run=e.target.closest('[data-run]');
    const box=e.target.closest('[data-box]');
    if(draftMode==='run'){
      setRunDraft(prev=>[...prev,{...p,id:mark?.dataset.marker ?? null}]);return;
    }else if(vertex && !draftMode){
      drag.current={mode:'vertex',id:vertex.dataset.runId,index:Number(vertex.dataset.runVertex)};
      setMovingVertex({...drag.current,...p});
    }else if(mark && !draftMode){
      const id=mark.dataset.marker;onSelect(id);drag.current={mode:'mark',id,...p};setMoving({id,...p});
    }else if(run && !draftMode){onSelectRun(run.dataset.run);return;
    }else if(box && !draftMode){onSelectBox(box.dataset.box);return;
    }else if(draftMode==='add'){
      if(e.target===img.current || e.target.closest('[data-plan]')){onAdd(p.x,p.y);setDraftMode(null);}
    }else if(draftMode==='room'){
      drag.current={mode:'room',...p};setRect({x0:p.x,y0:p.y,x1:p.x,y1:p.y});
    }else drag.current={mode:'pan',x:e.clientX,y:e.clientY,v:view};
    wrap.current.setPointerCapture(e.pointerId);
  };
  const move=e=>{
    const d=drag.current;if(!d)return;
    const p=point(e);
    if(d.mode==='mark')setMoving({id:d.id,...p});
    if(d.mode==='vertex')setMovingVertex({...d,...p});
    if(d.mode==='room')setRect({x0:Math.min(d.x,p.x),y0:Math.min(d.y,p.y),x1:Math.max(d.x,p.x),y1:Math.max(d.y,p.y)});
    if(d.mode==='pan')setView({...d.v,x:d.v.x+e.clientX-d.x,y:d.v.y+e.clientY-d.y});
  };
  const up=e=>{
    const d=drag.current;if(!d)return;
    const p=point(e);
    if(d.mode==='mark' && Math.hypot(p.x-d.x,p.y-d.y)>.001)onMove(d.id,p.x,p.y);
    if(d.mode==='vertex')onMoveRunVertex(d.id,d.index,p.x,p.y);
    if(d.mode==='room' && rect && rect.x1-rect.x0>.008 && rect.y1-rect.y0>.008){setRoomDraft(rect);setRoomName('');}
    drag.current=null;setMoving(null);setRect(null);setMovingVertex(null);
    if(wrap.current.hasPointerCapture(e.pointerId))wrap.current.releasePointerCapture(e.pointerId);
  };
  const visible=sheet.detections.filter(d=>(!activeRoom || roomOf(d,sheet.rooms)===activeRoom)&&(!activeType || d.type===activeType));
  return <div ref={wrap} className="relative flex-1 min-h-0 overflow-hidden bg-[#eeedf3] select-none" style={{touchAction:'none',cursor:draftMode?'crosshair':'grab'}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setMoving(null);setRect(null);setMovingVertex(null);}}>
    <div data-controls className="absolute top-3 left-3 right-3 z-20 flex flex-wrap justify-between gap-2 pointer-events-auto text-xs">
      <div className="flex items-center gap-1 rounded-xl bg-white/95 border shadow-sm px-2 py-1">
        <button aria-label="Zoom out" className="px-2 py-1 text-lg" onClick={()=>zoomAt(.8,wrap.current.clientWidth/2,wrap.current.clientHeight/2)}>−</button>
        <button className="px-2 py-1" onClick={fit}>Fit · {Math.round(view.zoom*100)}%</button>
        <button aria-label="Zoom in" className="px-2 py-1 text-lg" onClick={()=>zoomAt(1.25,wrap.current.clientWidth/2,wrap.current.clientHeight/2)}>+</button>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-white/95 border shadow-sm px-3 py-2">
        <label className="flex items-center gap-1"><input type="checkbox" checked={showMarks} onChange={e=>setShowMarks(e.target.checked)}/> Marks ({visible.length})</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={boxes} onChange={e=>setBoxes(e.target.checked)}/> Boxes</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={showRooms} onChange={e=>setShowRooms(e.target.checked)}/> Rooms</label>
        {!!sheet.rejectedDetections?.length && <label className="flex items-center gap-1"><input type="checkbox" checked={showRejected} onChange={e=>setShowRejected(e.target.checked)}/> Excluded ({sheet.rejectedDetections.length})</label>}
        <label className="flex items-center gap-1"><input aria-label="Show gang boxes" type="checkbox" checked={showLocations} onChange={e=>setShowLocations(e.target.checked)}/> Locations ({estimate?.boxes.length ?? 0})</label>
        <label className="flex items-center gap-1"><input aria-label="Show cable runs" type="checkbox" checked={showCables} onChange={e=>setShowCables(e.target.checked)}/> Cable ({estimate?.runs.length ?? 0})</label>
      </div>
      {materialFocus && <button className="bg-white border rounded px-3 py-1" onClick={onClearFocus}>Clear material highlight</button>}
      {draftMode==='run' && <div className="flex gap-2 bg-white border rounded px-3 py-2"><span>{runDraft.length} points</span><button disabled={runDraft.length<2} className="text-violet-700 disabled:opacity-40" onClick={()=>{onAddRun(runDraft.map(p=>[p.x,p.y]),runDraft[0].id,runDraft.at(-1).id);setShowCables(true);setRunDraft([]);}}>Finish cable</button><button onClick={()=>setRunDraft(p=>p.slice(0,-1))}>Undo point</button><button onClick={()=>{setRunDraft([]);setDraftMode(null);}}>Cancel</button></div>}
    </div>
    {error && <p role="alert" className="absolute inset-0 grid place-content-center text-red-700">Sheet image could not load. Refresh the page or upload the PDF again.</p>}
    <div data-plan className="absolute origin-top-left bg-white shadow-lg" style={{width:size.w,height:size.h,transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}}>
      <img ref={img} src={planUrl} alt="Electrical plan" draggable={false} className="block w-full h-full" onLoad={()=>{setError(false);fit();}} onError={()=>setError(true)}/>
      {showRooms && sheet.rooms.map(r=>r.polygon?<svg key={r.id} className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${size.w} ${size.h}`}><polygon points={r.polygon.map(([x,y])=>`${x*size.w},${y*size.h}`).join(' ')} fill="#a78bfa" fillOpacity=".08" stroke="#7c3aed" strokeWidth={1/view.zoom} strokeDasharray={`${4/view.zoom} ${3/view.zoom}`}/><text x={r.polygon[0][0]*size.w+2} y={r.polygon[0][1]*size.h+10/view.zoom} fontSize={9/view.zoom} fill="#5b21b6">{r.name}</text></svg>:Number.isFinite(r.x0)?<div key={r.id} className="absolute border border-dashed border-violet-500 bg-violet-200/10 pointer-events-none" style={{left:`${r.x0*100}%`,top:`${r.y0*100}%`,width:`${(r.x1-r.x0)*100}%`,height:`${(r.y1-r.y0)*100}%`}}><span className="bg-violet-100 text-violet-900 text-[9px] px-1">{r.name}</span></div>:Number.isFinite(r.labelX)?<span key={r.id} className="absolute pointer-events-none whitespace-nowrap text-violet-900 bg-violet-100/90 px-1 rounded" style={{left:`${r.labelX*100}%`,top:`${r.labelY*100}%`,fontSize:10/view.zoom,transform:'translate(-50%,-120%)'}}>{r.name} · auto</span>:null)}
      {rect && <div className="absolute border-2 border-violet-500 bg-violet-200/20 pointer-events-none" style={{left:`${rect.x0*100}%`,top:`${rect.y0*100}%`,width:`${(rect.x1-rect.x0)*100}%`,height:`${(rect.y1-rect.y0)*100}%`}}/>}
      <svg className="absolute inset-0 w-full h-full" style={{pointerEvents:'none',zIndex:selectedRunId?15:0}} viewBox={`0 0 ${size.w} ${size.h}`}>
        {(showCables || selectedRunId || materialFocus?.category==='cable') && estimate?.runs.map(r=>{
          const pts=r.points.map((p,i)=>movingVertex?.id===r.id && movingVertex.index===i?[movingVertex.x,movingVertex.y]:p);
          const coordinates=pts.map(([x,y])=>`${x*size.w},${y*size.h}`).join(' ');
          const selected=r.id===selectedRunId,focus=materialFocus?.category==='cable';
          const color=r.included===false?'#94a3b8':r.resolvedCable.includes('/3')?'#c2410c':'#2563eb';
          const mid=pts[Math.floor(pts.length/2)] ?? [0,0];
          return <g key={r.id} opacity={focus && !materialFocus.ids.includes(r.id) ? 0.2 : 1}>
            <polyline data-run={r.id} points={coordinates} fill="none" stroke="transparent" strokeWidth={10/view.zoom} style={{pointerEvents:'stroke',cursor:'pointer'}}/>
            <polyline data-run-visible={r.id} points={coordinates} fill="none" stroke={color} strokeWidth={(selected?3:1.6)/view.zoom} strokeDasharray={r.included===false?`${4/view.zoom} ${3/view.zoom}`:undefined}/>
            <text data-run={r.id} x={mid[0]*size.w} y={mid[1]*size.h-5/view.zoom} fontSize={9/view.zoom} fill={color} stroke="white" strokeWidth={2/view.zoom} paintOrder="stroke" style={{pointerEvents:'auto',cursor:'pointer'}}>{r.resolvedCable.replace(' NM-B','')} · {r.billableFeet ?? '?'} ft</text>
            {selected && pts.map(([x,y],i)=><rect key={i} data-run-vertex={i} data-run-id={r.id} x={x*size.w-3/view.zoom} y={y*size.h-3/view.zoom} width={6/view.zoom} height={6/view.zoom} fill="white" stroke="#7c3aed" strokeWidth={1/view.zoom} style={{pointerEvents:'auto',cursor:'move'}}/>)}
          </g>;
        })}
        {(showLocations || selectedBoxId || materialFocus?.category==='box') && estimate?.boxes.map(b=><g key={b.id} opacity={materialFocus?.category==='box' && !materialFocus.ids.includes(b.id) ? 0.2 : 1}>
          <rect data-box={b.id} x={b.x0*size.w} y={b.y0*size.h} width={(b.x1-b.x0)*size.w} height={(b.y1-b.y0)*size.h} rx={2/view.zoom} fill="none" stroke={b.id===selectedBoxId?'#7c3aed':'#0f766e'} strokeWidth={(b.id===selectedBoxId?3:1.5)/view.zoom} style={{pointerEvents:'stroke',cursor:'pointer'}}/>
          <text data-box={b.id} x={b.x1*size.w+2/view.zoom} y={b.y0*size.h} fontSize={9/view.zoom} fill="#0f766e" stroke="white" strokeWidth={2/view.zoom} paintOrder="stroke" style={{pointerEvents:'auto',cursor:'pointer'}}>{b.label}</text>
        </g>)}
        {draftMode==='run' && runDraft.length>0 && <polyline points={runDraft.map(p=>`${p.x*size.w},${p.y*size.h}`).join(' ')} fill="none" stroke="#7c3aed" strokeWidth={2/view.zoom} strokeDasharray={`${4/view.zoom} ${2/view.zoom}`}/>}
      </svg>
      {showMarks && visible.map(d=>{
        const color=TYPES[d.type]?.color ?? '#64748b';const p=moving?.id===d.id?moving:d;
        const label=TYPES[d.type]?.label ?? d.type;
        return <React.Fragment key={d.id}>
          {boxes && d.bbox && <div className="absolute pointer-events-none border" style={{left:`${d.bbox[0]*100}%`,top:`${d.bbox[1]*100}%`,width:`${(d.bbox[2]-d.bbox[0])*100}%`,height:`${(d.bbox[3]-d.bbox[1])*100}%`,borderColor:color}}/>}
          <button data-marker={d.id} aria-pressed={d.id===selectedId} aria-label={`${label} · ${sheet.rooms.find(r=>r.id===roomOf(d,sheet.rooms))?.name ?? roomOf(d,sheet.rooms)}`} title={`${label} · ${d.source} ${Math.round(d.confidence*100)}%${d.reviewed?' · reviewed':''}`} className="absolute rounded-full border-solid cursor-move" onFocus={()=>{if(!draftMode)onSelect(d.id);}} onKeyDown={e=>{if(e.key==='Enter')onSelect(d.id);}} style={{left:`${p.x*100}%`,top:`${p.y*100}%`,width:14/view.zoom,height:14/view.zoom,borderWidth:1.5/view.zoom,transform:'translate(-50%,-50%)',borderColor:color,background:color+'22',opacity:materialFocus?.category==='device' && !materialFocus.ids.includes(d.id) ? 0.2 : 1,boxShadow:d.id===selectedId?`0 0 0 ${2/view.zoom}px white,0 0 0 ${4/view.zoom}px #6b3ff7`:undefined,zIndex:d.id===selectedId?10:1}}/>
        </React.Fragment>;
      })}
      {showRejected && sheet.rejectedDetections?.map((d,i)=><span key={`rejected-${i}`} title={d.rejectionReason} className="absolute text-red-600 font-bold cursor-help" style={{left:`${d.x*100}%`,top:`${d.y*100}%`,fontSize:20/view.zoom,transform:'translate(-50%,-50%)'}}>×</span>)}
    </div>
    <div data-controls className="absolute bottom-3 left-3 text-[10px] bg-white/90 text-slate-600 px-3 py-2 rounded-lg border">Scroll to zoom · drag to pan · select a mark to edit · counts always include hidden marks</div>
    {roomDraft && <form data-controls className="absolute z-40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-5 rounded-xl shadow-xl space-y-3" onSubmit={e=>{e.preventDefault();if(!roomName.trim())return;onRoomUpdate({...roomDraft,id:crypto.randomUUID(),name:roomName.trim(),source:'user'});setRoomDraft(null);setDraftMode(null);}}><h3 className="font-semibold">Name this room</h3><input aria-label="New room name" autoFocus required value={roomName} onChange={e=>setRoomName(e.target.value)} className="border rounded p-2" placeholder="e.g. Kitchen"/><div className="flex gap-2"><button type="submit" className="bg-violet-600 text-white px-3 py-2 rounded">Save room</button><button type="button" onClick={()=>{setRoomDraft(null);setDraftMode(null);}}>Cancel</button></div></form>}
  </div>;
}
