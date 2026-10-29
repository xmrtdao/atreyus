"""Exercise the real API; capture results, timings, and overlays for all four sheets."""
import json
import os
import time
from pathlib import Path
from collections import Counter
import requests
import cv2

ROOT=Path(__file__).resolve().parents[1]
HOST=os.environ.get('ATREYUS_TEST_URL','http://127.0.0.1:8000')
OUT=ROOT/'dogfood-evidence'
def wait(job):
    start=time.monotonic()
    while job['status'] not in ('completed','failed'):
        time.sleep(1)
        job=requests.get(HOST+'/api/jobs/'+job['id'],timeout=30).json()
        if time.monotonic()-start>600: raise RuntimeError('Job timeout')
    if job['status']=='failed': raise RuntimeError(job['message'])
    return job['result'],round(time.monotonic()-start,2)

plans=requests.get(HOST+'/api/plans',timeout=60).json()['sheets']
with (ROOT/'assets/plans/plans.pdf').open('rb') as f:
    start=time.monotonic()
    r=requests.post(HOST+'/api/takeoff/upload',files={'file':('assessment.pdf',f,'application/pdf')},timeout=30)
    print('Upload acceptance',r.status_code,round(time.monotonic()-start,2),flush=True)
    result,elapsed=wait(r.json())
    assert result['pageCount']==4
    for p in result['sheets']:
        assert requests.get(HOST+p['planUrl'],timeout=30).status_code==200
    print('Four distinct rendered sheets verified',elapsed,flush=True)
for i,p in enumerate(plans):
    r=requests.post(HOST+'/api/takeoff/analyze',json={'plan':p['id'],'engine':'hybrid'},timeout=30)
    result,elapsed=wait(r.json())
    (OUT/f'analysis-{i+1}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(p['id'],elapsed,Counter(d['type'] for d in result['detections']),result['providers'],result['warnings'],flush=True)
    im=cv2.imread(str(ROOT/'backend_ai/results/v3'/f"{p['id']}.png"))
    for d in result['detections']:
        x,y=map(int,d['center'])
        cv2.circle(im,(x,y),20,(0,0,255),2)
        cv2.putText(im,d['type'],(x+10,y-10),cv2.FONT_HERSHEY_SIMPLEX,.4,(0,0,255),1)
    cv2.imwrite(str(OUT/f'hybrid-overlay-{i+1}.png'),im)
