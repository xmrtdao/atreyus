import sys,json
from pathlib import Path
import cv2
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend_ai'))
from wiring import trace
with fitz.open(ROOT/'assets/plans/plans.pdf') as doc:
    for i,page in enumerate(doc):
        data=json.loads((ROOT/'dogfood-evidence'/f'analysis-{i+1}.json').read_text(encoding='utf-8'))
        runs,info=trace(page,data,data['detections'])
        image=cv2.imread(str(ROOT/'backend_ai/results/v3'/f"{data['planId']}.png"))
        colors=[(255,0,0),(0,150,0),(0,0,255),(200,0,200)]
        for n,r in enumerate(runs):
            pts=[(round(x*data['imageWidth']),round(y*data['imageHeight'])) for x,y in r['points']]
            for a,b in zip(pts,pts[1:]):cv2.line(image,a,b,colors[n%4],2)
            x,y=pts[len(pts)//2];cv2.putText(image,str(n+1),(x,y),0,.8,(0,0,255),2)
        cv2.imwrite(str(ROOT/'dogfood-evidence'/f'wire-overlay-{i+1}.png'),image)
        (ROOT/'dogfood-evidence'/f'wire-traces-{i+1}.json').write_text(json.dumps({'runs':runs,'info':info},indent=2),encoding='utf-8')
        by_id={d['id']:d['type'] for d in data['detections']}
        print(i+1,len(runs),[(by_id[r['fromId']],by_id[r['toId']],round(r['observedLengthPdfPoints']/18,1)) for r in runs],flush=True)
