"""Legend-conditioned template proposals with PDF text subtype refinement.

These are similarity scores, not calibrated AI probabilities. No counts or device
locations are stored: templates come from the actual legend and scan the image.
"""
from functools import lru_cache
import cv2
import numpy as np
import pymupdf as fitz
from plans import ROOT

# Symbol-only rectangles, manually identified from the supplied sheet's legend.
TEMPLATES = {
    'switch': (1459, 117, 1468, 133),
    'light-recessed': (1452, 536, 1468, 552),
    'light-wall': (1452, 442, 1468, 459),
    'light-pendant': (1452, 405, 1468, 420),
    'exhaust-fan': (1452, 355, 1466, 369),
    'ceiling-fan': (1588, 320, 1707, 439),
    'smoke-detector': (1594, 196, 1611, 213),
    'receptacle': (1732, 124, 1745, 141),
    'junction-box': (1597, 276, 1608, 287),
}

@lru_cache(maxsize=1)
def templates():
    with fitz.open(ROOT / 'assets/plans/plans.pdf') as doc:
        page = doc[0]
        out = {}
        for name, rect in TEMPLATES.items():
            pix = page.get_pixmap(matrix=fitz.Matrix(4,4), clip=fitz.Rect(rect), colorspace=fitz.csGRAY)
            out[name] = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width).copy()
        return out

def refine(kind, x, y, words):
    near = []
    for w in words:
        # Distance to text rectangle, not its centre, handles rotated device tags.
        dx = max(w[0]-x, 0, x-w[2]); dy = max(w[1]-y, 0, y-w[3])
        if (dx*dx+dy*dy)**.5 < 13:
            near.append((dx*dx+dy*dy, w[4]))
    tags = [t for _,t in sorted(near)]
    if kind == 'switch':
        mapping = {'3D':'switch-3way-dimmer','3':'switch-3way','D':'switch-dimmer','F':'switch-fan',
                   'VS':'switch-sensor','A':'switch-astro'}
        return next((mapping[t] for t in tags if t in mapping), kind)
    if kind.startswith('receptacle'):
        if 'WP' in tags: return 'receptacle-wp'
        if '240V' in tags: return 'receptacle-240'
        if 'GFI' in tags: return 'receptacle-gfi'
        if 'AFI' in tags: return 'receptacle-afi'
    if kind in ('light-wall', 'light-pendant', 'light-recessed', 'light-generic'):
        if 'EXT' in tags: return 'light-exterior'
        if 'VP' in tags: return 'light-vaporproof'
        if 'P' in tags: return 'light-pendant'
    if kind == 'smoke-detector' and 'SD/MA' in tags: return 'smoke-co-detector'
    if kind == 'exhaust-fan' and 'IAQ' in tags: return 'iaq-fan'
    return kind

def detect(image_path, clip, words):
    gray = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    out = []
    for kind, template in templates().items():
        if kind in ('switch','junction-box','receptacle'): continue
        candidates = []
        for turn in range(8 if kind=='exhaust-fan' else 4):
            if kind=='exhaust-fan':
                th,tw=template.shape
                t=cv2.warpAffine(template,cv2.getRotationMatrix2D((tw/2,th/2),turn*45,1),(tw,th),borderValue=255)
            else:
                t = np.ascontiguousarray(np.rot90(template, turn))
            h,w = t.shape
            res = cv2.matchTemplate(gray, t, cv2.TM_CCOEFF_NORMED)
            peaks = (res == cv2.dilate(res, np.ones((9,9), np.uint8))) & (res >= (0.59 if kind=='switch' else 0.70))
            ys,xs = np.where(peaks)
            candidates.extend((float(res[y,x]),x+w/2,y+h/2,w,h) for x,y in zip(xs,ys))
        kept = []
        for score,x,y,w,h in sorted(candidates, reverse=True):
            if any((x-a[0])**2+(y-a[1])**2 < 24**2 for a in kept): continue
            kept.append((x,y))
            px,py = x/4+clip[0], y/4+clip[1]
            out.append({'type':refine(kind,px,py,words),'center':[x,y],
                        'bbox':[x-w/2,y-h/2,x+w/2,y+h/2], 'confidence':score,
                        'source':'legend','rawClass':kind,'reviewed':False})
    return out
