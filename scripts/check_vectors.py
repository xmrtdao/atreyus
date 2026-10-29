import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend_ai'))
from plans import ROOT,VIEWPORTS
from vector_symbols import detect,switch_reference
from collections import Counter
import pymupdf as fitz
print('reference',switch_reference().shape)
with fitz.open(ROOT/'assets/plans/plans.pdf') as doc:
    for i,p in enumerate(doc):
        dets=detect(p,VIEWPORTS[i],4,p.get_text('words'),i)
        print(i+1,len(dets),Counter(d['type'] for d in dets))
