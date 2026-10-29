"""PDF ingestion and coordinate metadata. All geometry is in original PDF points."""
import hashlib
import re
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PLAN_IDS = ['plan1-studio', 'plan2-2bed', 'plan3-2bed', 'plan4-3bed']
# Reviewed electrical viewport bounds, not detection coordinates. Include every exterior device.
VIEWPORTS = [(900, 130, 1400, 730), (350, 110, 1250, 510),
             (850, 45, 1400, 760), (1030, 65, 1850, 650)]

def fingerprint(page):
    return hashlib.sha256(page.get_text().encode()).hexdigest()

def reference_fingerprints():
    with fitz.open(ROOT / 'assets/plans/plans.pdf') as doc:
        return {fingerprint(p): i for i, p in enumerate(doc)}

def render_page(page, target, clip, zoom=4):
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=fitz.Rect(clip), alpha=False)
    pix.save(target)
    return pix.width, pix.height

def room_labels(page, clip):
    """Extract actual room labels from vector text; boundaries are reviewable approximations."""
    words = page.get_text('words', clip=fitz.Rect(clip))
    names = {'LIVING': 'Living', 'KITCHEN': 'Kitchen', 'DINING': 'Dining', 'BEDROOM': 'Bedroom',
             'BED': 'Bedroom', 'BATH': 'Bath', 'LNDRY': 'Laundry', 'HALL': 'Hall',
             'HALLWAY': 'Hallway', 'CL': 'Closet', 'CLOSET': 'Walk-in closet'}
    labels = []
    for w in words:
        if w[4] not in names:
            continue
        x0, y0, x1, y1 = w[:4]
        name = names[w[4]]
        suffix = next((t[4] for t in words if t[4].isdigit() and 0 <= t[0]-x1 < 10 and abs(t[1]-y0)<2), '')
        if suffix:
            name += ' ' + suffix
        # A single KITCHEN / DINING label is one room; separately labelled rooms stay separate.
        if w[4] == 'KITCHEN' and any(t[4]=='/' and 0<t[0]-x1<12 and abs(t[1]-y0)<2 for t in words):
            name = 'Kitchen / Dining'
        if w[4] == 'DINING' and any(t[4]=='/' and 0<x0-t[2]<12 and abs(t[1]-y0)<2 for t in words):
            continue
        labels.append({'name': name, 'x': (x0+x1)/2, 'y': (y0+y1)/2})
    counts = {}
    for r in labels:
        counts[r['name']] = counts.get(r['name'], 0)+1
        r['id'] = re.sub(r'[^a-z0-9]+', '-', r['name'].lower()) + '-' + str(counts[r['name']])
    return labels
