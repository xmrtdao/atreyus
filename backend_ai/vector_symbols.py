"""Recognize repeated CAD stroke sequences from the supplied legend.

Exact vector geometry avoids counting letters, door arcs, or furniture as switches.
No component locations are precomputed. Rotation and uniform scale are fitted.
"""
import numpy as np
import pymupdf as fitz
from functools import lru_cache
from plans import ROOT
from legend import refine

def line_points(paths):
    result=[]
    for p in paths:
        if len(p['items'])==1 and p['items'][0][0]=='l':
            _,a,b=p['items'][0]
            result.append([a.x,a.y,b.x,b.y])
        else: result.append([np.nan]*4)
    return np.asarray(result).reshape(-1,2,2)

@lru_cache(maxsize=1)
def switch_reference():
    with fitz.open(ROOT/'assets/plans/plans.pdf') as doc:
        paths=doc[0].get_drawings()
        selected=[p for p in paths if 1459<p['rect'].x0<1468 and 117<p['rect'].y0<133]
        points=line_points(selected).reshape(-1,2)
        return points-points[0]

def switches(page,clip,zoom,words):
    paths=page.get_drawings(); lines=line_points(paths)
    template=switch_reference(); n=len(template)//2
    result=[]
    for i,p in enumerate(paths[:-n+1]):
        if not (clip[0]<p['rect'].x0<clip[2] and clip[1]<p['rect'].y0<clip[3]):continue
        pts=lines[i:i+n].reshape(-1,2)
        if not np.isfinite(pts).all():continue
        local=pts-pts[0]
        for turn in range(4):
            theta=turn*np.pi/2
            rotation=np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
            t=template@rotation
            scale=np.sum(local*t)/np.sum(t*t)
            if not .7<scale<1.4:continue
            error=float(np.sqrt(np.mean((local-t*scale)**2)))
            if error>.16:continue
            lo=pts.min(axis=0); hi=pts.max(axis=0); x,y=(lo+hi)/2
            if any(np.hypot(x-d['_pdf'][0],y-d['_pdf'][1])<2 for d in result):break
            bbox=[(lo[0]-clip[0])*zoom,(lo[1]-clip[1])*zoom,(hi[0]-clip[0])*zoom,(hi[1]-clip[1])*zoom]
            result.append({'type':refine('switch',x,y,words),'center':[(x-clip[0])*zoom,(y-clip[1])*zoom],
                           'bbox':bbox,'source':'vector-legend','confidence':max(0,1-error),
                           'rawClass':'switch','geometryErrorPoints':error,'_pdf':(x,y)})
            break
    for d in result:d.pop('_pdf',None)
    return result

@lru_cache(maxsize=4)
def references(reference_index=0):
    specs={
        'switch':((1459,117,1468,133),(1463.4,125.2)),
        'ceiling-fan':((1588,320,1707,439),(1647.8,379.7)),
        'receptacle':((1730,120,1748,141),(1738.6,130)),
        'receptacle-three-prong':((1730,170,1748,190),(1738.6,179.2)),
        'smoke-detector':((1594,196,1611,213),(1602.4,204.4)),
        'light-recessed':((1452,536,1468,552),(1459.9,543.6)),
        'light-wall':((1452,442,1468,459),(1459.9,449.6)),
        'light-pendant':((1452,405,1468,420),(1459.9,412.4)),
        'exhaust-fan':((1452,355,1466,369),(1458.6,362)),
        'junction-box':((1597,276,1608,287),(1602.2,281.5)),
    }
    out={}
    dx,dy=[(0,0),(0,994.3),(-.24,-.6),(-430.4,710.5)][reference_index]
    with fitz.open(ROOT/'assets/plans/plans.pdf') as doc:
        paths=doc[reference_index].get_drawings()
        for kind,(box,center) in specs.items():
            box=(box[0]+dx,box[1]+dy,box[2]+dx,box[3]+dy)
            center=(center[0]+dx,center[1]+dy)
            runs=[]; current=[]
            for p in paths:
                if fitz.Rect(box).contains(p['rect']) and len(p['items'])==1 and p['items'][0][0]=='l':current.append(p)
                else:
                    if current:runs.append(current)
                    current=[]
            if current:runs.append(current)
            if not runs:continue
            run=max(runs,key=len)
            if kind=='exhaust-fan': run=run[-14:]
            pts=line_points(run).reshape(-1,2)
            origin=pts[0].copy()
            # Include the entire symbol; the longest run ignores separately emitted fills.
            out[kind]=(pts-origin,np.array(center)-origin,pts.min(axis=0)-origin,pts.max(axis=0)-origin)
    return out

def detect(page,clip,zoom,words,reference_index=0):
    paths=page.get_drawings(); lines=line_points(paths)
    fan_fills=[p['rect'] for p in paths if p['type']=='f' and
               6.3<min(p['rect'].width,p['rect'].height)<7.0 and
               8.0<max(p['rect'].width,p['rect'].height)<9.3]
    # Restrict candidate anchors to the electrical viewport.
    starts=np.array([i for i,p in enumerate(paths) if clip[0]<p['rect'].x0<clip[2] and clip[1]<p['rect'].y0<clip[3]])
    result=[]
    for kind,(template,center,lo,hi) in references(reference_index).items():
        n=len(template)//2
        ix=starts[starts+n<=len(lines)]
        windows=lines[ix[:,None]+np.arange(n)].reshape(len(ix),-1,2)
        origin=windows[:,0,:].copy(); local=windows-origin[:,None,:]
        # CAD blocks may be mirrored as well as rotated (notably left-wall sconces).
        for turn in range(8):
            theta=(turn%4)*np.pi/2
            rotation=np.diag([-1 if turn>=4 else 1,1])@np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
            t=template@rotation
            scales=np.sum(local*t,axis=(1,2))/np.sum(t*t)
            errors=np.sqrt(np.mean((local-t*scales[:,None,None])**2,axis=(1,2)))
            for j in np.where((errors<.17)&(scales>.8)&(scales<1.2))[0]:
                scale=scales[j]; x,y=origin[j]+center@rotation*scale
                if any(d['rawClass']==kind and np.hypot(x-d['_pdf'][0],y-d['_pdf'][1])<3 for d in result):continue
                # Smoke/exhaust circle outlines alone require their distinguishing text/fill.
                if kind=='smoke-detector' and not any(w[4] in ('SD','SD/MA') and np.hypot((w[0]+w[2])/2-x,(w[1]+w[3])/2-y)<20 for w in words):continue
                if kind=='light-pendant' and not any(w[4]=='P' and np.hypot((w[0]+w[2])/2-x,(w[1]+w[3])/2-y)<16 for w in words):continue
                if kind=='junction-box' and not any(w[4]=='J' and np.hypot((w[0]+w[2])/2-x,(w[1]+w[3])/2-y)<4 for w in words):continue
                if kind=='exhaust-fan' and not any(np.hypot((r.x0+r.x1)/2-x,(r.y0+r.y1)/2-y)<3 for r in fan_fills):continue
                corners=np.array([[lo[0],lo[1]],[lo[0],hi[1]],[hi[0],lo[1]],[hi[0],hi[1]]])@rotation*scale+origin[j]
                low=corners.min(axis=0);high=corners.max(axis=0)
                canonical='receptacle' if kind=='receptacle-three-prong' else kind
                result.append({'type':refine(canonical,x,y,words),'center':[(x-clip[0])*zoom,(y-clip[1])*zoom],
                  'bbox':[(low[0]-clip[0])*zoom,(low[1]-clip[1])*zoom,(high[0]-clip[0])*zoom,(high[1]-clip[1])*zoom],
                  'source':'vector-legend','confidence':float(1-errors[j]),'rawClass':kind,
                  'geometryErrorPoints':float(errors[j]),'_pdf':(x,y)})
    for d in result:d.pop('_pdf',None)
    return result
