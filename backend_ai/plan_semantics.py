"""Drawing-derived keyed equipment and physical switch locations."""
import math
import re

def panelboards(page,clip,zoom):
    words=page.get_text('words',clip=clip)
    tags=[w for w in words if w[4]=='B32']
    lines=[p['items'][0][1:] for p in page.get_drawings() if len(p['items'])==1 and p['items'][0][0]=='l']
    out=[]
    general_note=re.search(r'ELECTRICAL SUB PANEL:.*?(\d+)\s+AMP',page.get_text(),re.S)
    for a,b in lines:
        x0,x1=sorted([a.x,b.x]);y0,y1=sorted([a.y,b.y])
        if not (18<x1-x0<45 and 2<y1-y0<8):continue
        x,y=(x0+x1)/2,(y0+y1)/2
        if not (clip[0]<x<clip[2] and clip[1]<y<clip[3]):continue
        tag=next((w for w in tags if abs((w[0]+w[2])/2-x)<35 and 0<y-w[3]<130),None)
        if not tag:continue
        # Require the thin panel rectangle, not merely a leader or sloping line.
        def edge(p,q):
            return any((math.dist(tuple(c),p)<.3 and math.dist(tuple(d),q)<.3) or
                       (math.dist(tuple(d),p)<.3 and math.dist(tuple(c),q)<.3) for c,d in lines)
        if not all(edge(p,q) for p,q in [((x0,y0),(x1,y0)),((x1,y0),(x1,y1)),((x1,y1),(x0,y1)),((x0,y1),(x0,y0))]):continue
        if any(math.dist([x,y],d['_pdf'])<3 for d in out):continue
        out.append({'type':'panelboard','rawClass':'B32 electrical panel','source':'pdf-keynote',
                    'confidence':1,'center':[(x-clip[0])*zoom,(y-clip[1])*zoom],
                    'bbox':[(x0-clip[0])*zoom,(y0-clip[1])*zoom,(x1-clip[0])*zoom,(y1-clip[1])*zoom],
                    'classificationNote':f'B32 identifies this panel. Electrical note 5 specifies a {general_note.group(1)} A subpanel; B32 also references cover-sheet options. Confirm the selected assembly.' if general_note else 'B32 identifies this panel; confirm its rating from the electrical notes and cover sheet.',
                    '_pdf':[x,y]})
    for d in out:d.pop('_pdf')
    return out

def switch_banks(detections,zoom):
    switches=[d for d in detections if d['type'].startswith('switch')]
    groups=[];seen=set()
    for d in switches:
        if id(d) in seen:continue
        group=[d];seen.add(id(d))
        for current in group:
            for other in switches:
                if id(other) in seen:continue
                dx=abs(current['center'][0]-other['center'][0])/zoom
                dy=abs(current['center'][1]-other['center'][1])/zoom
                if math.hypot(dx,dy)<=14 and min(dx,dy)<=2:
                    group.append(other);seen.add(id(other))
        groups.append(group)
    return groups
