import sys
from pathlib import Path
import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend_ai'))
from legend import templates
from plans import ROOT
image=cv2.imread(str(ROOT/'dogfood-evidence/complete-1.png'),0)
for k in ['ceiling-fan','receptacle','switch','light-wall']:
    t=templates()[k]
    scores=[]
    for scale in np.arange(.75,1.51,.05):
        small=cv2.resize(t,None,fx=scale,fy=scale)
        score,where=0,None
        for turn in range(4):
            r=cv2.matchTemplate(image,np.ascontiguousarray(np.rot90(small,turn)),cv2.TM_CCOEFF_NORMED)
            _,s,_,p=cv2.minMaxLoc(r)
            if s>score:score,where=s,p
        scores.append((round(float(scale),2),round(score,3),where))
    print(k,scores,flush=True)
