from pathlib import Path
import pymupdf as fitz
import cv2
ROOT=Path(__file__).resolve().parents[1]
specs=[(1,(750,185,875,240),'p2-kitchen'),(1,(885,225,925,275),'p2-switches'),
       (2,(900,385,1000,440),'p3-kitchen'),(2,(1320,600,1360,650),'p3-east'),
       (3,(1490,350,1610,425),'p4-laundry'),(3,(1350,375,1420,430),'p4-heater'),
       (3,(1760,125,1810,160),'p4-east'),(0,(1290,185,1340,215),'p1-panel'),
       (1,(1080,165,1140,195),'p2-panel'),(2,(1140,80,1190,110),'p3-panel'),
       (3,(1450,90,1500,120),'p4-panel'),(3,(1800,275,1850,325),'p4-exterior-outlet')]
with fitz.open(ROOT/'assets/plans/plans.pdf') as doc:
    for i,box,name in specs:
        target=ROOT/'dogfood-evidence'/f'audit-{name}.png'
        doc[i].get_pixmap(matrix=fitz.Matrix(6,6),clip=fitz.Rect(box)).save(target)
        im=cv2.imread(str(target))
        for x in range((box[0]//10+1)*10,box[2],10):
            px=int((x-box[0])*6);cv2.line(im,(px,0),(px,im.shape[0]),(245,220,255),1);cv2.putText(im,str(x),(px,12),0,.35,(0,0,180),1)
        for y in range((box[1]//10+1)*10,box[3],10):
            py=int((y-box[1])*6);cv2.line(im,(0,py),(im.shape[1],py),(245,220,255),1);cv2.putText(im,str(y),(0,py),0,.35,(0,0,180),1)
        cv2.imwrite(str(target),im)
