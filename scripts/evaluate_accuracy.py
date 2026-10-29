"""One-to-one spatial/type/room comparison to visually annotated SOURCE symbols."""
import json
import hashlib
import sys
from collections import Counter
from pathlib import Path
import math
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'benchmarks'))
from annotations import annotations

def evaluate(data,index):
    refs=annotations(index); clip=data['clip']; zoom=data['zoom']
    rooms={r['id']:r['name'] for r in data['rooms']}
    predictions=[{**d,'pdf':[(d['center'][0]/zoom)+clip[0],(d['center'][1]/zoom)+clip[1]],'room':rooms.get(d.get('roomId'),d.get('roomId'))} for d in data['detections']]
    edges=sorted((math.dist(r['center'],p['pdf']),i,j) for i,r in enumerate(refs) for j,p in enumerate(predictions))
    pairs=[];used_r=set();used_p=set()
    for distance,i,j in edges:
        if distance>6:break
        if i not in used_r and j not in used_p:
            pairs.append((i,j,distance));used_r.add(i);used_p.add(j)
    missed=[refs[i] for i in range(len(refs)) if i not in used_r]
    extra=[{'type':p['type'],'center':p['pdf'],'source':p['source']} for j,p in enumerate(predictions) if j not in used_p]
    wrong=[{'reference':refs[i],'prediction':predictions[j]['type'],'position':predictions[j]['pdf']} for i,j,d in pairs if refs[i]['type']!=predictions[j]['type']]
    wrong_rooms=[{'type':refs[i]['type'],'center':refs[i]['center'],'expected':refs[i]['room'],'actual':predictions[j]['room']} for i,j,d in pairs if refs[i]['room']!=predictions[j]['room']]
    classes=sorted(set(r['type'] for r in refs)|set(p['type'] for p in predictions))
    per_class={t:{'reference':sum(r['type']==t for r in refs),'predicted':sum(p['type']==t for p in predictions),
                  'correct':sum(refs[i]['type']==t and predictions[j]['type']==t for i,j,d in pairs)} for t in classes}
    for counts in per_class.values():
        counts['precision']=counts['correct']/counts['predicted'] if counts['predicted'] else None
        counts['recall']=counts['correct']/counts['reference'] if counts['reference'] else None
    return {'sheet':index+1,'pipelineBuild':data.get('build'),'pipelineVersion':data.get('pipelineVersion'),
            'auditKind':'agent-assisted visual source audit / in-sample',
            'sourcePdfSha256':hashlib.sha256((ROOT/'assets/plans/plans.pdf').read_bytes()).hexdigest(),
            'annotationSha256':hashlib.sha256((ROOT/'benchmarks/annotations.py').read_bytes()).hexdigest(),
            'referenceCount':len(refs),'predictionCount':len(predictions),'matched':len(pairs),
            'typeCorrect':len(pairs)-len(wrong),'roomCorrect':len(pairs)-len(wrong_rooms),
            'missed':missed,'extra':extra,'wrongType':wrong,'wrongRoom':wrong_rooms,'perClass':per_class,
            'maxMatchedErrorPdfPoints':max((d for _,_,d in pairs),default=0),'tolerancePdfPoints':6}

if __name__=='__main__':
    report=[]
    for i in range(4):
        data=json.loads((ROOT/'dogfood-evidence'/f'analysis-{i+1}.json').read_text(encoding='utf-8'))
        r=evaluate(data,i);report.append(r)
        print('SHEET',i+1,'reference',r['referenceCount'],'predicted',r['predictionCount'],'matched',r['matched'])
        for key in ('missed','extra','wrongType','wrongRoom'): print(key,json.dumps(r[key]))
    target=ROOT/'dogfood-evidence/accuracy-audit.json'
    target.write_text(json.dumps(report,indent=2),encoding='utf-8')
    passed=all(not any(r[key] for key in ('missed','extra','wrongType','wrongRoom')) for r in report)
    print('SOURCE AUDIT GATE:', 'PASS' if passed else 'FAIL')
    if not passed:sys.exit(1)
