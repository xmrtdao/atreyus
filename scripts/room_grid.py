import sys
from pathlib import Path
import cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend_ai'))
from plans import ROOT,VIEWPORTS
for i,clip in enumerate(VIEWPORTS):
    im=cv2.imread(str(ROOT/'dogfood-evidence'/f'complete-{i+1}.png'))
    im=cv2.resize(im,None,fx=.5,fy=.5)
    for x in range((clip[0]//50+1)*50,clip[2],50):
        px=int((x-clip[0])*2); cv2.line(im,(px,0),(px,im.shape[0]),(220,210,255),1)
        cv2.putText(im,str(x),(px,20),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,200),1)
    for y in range((clip[1]//50+1)*50,clip[3],50):
        py=int((y-clip[1])*2);cv2.line(im,(0,py),(im.shape[1],py),(220,210,255),1)
        cv2.putText(im,str(y),(0,py),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,200),1)
    cv2.imwrite(str(ROOT/'dogfood-evidence'/f'room-grid-{i+1}.png'),im)
