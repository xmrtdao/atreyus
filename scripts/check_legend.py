import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend_ai'))
import pymupdf as fitz
import cv2
from collections import Counter
from plans import ROOT, VIEWPORTS, PLAN_IDS, render_page
from legend import detect
with fitz.open(ROOT/'assets/plans/plans.pdf') as doc:
    for i,page in enumerate(doc):
        path=ROOT/'dogfood-evidence'/f'complete-{i+1}.png'
        render_page(page,path,VIEWPORTS[i])
        dets=detect(path,VIEWPORTS[i],page.get_text('words'))
        print(i+1,Counter(d['type'] for d in dets))
        im=cv2.imread(str(path))
        for d in dets:
            x,y=map(int,d['center'])
            cv2.circle(im,(x,y),22,(0,0,255),2)
            cv2.putText(im,d['type'],(x+10,y-10),cv2.FONT_HERSHEY_SIMPLEX,.4,(0,0,255),1)
        cv2.imwrite(str(ROOT/'dogfood-evidence'/f'legend-overlay-{i+1}.png'),im)
