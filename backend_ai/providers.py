"""Real inference providers. Failures are explicit and never replaced with shape guesses."""
import base64
import time
from concurrent.futures import ThreadPoolExecutor
import cv2
import requests

class ProviderError(RuntimeError):
    pass

def checked(response, provider):
    if not response.ok:
        # requests exceptions include API keys embedded in URLs; do not expose those.
        raise ProviderError(f'{provider} returned HTTP {response.status_code}')
    return response.json()

def mepdetect(path, env):
    key = env.get('MEPDETECT_API_KEY')
    if not key: raise ProviderError('MEPdetect credential is not configured')
    host = 'https://api.mepdetect.com'
    headers = {'Authorization': 'Bearer '+key}
    with open(path,'rb') as f:
        job = checked(requests.post(host+'/api/detect',headers=headers,
                      files={'file':('sheet.png',f,'image/png')},
                      data={'confidence':'0.25','model_id':env.get('MEPDETECT_MODEL_ID','0291b928'),
                            'export_formats':'json','save_annotated':'false'},timeout=(15,60)), 'MEPdetect')
    deadline = time.monotonic()+240
    while job['status'] not in ('completed','failed','error'):
        if time.monotonic()>deadline: raise ProviderError('MEPdetect processing exceeded 4 minutes; retry later')
        time.sleep(1)
        job = checked(requests.get(host+'/api/jobs/'+job['job_id'],headers=headers,timeout=(10,30)), 'MEPdetect')
    if job['status'] != 'completed': raise ProviderError('MEPdetect could not process this drawing')
    data = checked(requests.get(host+'/api/jobs/'+job['job_id']+'/download/json',headers=headers,timeout=(10,30)), 'MEPdetect')
    dets = []
    for d in data.get('detections',[]):
        b=d['bbox']
        dets.append({'rawClass':d['class_name'],'confidence':d['confidence'],
                     'bbox':[b['x1'],b['y1'],b['x2'],b['y2']],
                     'center':[b['center_x'],b['center_y']], 'source':'mepdetect'})
    return dets, {'provider':'MEPdetect','model':env.get('MEPDETECT_MODEL_ID','0291b928'),'jobId':job['job_id'],'count':len(dets)}

def roboflow(path, env):
    key,model = env.get('ROBOFLOW_API_KEY'),env.get('ROBOFLOW_MODEL_ID')
    if not key or not model: raise ProviderError('Roboflow model is not configured')
    image=cv2.imread(str(path)); h,w=image.shape[:2]
    size,step=1024,832
    xs=list(range(0,max(1,w-size+1),step)); ys=list(range(0,max(1,h-size+1),step))
    if w>size and xs[-1]!=w-size: xs.append(w-size)
    if h>size and ys[-1]!=h-size: ys.append(h-size)
    def tile(pos):
        x,y=pos
        if x<0: x,y,crop=0,0,image
        else: crop=image[y:y+size,x:x+size]
        encoded=base64.b64encode(cv2.imencode('.png',crop)[1]).decode()
        url='https://serverless.roboflow.com/'+model
        if 'workflows/' in model:
            response=requests.post(url,json={'api_key':key,'inputs':{'image':{'type':'base64','value':encoded}}},timeout=(15,90))
            data=checked(response,'Roboflow')
            data=next((v['predictions'] for v in data.get('outputs',[]) if isinstance(v.get('predictions'),dict)),{})
        else:
            data=checked(requests.post(url,params={'api_key':key,'confidence':25},data=encoded,
                                      headers={'Content-Type':'application/x-www-form-urlencoded'},timeout=(15,90)), 'Roboflow')
        result=[]
        for d in data.get('predictions',[]):
            cx,cy=d['x']+x,d['y']+y; bw,bh=d['width'],d['height']
            result.append({'rawClass':d['class'],'confidence':d['confidence'],'center':[cx,cy],
                           'bbox':[cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2],'source':'roboflow'})
        return result
    with ThreadPoolExecutor(max_workers=3) as pool:
        dets=[d for batch in pool.map(tile,[(-1,-1)]+[(x,y) for y in ys for x in xs]) for d in batch]
    return dets,{'provider':'Roboflow','model':model,'tiles':len(xs)*len(ys),'fullImage':True,'count':len(dets)}

CLASS_MAP={
    'receptacle_duplex':'receptacle','receptacle_quadruplex':'receptacle-quad',
    'receptacle_gfci':'receptacle-gfi','receptacle_special_purpose':'receptacle',
    'receptacle_appliance':'receptacle','receptacle_floor':'receptacle-floor',
    'junction_box':'junction-box','switch_single_pole':'switch','switch_generic':'switch',
    'switch_three_way':'switch-3way','switch_dimmer':'switch-dimmer',
    'light_recessed_downlight':'light-recessed','light_surface_ceiling':'light-surface',
    'light_wall_sconce':'light-wall','light_fixture_generic':'light-generic',
    'ceiling_fan':'ceiling-fan','exhaust_fan':'exhaust-fan','smoke_detector':'smoke-detector',
    'co_detector':'co-detector','occupancy_sensor':'switch-sensor',
    'panelboard':'panelboard','distribution_panel':'panelboard',
}

def canonical(raw):
    if raw in CLASS_MAP: return CLASS_MAP[raw]
    # Custom trained model uses the application's hyphenated taxonomy.
    if '-' in raw: return raw
    return 'other'
