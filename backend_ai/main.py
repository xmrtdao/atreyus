"""Atreyus API: durable ingestion jobs, real model inference, auditable geometry."""
import hashlib
import json
import os
import re
import threading
import time
import uuid
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pymupdf as fitz
import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from plans import ROOT, PLAN_IDS, VIEWPORTS, fingerprint, reference_fingerprints, render_page, room_labels
from providers import mepdetect, roboflow, canonical, ProviderError
from legend import detect as legend_detect, refine
from vector_symbols import detect as vector_detect
from room_regions import rooms_for, contains
from plan_semantics import panelboards, switch_banks
from wiring import trace as trace_wiring
from collections import Counter

VERSION = '3.1.0'
BUILD = hashlib.sha256(b''.join((Path(__file__).parent / p).read_bytes() for p in
    ('main.py','plans.py','providers.py','legend.py','vector_symbols.py','room_regions.py','plan_semantics.py','wiring.py'))).hexdigest()[:12]
DATA = ROOT / 'backend_ai/results/v3'
DATA.mkdir(parents=True, exist_ok=True)
POOL = ThreadPoolExecutor(max_workers=2)
LOCK = threading.Lock()
PDF_LOCK = threading.RLock()
JOBS = {}
ENV = {}
env_path = Path(os.environ.get('ATREYUS_ENV_FILE', ROOT.parent / 'relay/.env'))
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); ENV[k.strip()]=v.strip().strip('"').strip("'")
ENV.update(os.environ)
REFERENCES = reference_fingerprints()
app = FastAPI(title='Atreyus Electrical Takeoff', version=VERSION)

def write_json(path, value):
    temp=path.with_suffix(f'.{uuid.uuid4().hex}.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
    # Windows scanners/readers can briefly hold the destination without delete sharing.
    # Keep the old complete snapshot until an atomic replacement succeeds.
    for attempt in range(10):
        try:
            temp.replace(path)
            return
        except PermissionError:
            if attempt==9:
                temp.unlink(missing_ok=True)
                raise
            time.sleep(.025*(attempt+1))

def pdf_guard(fn):
    @wraps(fn)
    def guarded(*args,**kwargs):
        with PDF_LOCK:return fn(*args,**kwargs)
    return guarded

def update_job(jid, **patch):
    with LOCK:
        JOBS[jid].update(patch, updatedAt=time.time())
        write_json(DATA / f'job-{jid}.json', JOBS[jid])

def new_job(kind, task, *args):
    jid=uuid.uuid4().hex
    JOBS[jid]={'id':jid,'kind':kind,'status':'queued','progress':0,'message':'Queued','createdAt':time.time()}
    update_job(jid)
    def run():
        try:
            update_job(jid,status='working')
            result=task(jid,*args)
            update_job(jid,status='completed',progress=100,message='Complete',result=result)
        except Exception as exc:
            message=str(exc) if isinstance(exc,(ProviderError,ValueError)) else f'Processing failed ({type(exc).__name__}). Please retry.'
            print(f'Job {jid}: {type(exc).__name__}',flush=True)
            if isinstance(exc,OSError):print(f'Filesystem error: errno={exc.errno}, file={exc.filename}',flush=True)
            update_job(jid,status='failed',message=message)
    POOL.submit(run)
    return JOBS[jid].copy()

def manifest_path(plan):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',plan): raise HTTPException(400,'Invalid sheet ID')
    return DATA / f'{plan}.json'

def prepare_page(page, plan, label, document_name, pdf_path, page_index):
    ref=REFERENCES.get(fingerprint(page))
    clip=list(VIEWPORTS[ref] if ref is not None else page.rect)
    # Cap raster area for unfamiliar large format drawings.
    zoom=min(4, (24_000_000/max(1,fitz.Rect(clip).get_area()))**.5)
    w,h=render_page(page,DATA/f'{plan}.png',clip,zoom)
    full=page.get_pixmap(matrix=fitz.Matrix(min(1,2400/page.rect.width),min(1,2400/page.rect.width)))
    full.save(DATA/f'{plan}-full.png')
    meta={'id':plan,'label':label,'sheet':f'Sheet {page_index+1}', 'documentName':document_name,
          'planUrl':f'/results/v3/{plan}.png','fullSheetUrl':f'/results/v3/{plan}-full.png',
          'imageWidth':w,'imageHeight':h,'clip':clip,'zoom':zoom,'pageIndex':page_index,
          'referenceIndex':ref,'pdfPath':str(pdf_path),'labels':room_labels(page,clip),
          'words':page.get_text('words',clip=fitz.Rect(clip)), 'version':VERSION}
    write_json(manifest_path(plan),meta)
    return meta

def public_meta(meta):
    return {k:v for k,v in meta.items() if k not in ('pdfPath','words','labels')}

@pdf_guard
def get_meta(plan):
    path=manifest_path(plan)
    if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    if plan not in PLAN_IDS: raise HTTPException(404,'Sheet not found. Upload the PDF again.')
    i=PLAN_IDS.index(plan)
    pdf=ROOT/'assets/plans/plans.pdf'
    with fitz.open(pdf) as doc:
        return prepare_page(doc[i],plan,['Plan 1 · Studio','Plan 2 · 2 bed','Plan 3 · 2 bed','Plan 4 · 3 bed'][i],pdf.name,pdf,i)

@pdf_guard
def ingest(jid, pdf, name):
    with fitz.open(pdf) as doc:
        if doc.needs_pass: raise ValueError('This PDF is password protected. Upload an unlocked copy.')
        if not 1<=len(doc)<=20: raise ValueError('Upload a PDF with 1–20 sheets.')
        sheets=[]
        for i,page in enumerate(doc):
            update_job(jid,message=f'Rendering sheet {i+1} of {len(doc)}',progress=round(90*i/len(doc)))
            plan=f'upload-{pdf.stem}-{i+1}'
            sheets.append(public_meta(prepare_page(page,plan,f'{name} · Sheet {i+1}',name,pdf,i)))
        return {'sheets':sheets,'pageCount':len(sheets)}

def family(t):
    if t.startswith('light-'): return 'light'
    if t.startswith('switch'): return 'switch'
    if t.startswith('receptacle'): return 'receptacle'
    if t in ('smoke-detector','smoke-co-detector','co-detector'): return 'detector'
    return t

def merge(dets, meta):
    out=[]; z=meta['zoom']; clip=meta['clip']; w,h=meta['imageWidth'],meta['imageHeight']
    # Same-legend glyphs carry subtype information a generic pretrained model lacks.
    ranked=sorted(dets,key=lambda d:(d['source'] in ('vector-legend','pdf-keynote'),d['source']=='legend',d['type']=='ceiling-fan', d['type']=='light-recessed',d['confidence']),reverse=True)
    for d in ranked:
        x,y=d['center']
        if not (0<=x<=w and 0<=y<=h): continue
        t=refine(d['type'],x/z+clip[0],y/z+clip[1],meta['words'])
        d={**d,'type':t,'reviewed':False}
        existing=next((e for e in out if (family(e['type'])==family(t) or e['source']=='vector-legend' or (e['source']=='legend' and d['source'] not in ('legend','vector-legend'))) and
                       ((x-e['center'][0])**2+(y-e['center'][1])**2)**.5 < (4 if family(t)=='switch' else 6)*z),None)
        if existing:
            existing.setdefault('supportingSources',[])
            if d['source']!=existing['source'] and d['source'] not in existing['supportingSources']:
                existing['supportingSources'].append(d['source'])
            continue
        # A fan centre contains a J glyph: count the combined symbol only once.
        if t=='junction-box' and any(e['type']=='ceiling-fan' and ((x-e['center'][0])**2+(y-e['center'][1])**2)**.5 < 8*z for e in out): continue
        d['id']='det-'+hashlib.sha256(f'{t}:{x:.1f}:{y:.1f}'.encode()).hexdigest()[:14]
        out.append(d)
    return out

def associate_tags(dets,meta):
    """Attach each printed tag to its nearest compatible glyph, then choose a subtype."""
    z=meta['zoom'];cx,cy=meta['clip'][:2]
    categories={'AFI':'receptacle','GFI':'receptacle','WP':'receptacle','240V':'receptacle',
                'MW':'receptacle','DW':'receptacle','FC':'receptacle','H':'receptacle',
                'D':'switch','F':'switch','3D':'switch','3':'switch','VS':'switch','A':'switch',
                'EXT':'light','VP':'light','P':'light','SD':'detector','SD/MA':'detector','IAQ':'exhaust-fan'}
    for d in dets:d['tags']=[]
    for word in meta['words']:
        tag=word[4];f=categories.get(tag)
        if not f:continue
        candidates=[d for d in dets if family(d['type'])==f or (f=='exhaust-fan' and d['type']=='iaq-fan')]
        if not candidates:continue
        x,y=(word[0]+word[2])/2,(word[1]+word[3])/2
        nearest=min(candidates,key=lambda d:(d['center'][0]/z+cx-x)**2+(d['center'][1]/z+cy-y)**2)
        distance=((nearest['center'][0]/z+cx-x)**2+(nearest['center'][1]/z+cy-y)**2)**.5
        if distance<(32 if f=='receptacle' else 22): nearest['tags'].append(tag)
    for d in dets:
        tags=d['tags'];f=family(d['type'])
        if f=='receptacle':
            d['type']='receptacle-wp-240' if 'WP' in tags and '240V' in tags else 'receptacle-wp' if 'WP' in tags else 'receptacle-240' if '240V' in tags else 'receptacle-fc' if 'FC' in tags else 'receptacle-mw' if 'MW' in tags else 'receptacle-dw' if 'DW' in tags else 'receptacle-hood' if 'H' in tags else 'receptacle-gfi' if 'GFI' in tags else 'receptacle-afi' if 'AFI' in tags else d['type']
        if f=='switch':
            mapping={'3D':'switch-3way-dimmer','3':'switch-3way','D':'switch-dimmer','F':'switch-fan','VS':'switch-sensor','A':'switch-astro'}
            if tags:d['type']=mapping[tags[0]]
        if f=='light':
            if 'EXT' in tags:d['type']='light-exterior'
            elif 'VP' in tags:d['type']='light-vaporproof'
            elif 'P' in tags:d['type']='light-pendant'
        if f=='detector' and tags:d['type']='smoke-co-detector' if 'SD/MA' in tags else 'smoke-detector'
        if f=='exhaust-fan' and 'IAQ' in tags:d['type']='iaq-fan'
    return dets

@pdf_guard
def validate_geometry(dets,meta):
    """Reject model text/column false positives and distinguish non-square service lights."""
    if meta['referenceIndex'] is None:return dets,[]
    with fitz.open(meta['pdfPath']) as doc:
        paths=doc[meta['pageIndex']].get_drawings()
    lines=[(p['items'][0][1],p['items'][0][2]) for p in paths if len(p['items'])==1 and p['items'][0][0]=='l']
    kept=[];rejected=[];z=meta['zoom'];cx,cy=meta['clip'][:2]
    for d in dets:
        x,y=d['center'][0]/z+cx,d['center'][1]/z+cy
        reason=None
        if d['type']=='ceiling-fan':d['classificationNote']='Optional ceiling fan / prewire symbol, per this sheet’s legend'
        if d['source']=='roboflow' and d['confidence']<.4:
            reason='Custom model confidence below the 0.40 review threshold'
        if d['source'] in ('mepdetect','roboflow') and any(w[0]<=x<=w[2] and w[1]<=y<=w[3] for w in meta['words']):
            reason='Model proposal centered on printed text rather than a symbol'
        near=[(a,b) for a,b in lines if abs((a.x+b.x)/2-x)<8 and abs((a.y+b.y)/2-y)<8]
        if d['type']=='light-generic':
            diagonals=[(b.x-a.x)*(b.y-a.y) for a,b in near if 4<abs(b.x-a.x)<13 and 4<abs(b.y-a.y)<13]
            if any(v>0 for v in diagonals) and any(v<0 for v in diagonals):
                reason='Crossed structural column symbol, not a light'
        if d['type']=='light-recessed':
            sides=sum(1 for a,b in near if
                (abs(a.x-b.x)<.2 and 7<abs(a.y-b.y)<11 and 3<abs(a.x-x)<6.5 and abs((a.y+b.y)/2-y)<2) or
                (abs(a.y-b.y)<.2 and 7<abs(a.x-b.x)<11 and 3<abs(a.y-y)<6.5 and abs((a.x+b.x)/2-x)<2))
            if sides<3 and any(w[4]=='ATTIC' and ((w[0]+w[2])/2-x)**2+((w[1]+w[3])/2-y)**2<35**2 for w in meta['words']):
                d['type']='light-service';d['classificationNote']='Non-square light symbol by IN ATTIC label; review fixture specification'
        if family(d['type'])=='receptacle':
            half_hot=any(p['type']=='f' and 2.2<min(p['rect'].width,p['rect'].height)<3.0 and
                         7.0<max(p['rect'].width,p['rect'].height)<8.0 and
                         ((p['rect'].x0+p['rect'].x1)/2-x)**2+((p['rect'].y0+p['rect'].y1)/2-y)**2<4**2 for p in paths)
            if half_hot:d['type']='receptacle-halfhot'
        if reason:rejected.append({**d,'rejectionReason':reason})
        else:kept.append(d)
    return kept,rejected

def assign_rooms(dets,meta):
    """Nearest actual PDF room label, explicitly provisional; never invent an unlabeled room."""
    clip=meta['clip']; z=meta['zoom']; labels=meta['labels']
    traced=rooms_for(meta)
    rooms=list(traced) if traced else [{'id':r['id'],'name':r['name'],'labelX':(r['x']-clip[0])*z/meta['imageWidth'],
            'labelY':(r['y']-clip[1])*z/meta['imageHeight'],'source':'pdf-label'} for r in labels]
    rooms.append({'id':'Exterior','name':'Exterior','source':'user-review'})
    for d in dets:
        x,y=d['center']; px,py=x/z+clip[0],y/z+clip[1]
        matching=next((r for r in (traced or []) if contains(r,x/meta['imageWidth'],y/meta['imageHeight'])),None)
        if d['type'] in ('light-exterior','receptacle-wp','receptacle-wp-240') or (d['type']=='panelboard' and not matching):
            d['roomId']='Exterior'; d['roomMethod']='exterior device tag'
        elif matching:
            d['roomId']=matching['id'];d['roomMethod']='traced sheet boundary — review open-plan divisions'
        elif labels:
            label=min(labels,key=lambda r:(r['x']-px)**2+(r['y']-py)**2)
            # Keep the assignment in the actual room catalogue rather than returning an orphan label ID.
            canonical=next((r for r in rooms if r['name'].lower()==label['name'].lower()),None)
            d['roomId']=canonical['id'] if canonical else label['id']; d['roomMethod']='nearest PDF label — review boundary devices'
            if not canonical and not any(r['id']==label['id'] for r in rooms):rooms.append({'id':label['id'],'name':label['name'],'source':'pdf-label'})
        else:
            d['roomId']=None; d['roomMethod']='unassigned'
    for bank in switch_banks(dets,z):
        if len(bank)<2:continue
        room=Counter(d.get('roomId') for d in bank).most_common(1)[0][0]
        for d in bank:d['roomId']=room;d['roomMethod']='shared switch location / room boundary'
    return rooms

def analyze(jid,plan,engine,refresh):
    meta=get_meta(plan); image=DATA/f'{plan}.png'
    key=hashlib.sha256(image.read_bytes()+f'{VERSION}:{BUILD}:{engine}'.encode()).hexdigest()
    cache=DATA/f'cache-{key}.json'
    if cache.exists() and not refresh:
        result=json.loads(cache.read_text(encoding='utf-8')); result['cached']=True
        return {**result,'planId':plan,**public_meta(meta)}
    update_job(jid,message='Detecting electrical symbols',progress=10)
    dets=[]; providers=[]; warnings=[]
    engines={'hybrid':[('MEPdetect',mepdetect),('Roboflow',roboflow)],
             'mepdetect':[('MEPdetect',mepdetect)],'roboflow':[('Roboflow',roboflow)]}[engine]
    def provider_result(name,fn):
        signature=hashlib.sha256(image.read_bytes()+str((name,'full-and-tiles-v2' if name=='Roboflow' else 'v1',ENV.get('ROBOFLOW_MODEL_ID'),ENV.get('MEPDETECT_MODEL_ID'))).encode()).hexdigest()
        raw_cache=DATA/f'provider-{signature}.json'
        if raw_cache.exists() and not refresh:return json.loads(raw_cache.read_text(encoding='utf-8'))
        result=fn(image,ENV);write_json(raw_cache,result);return result
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[(name,pool.submit(provider_result,name,fn)) for name,fn in engines]
        if meta['referenceIndex'] is not None:
            with PDF_LOCK:
                dets=legend_detect(image,meta['clip'],meta['words'])
                providers.append({'provider':'Legend matching','count':len(dets),'model':'Escondido legend, 4 rotations'})
                with fitz.open(meta['pdfPath']) as doc:
                    vectors=vector_detect(doc[meta['pageIndex']],meta['clip'],meta['zoom'],meta['words'],meta['referenceIndex'])
                    vectors.extend(panelboards(doc[meta['pageIndex']],fitz.Rect(meta['clip']),meta['zoom']))
            dets.extend(vectors)
            providers.append({'provider':'Vector legend','count':len(vectors),'model':'CAD stroke geometry + PDF text tags'})
        for name,future in futures:
            try:
                found,info=future.result()
                for d in found: d['type']=canonical(d['rawClass'])
                dets.extend(found); providers.append(info)
            except (ProviderError,requests.RequestException) as exc:
                warnings.append(str(exc) if isinstance(exc,ProviderError) else f'{name} connection failed ({type(exc).__name__})')
    if not providers: raise ProviderError('; '.join(warnings))
    update_job(jid,message='Merging overlapping detections and reading room labels',progress=90)
    dets,rejected=validate_geometry(merge(dets,meta),meta)
    dets=associate_tags(dets,meta); rooms=assign_rooms(dets,meta)
    runs=[];wire_info={'coverage':'No automatic trace for this drawing style. Trace cable on the plan and confirm its scale.'}
    if meta['referenceIndex'] is not None:
        update_job(jid,message='Tracing the plotted cable control curves',progress=95)
        with PDF_LOCK,fitz.open(meta['pdfPath']) as doc:
            runs,wire_info=trace_wiring(doc[meta['pageIndex']],meta,dets)
    result={**public_meta(meta),'planId':plan,'detections':dets,'rooms':rooms,'providers':providers,
            'warnings':warnings,'engine':engine,'pipelineVersion':VERSION,'cached':False,'rejectedDetections':rejected,
            'analyzedAt':time.time(),'reviewRequired':True,'build':BUILD,'runs':runs,'wireDiagnostics':wire_info}
    write_json(cache,result)
    return result

@app.get('/health')
@app.get('/api/health')
def health():
    return {'status':'ok','version':VERSION,'build':BUILD,'providers':{'mepdetect':bool(ENV.get('MEPDETECT_API_KEY')),
            'roboflow':bool(ENV.get('ROBOFLOW_API_KEY') and ENV.get('ROBOFLOW_MODEL_ID'))}}

@app.get('/api/plans')
def plans():
    return {'sheets':[public_meta(get_meta(p)) for p in PLAN_IDS]}

@app.get('/api/plans/source')
def source_pdf():
    return FileResponse(ROOT/'assets/plans/plans.pdf',media_type='application/pdf',filename='Escondido-Electrical-Plans.pdf')

@app.post('/api/takeoff/upload',status_code=202)
def upload(file: UploadFile=File(...)):
    if not (file.filename or '').lower().endswith('.pdf'): raise HTTPException(415,'Choose a PDF file.')
    folder=ROOT/'backend_ai/uploads'; folder.mkdir(exist_ok=True)
    path=folder/f'{uuid.uuid4().hex}.pdf'; size=0
    try:
        with path.open('wb') as f:
            while chunk:=file.file.read(1024*1024):
                size+=len(chunk)
                if size>50*1024*1024: raise HTTPException(413,'PDF must be smaller than 50 MB.')
                f.write(chunk)
        # Validate from bytes: failed native PDF opens can retain a Windows file handle.
        with PDF_LOCK, fitz.open(stream=path.read_bytes(),filetype='pdf') as doc:
            if doc.needs_pass: raise HTTPException(422,'PDF is password protected.')
            if not 1<=len(doc)<=20: raise HTTPException(422,'PDF must contain 1–20 sheets.')
    except HTTPException:
        path.unlink(missing_ok=True); raise
    except Exception:
        path.unlink(missing_ok=True); raise HTTPException(422,'This file is not a readable PDF.')
    return new_job('upload',ingest,path,Path(file.filename.replace('\\','/')).name)

class AnalyzeRequest(BaseModel):
    plan: str
    engine: str='hybrid'
    refresh: bool=False

@app.post('/api/takeoff/analyze',status_code=202)
def start_analysis(data: AnalyzeRequest):
    if data.engine not in ('hybrid','mepdetect','roboflow'): raise HTTPException(400,'Unknown detector')
    get_meta(data.plan)
    return new_job('analysis',analyze,data.plan,data.engine,data.refresh)

@app.get('/api/jobs/{jid}')
def job_status(jid: str):
    if not re.fullmatch('[a-f0-9]{32}',jid): raise HTTPException(404,'Job not found')
    with LOCK:
        if jid in JOBS: return JOBS[jid].copy()
    path=DATA/f'job-{jid}.json'
    if not path.exists(): raise HTTPException(404,'Job not found')
    job=json.loads(path.read_text(encoding='utf-8'))
    if job['status'] in ('working','queued'):
        job.update(status='failed',message='Server restarted during processing. Please retry.')
    return job

app.mount('/results/v3',StaticFiles(directory=DATA),name='results')

if __name__=='__main__':
    uvicorn.run(app,host='0.0.0.0',port=int(os.environ.get('ATREYUS_PORT','8000')))
