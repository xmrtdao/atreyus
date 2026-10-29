"""Inspect provider availability without logging credentials or credential-bearing URLs."""
import base64
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
env = {}
for line in (ROOT.parent / 'relay/.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
out = ROOT / 'dogfood-evidence'
out.mkdir(exist_ok=True)
headers = {'Authorization': 'Bearer ' + env['MEPDETECT_API_KEY']}
r = requests.get('https://api.mepdetect.com/api/models', headers=headers, timeout=30)
print('MEP models', r.status_code, r.text[:12000])
with (ROOT / 'public/plans/plan2-2bed.png').open('rb') as f:
    r = requests.post('https://api.mepdetect.com/api/detect', headers=headers,
                      files={'file': ('plan2.png', f, 'image/png')},
                      data={'confidence': '0.2', 'export_formats': 'json', 'save_annotated': 'true'}, timeout=60)
print('MEP submit', r.status_code, r.text[:3000])
if r.ok:
    (out / 'mep-job.json').write_text(r.text, encoding='utf-8')
model = env['ROBOFLOW_MODEL_ID']
print('Roboflow route kind:', 'workflow' if 'workflows' in model else 'model')
image = base64.b64encode((ROOT / 'public/plans/plan2-2bed.png').read_bytes()).decode()
try:
    if 'workflows' in model:
        r = requests.post('https://serverless.roboflow.com/' + model,
                          json={'api_key': env['ROBOFLOW_API_KEY'], 'inputs': {'image': {'type': 'base64', 'value': image}}}, timeout=150)
    else:
        r = requests.post('https://serverless.roboflow.com/' + model,
                          params={'api_key': env['ROBOFLOW_API_KEY']}, data=image,
                          headers={'Content-Type': 'application/x-www-form-urlencoded'}, timeout=150)
    print('Roboflow status', r.status_code)
    if r.ok:
        (out / 'roboflow-probe.json').write_text(r.text, encoding='utf-8')
        print('Roboflow response keys', list(r.json()))
    else:
        print('Roboflow error', r.text[:1000].replace(env['ROBOFLOW_API_KEY'], '[redacted]'))
except requests.RequestException as e:
    print('Roboflow transport error', type(e).__name__)
