"""Run current pipeline code against real cached provider responses for development."""
import sys,json,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend_ai'))
import main
for i,plan in enumerate(main.PLAN_IDS):
    jid=uuid.uuid4().hex
    main.JOBS[jid]={'id':jid,'kind':'development-analysis','status':'working'}
    result=main.analyze(jid,plan,'hybrid',False)
    (ROOT/'dogfood-evidence'/f'analysis-{i+1}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(plan,len(result['detections']),result['build'],flush=True)
