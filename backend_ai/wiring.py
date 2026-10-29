"""Trace the PDF's plotted dashed control curves, preserving stroke evidence.

CAD exports flatten each dash into short line segments. We join consecutive
segments only across the source's repeated ~6.7-point dash gap, split at devices,
and attach endpoints to nearby glyphs. No switch-to-light proximity graph is
invented. Cable selection and vertical/waste allowances belong to the estimator.
"""
import hashlib
import math

def distance(a,b):return math.dist(a,b)

def simplify(points,tolerance=.3):
    """Editable curve vertices within 0.3 PDF points; raw observed strokes are retained."""
    if len(points)<=2:return points
    a,b=points[0],points[-1];dx=b[0]-a[0];dy=b[1]-a[1];denom=dx*dx+dy*dy
    errors=[]
    for p in points[1:-1]:
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom)) if denom else 0
        errors.append(distance(p,[a[0]+t*dx,a[1]+t*dy]))
    error=max(errors);at=errors.index(error)+1
    if error<=tolerance:return [a,b]
    return simplify(points[:at+1],tolerance)[:-1]+simplify(points[at:],tolerance)

def trace(page,meta,detections):
    clip=meta['clip'];z=meta['zoom'];w=meta['imageWidth'];h=meta['imageHeight']
    eligible=[d for d in detections if d['type'].startswith(('switch','light-')) or d['type'] in ('ceiling-fan','fan-light','exhaust-fan','iaq-fan','receptacle-halfhot')]
    anchors=[(d,[(d['center'][0]/z)+clip[0],(d['center'][1]/z)+clip[1]]) for d in eligible]
    tag_anchors={d['id']:[] for d,p in anchors}
    for word in meta.get('words',page.get_text('words')):
        if word[4] not in ('D','F','A','VS','3','3D'):continue
        p=[(word[0]+word[2])/2,(word[1]+word[3])/2]
        choices=sorted(((distance(p,c),d) for d,c in anchors if d['type'].startswith('switch')),key=lambda v:v[0])
        if choices and choices[0][0]<20:tag_anchors[choices[0][1]['id']].append(word[:4])
    def nearest(point,limit,with_tags=True):
        candidates=[]
        for d,p in anchors:
            actual=distance(point,p);score=actual
            if with_tags:
                for a,b,c,e in tag_anchors[d['id']]:
                    score=min(score,2+math.hypot(max(a-point[0],0,point[0]-c),max(b-point[1],0,point[1]-e)))
            candidates.append((score,actual,d))
        candidates.sort(key=lambda v:v[0])
        return (candidates[0][1],candidates[0][2]) if candidates and candidates[0][0]<=limit and candidates[0][1]<40 else (None,None)
    chunks=[];points=[];strokes=[];gaps=[]
    def finish():
        nonlocal points,strokes,gaps
        if len(points)>2:chunks.append((points,strokes,gaps))
        points=[];strokes=[];gaps=[]
    for index,path in enumerate(page.get_drawings()):
        if len(path['items'])!=1 or path['items'][0][0]!='l' or path.get('color')!=(0.,0.,0.) or abs((path.get('width') or 0)-.24)>.02:
            finish();continue
        _,a,b=path['items'][0];a=[a.x,a.y];b=[b.x,b.y]
        # Zero-length tessellation artifacts occur at several dash boundaries.
        if distance(a,b)<.15:continue
        if not all(clip[0]<=p[0]<=clip[2] and clip[1]<=p[1]<=clip[3] for p in (a,b)) or distance(a,b)>18:
            finish();continue
        if points:
            # Some CAD polylines are emitted with each segment reversed. Extend either end.
            tail=min(distance(points[-1],a),distance(points[-1],b))
            head=min(distance(points[0],a),distance(points[0],b))
            if head<tail:
                points.reverse()
            da,db=distance(points[-1],a),distance(points[-1],b)
            if db<da:a,b=b,a;da=db
            join=da<.35
            if 6.0<da<10.0:
                _,previous_device=nearest(points[-1],12)
                _,next_device=nearest(a,12)
                between_controls=previous_device and next_device and previous_device['id']!=next_device['id'] and previous_device['type'].startswith('switch') and next_device['type'].startswith('switch')
                vx,vy=b[0]-a[0],b[1]-a[1];gx,gy=a[0]-points[-1][0],a[1]-points[-1][1]
                alignment=(vx*gx+vy*gy)/max(.001,math.hypot(vx,vy)*math.hypot(gx,gy))
                if alignment>.55 and not between_controls:
                    join=True;gaps.append([points[-1],a])
            if not join:finish()
            elif da>.35:points.append(a)
        if not points:points=[a]
        points.append(b);strokes.append(index)
        # Separate curves that meet at a drawn luminaire rather than making one enormous run.
        _,at=nearest(b,1.7,False)
        if at and len(points)>3 and distance(points[0],b)>10:finish()
    finish()
    runs=[];seen=set();discarded=0;unattached=[]
    for points,strokes,gaps in chunks:
        start_dist,start=nearest(points[0],22);end_dist,end=nearest(points[-1],22)
        if not start or not end or start['id']==end['id']:
            if gaps:unattached.append({'start':points[0],'end':points[-1],'gaps':len(gaps),'strokes':strokes})
            discarded+=1;continue
        if start['type'].startswith('switch') and end['type'].startswith('switch') and distance(start['center'],end['center'])/z<=14:
            continue  # same-location device strokes / box jumpers are not branch cable runs
        is_service=any(d['type']=='light-service' for d in (start,end)) and any(d['type'].startswith('switch') for d in (start,end))
        # Solid sink/faucet outlines overlap wall-light and switch symbols on these sheets.
        # Do not turn those outlines into cable. Only the explicit switched-outlet and
        # attic-service conventions are accepted without a plotted dash pattern.
        short_control=any(d['type']=='receptacle-halfhot' for d in (start,end)) and any(d['type'].startswith('switch') for d in (start,end)) and min(start_dist,end_dist)<2
        if not gaps and not is_service and not short_control:continue
        length=sum(distance(a,b) for a,b in zip(points,points[1:]))
        if length<8:continue
        signature=tuple(sorted([start['id'],end['id']]))
        if signature in seen:continue
        seen.add(signature)
        observed=[[(x-clip[0])*z/w,(y-clip[1])*z/h] for x,y in points]
        # Retain actual source points separately from the explicit endpoint lead extensions.
        linked_pdf=[[start['center'][0]/z+clip[0],start['center'][1]/z+clip[1]],*points,
                    [end['center'][0]/z+clip[0],end['center'][1]/z+clip[1]]]
        linked=[[(x-clip[0])*z/w,(y-clip[1])*z/h] for x,y in simplify(linked_pdf)]
        run_id='run-'+hashlib.sha256(str(strokes).encode()).hexdigest()[:12]
        runs.append({'id':run_id,'fromId':start['id'],'toId':end['id'],'points':linked,
                     'observedPoints':observed,'source':'pdf-vector','sourceStrokeIndices':strokes,
                     'dashGaps':len(gaps),'observedLengthPdfPoints':length,
                     'endpointLeadPdfPoints':[start_dist,end_dist],
                     'cableType':'auto','included':True,'reviewed':False})
    return runs,{'method':'consecutive plotted strokes / repeated dash gaps / device endpoints',
                  'tracedRuns':len(runs),'unattachedStrokeChains':discarded,
                  'unattachedDashedChains':unattached,
                  'coverage':'Drawn control connections only; no undrawn feeds or receptacle circuits are fabricated.'}
