// Pure derived estimating model: every row retains the IDs of its drawn objects.
export const PRICE_SOURCE = 'Illustrative estimator-entered USD allowances · 28 Oct 2026. Not a supplier quote; edit unit prices for the bid.';
export const PRICE_VERSION = 'allowances-2026-10-28-v1';
export const CABLE_TYPES = ['14/2 NM-B', '14/3 NM-B', '12/2 NM-B', '12/3 NM-B'];
export const DEFAULT_PRICES = Object.freeze({
  'ceiling-fan':125, 'fan-light':160, 'exhaust-fan':80, 'iaq-fan':120,
  'light-recessed':18, 'light-pendant':45, 'light-wall':35, 'light-exterior':45,
  'light-vaporproof':25, 'light-service':8, 'light-surface':25, 'light-generic':25,
  'switch':3, 'switch-3way':6, 'switch-dimmer':25, 'switch-3way-dimmer':32,
  'switch-fan':18, 'switch-sensor':35, 'switch-astro':30,
  'receptacle':3, 'receptacle-afi':3, 'receptacle-gfi':18, 'receptacle-240':14,
  'receptacle-wp':22, 'receptacle-wp-240':28, 'receptacle-halfhot':3,
  'receptacle-fc':3, 'receptacle-mw':18, 'receptacle-dw':18, 'receptacle-hood':3,
  'receptacle-quad':6, 'receptacle-floor':25,
  'smoke-detector':22, 'smoke-co-detector':38, 'co-detector':25,
  'junction-box':5, 'panelboard':200,
  'box-1':2.5, 'box-2':4, 'box-3':6, 'box-4':9, 'box-5':15, 'box-6':20,
  'plate-1':1, 'plate-2':2, 'plate-3':3, 'plate-4':4, 'plate-5':7, 'plate-6':10,
  'box-fan':12, 'box-round':3, 'cover-weatherproof':8, 'cover-fan':2,
  '14/2 NM-B':.55, '14/3 NM-B':.85, '12/2 NM-B':.75, '12/3 NM-B':1.15,
});

export function assumptions(sheet) {
  return { pointsPerFoot:sheet.referenceIndex != null ? 18 : null, switchRiseFt:4,
    wastePercent:10, defaultCable:'14/2 NM-B', travelerCable:'14/3 NM-B',
    otherLoadCable:'12/2 NM-B',
    includeOptionalFans:false, ...sheet.estimateSettings };
}
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const pdfSize = s => [(s.imageWidth || 0)/(s.zoom || 1),(s.imageHeight || 0)/(s.zoom || 1)];
const dist = (a,b,s) => {const [w,h]=pdfSize(s);return Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);};

export function deriveBoxes(sheet) {
  const devices=sheet.detections ?? [], groups=[], seen=new Set();
  const switches=devices.filter(d=>d.type.startsWith('switch'));
  const [w,h]=pdfSize(sheet);
  for(const d of switches){
    if(seen.has(d.id))continue;
    const members=[d];seen.add(d.id);
    for(const current of members)for(const other of switches){
      if(seen.has(other.id)||current.separateBox||other.separateBox)continue;
      const dx=Math.abs(current.x-other.x)*w,dy=Math.abs(current.y-other.y)*h;
      if(w>0 && h>0 && Math.hypot(dx,dy)<=14 && Math.min(dx,dy)<=2){members.push(other);seen.add(other.id);}
    }
    groups.push({members,kind:'gang',gangs:members.length});
  }
  for(const d of devices){
    if(d.type.startsWith('receptacle'))groups.push({members:[d],kind:'gang',gangs:d.type==='receptacle-quad'?2:1,weatherproof:d.type.includes('-wp')});
    else if(['ceiling-fan','fan-light'].includes(d.type))groups.push({members:[d],kind:'fan',gangs:0});
    else if(['light-wall','light-exterior','light-pendant','light-service','light-surface','light-generic','smoke-detector','smoke-co-detector','co-detector'].includes(d.type))groups.push({members:[d],kind:'round',gangs:0});
  }
  return groups.map(g=>{
    const ids=g.members.map(d=>d.id).sort();
    const id='box:'+ids.join('|');
    const override=sheet.boxOverrides?.[id]?.gangs;
    const gangs=g.kind==='gang' && Number.isInteger(override) && override>=g.gangs && override<=6 ? override : g.gangs;
    const x=g.members.reduce((a,d)=>a+d.x,0)/g.members.length;
    const y=g.members.reduce((a,d)=>a+d.y,0)/g.members.length;
    return {...g,id,gangs,memberIds:ids,x,y,
      label:g.kind==='fan'?'Fan-rated':g.kind==='round'?'Round box':`${gangs}-gang`,
      x0:Math.min(...g.members.map(d=>d.x))-6/Math.max(w,1),
      y0:Math.min(...g.members.map(d=>d.y))-6/Math.max(h,1),
      x1:Math.max(...g.members.map(d=>d.x))+6/Math.max(w,1),
      y1:Math.max(...g.members.map(d=>d.y))+6/Math.max(h,1)};
  });
}

export function resolvedPoints(run,devices) {
  const points=(run.points ?? []).map(p=>[...p]);
  const from=devices.find(d=>d.id===run.fromId),to=devices.find(d=>d.id===run.toId);
  if(points.length && from)points[0]=[from.x,from.y];
  if(points.length && to)points[points.length-1]=[to.x,to.y];
  return points;
}

function travelerRoutes(runs,devices) {
  // A traced path between 3-way controls carries a 3-conductor allowance.
  // This is an explicit routing assumption, not a claim that the PDF specifies a wire gauge.
  const graph=new Map(),marked=new Set();
  for(const r of runs){
    if(!r.fromId || !r.toId || !r.valid || r.included===false)continue;
    for(const [a,b] of [[r.fromId,r.toId],[r.toId,r.fromId]]){
      if(!graph.has(a))graph.set(a,[]);
      graph.get(a).push({node:b,id:r.id,weight:r.horizontalPdfPoints});
    }
  }
  const three=devices.filter(d=>d.type.includes('3way')).map(d=>d.id);
  for(let i=0;i<three.length;i++)for(let j=i+1;j<three.length;j++){
    const costs=new Map([[three[i],0]]),paths=new Map([[three[i],[]]]),visited=new Set();
    for(;;){
      const next=[...costs].filter(([id])=>!visited.has(id)).sort((a,b)=>a[1]-b[1])[0];
      if(!next)break;
      const [node,cost]=next;if(node===three[j]){for(const edge of paths.get(node))marked.add(edge);break;}
      visited.add(node);
      for(const edge of graph.get(node) ?? [])if(cost+edge.weight<(costs.get(edge.node) ?? Infinity)){
        costs.set(edge.node,cost+edge.weight);paths.set(edge.node,[...paths.get(node),edge.id]);
      }
    }
  }
  return marked;
}

export function deriveRuns(sheet) {
  const devices=sheet.detections ?? [], settings=assumptions(sheet),[w,h]=pdfSize(sheet);
  const base=(sheet.runs ?? []).map(run=>{
    const points=resolvedPoints(run,devices);
    const orphan=!!((run.fromId&&!devices.some(d=>d.id===run.fromId))||(run.toId&&!devices.some(d=>d.id===run.toId)));
    const valid=!orphan && points.length>=2 && points.every(p=>p.length>=2 && finite(p[0]) && finite(p[1]) && p[0]>=0 && p[0]<=1 && p[1]>=0 && p[1]<=1);
    let horizontalPdfPoints=0;
    for(let i=1;i<points.length;i++)horizontalPdfPoints+=Math.hypot((points[i][0]-points[i-1][0])*w,(points[i][1]-points[i-1][1])*h);
    const wallEnds=[run.fromId,run.toId].filter(id=>devices.find(d=>d.id===id)?.type.startsWith('switch')).length;
    const horizontalFt=settings.pointsPerFoot>0?horizontalPdfPoints/settings.pointsPerFoot:null;
    const rise=Math.max(0,Number(settings.switchRiseFt)||0)*wallEnds;
    const lengthFt=horizontalFt===null?null:(horizontalFt+rise)*(1+Math.max(0,Number(settings.wastePercent)||0)/100);
    return {...run,points,valid,orphan,horizontalPdfPoints,horizontalFt,riseFt:rise,lengthFt,
      billableFeet:valid && lengthFt!==null?Math.ceil(lengthFt-1e-9):null};
  });
  const travelers=travelerRoutes(base,devices);
  return base.map(r=>{
    const otherLoad=[r.fromId,r.toId].some(id=>{const type=devices.find(d=>d.id===id)?.type ?? '';return type.startsWith('receptacle') || type.includes('fan');});
    return {...r,resolvedCable:r.cableType && r.cableType!=='auto'?r.cableType:travelers.has(r.id)?settings.travelerCable:otherLoad?settings.otherLoadCable:settings.defaultCable,
      cableReason:r.cableType && r.cableType!=='auto'?'Estimator override':travelers.has(r.id)?'On a traced route between 3-way controls; traveler allowance':otherLoad?'Other-load allowance: supplied sheet note 6 specifies minimum 12 AWG outside lighting circuits':'Lighting-control allowance: supplied sheet note 6 permits minimum 14 AWG'};
  });
}

export function computeMaterials(sheet) {
  const settings=assumptions(sheet),devices=sheet.detections ?? [],boxes=deriveBoxes(sheet),runs=deriveRuns(sheet),map=new Map();
  const price=(key)=>{
    const value=Object.hasOwn(sheet.priceOverrides ?? {},key)?sheet.priceOverrides[key]:DEFAULT_PRICES[key];
    return finite(value)&&value>=0?value:null;
  };
  const add=(key,category,label,qty,unit,ids,note='')=>{
    const rowId=category+':'+key;
    if(!map.has(rowId))map.set(rowId,{id:rowId,priceKey:key,category,label,quantity:0,unit,sourceIds:[],note,unitPrice:price(key)});
    const row=map.get(rowId);row.quantity+=qty;row.sourceIds.push(...ids);
  };
  for(const d of devices){
    const optional=d.type==='ceiling-fan' && sheet.referenceIndex!=null && !settings.includeOptionalFans;
    add(d.type,'device',d.type,optional?0:1,'ea',[d.id],optional?'Optional fan supply excluded; fan-rated prewire box is included.':'');
  }
  for(const box of boxes){
    if(box.kind==='gang'){
      add('box-'+box.gangs,'box',`${box.gangs}-gang box`,1,'ea',[box.id]);
      add(box.weatherproof?'cover-weatherproof':'plate-'+box.gangs,'box',box.weatherproof?'Weatherproof cover':`${box.gangs}-gang plate`,1,'ea',[box.id]);
    }else{
      add(box.kind==='fan'?'box-fan':'box-round','box',box.kind==='fan'?'Fan-rated box':'Round fixture / detector box',1,'ea',[box.id]);
      if(box.kind==='fan')add('cover-fan','box','Fan prewire cover',1,'ea',[box.id]);
    }
  }
  for(const run of runs)if(run.included!==false && run.valid && run.billableFeet!==null){
    add(run.resolvedCable,'cable',run.resolvedCable,run.billableFeet,'ft',[run.id]);
  }
  const rows=[...map.values()].map(row=>({...row,sourceIds:[...new Set(row.sourceIds)],
    total:row.unitPrice===null?null:Math.round(row.quantity*row.unitPrice*100)/100}));
  const total=Math.round(rows.reduce((a,r)=>a+(r.total ?? 0),0)*100)/100;
  return {rows,boxes,runs,total,currency:'USD',settings,priceSource:PRICE_SOURCE,priceVersion:PRICE_VERSION,
    unpriced:rows.filter(r=>r.quantity>0 && r.unitPrice===null).length,
    unresolvedRuns:runs.filter(r=>r.included!==false && (!r.valid || r.billableFeet===null)).length,
    coverage:sheet.wireDiagnostics?.coverage ?? 'Only drawn / estimator-created runs are included; undrawn feeds are excluded.'};
}
