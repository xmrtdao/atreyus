"""Create a portable source handoff without credentials, dependencies or user uploads."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'deliverables'
OUT.mkdir(exist_ok=True)
target=OUT/'atreyus-source.zip'
folders=['src','public','assets','reference_crops','scripts','backend_ai','benchmarks','docs','dogfood-evidence']
skip={'node_modules','.git','__pycache__','uploads','results','dist','deliverables'}
files=[p for p in ROOT.iterdir() if p.is_file() and p.suffix in ('.md','.json','.js','.mjs','.html','.css','.ps1','.toml','.conf')]
files += [ROOT/'.gitignore']
for folder in folders:
    for p in (ROOT/folder).rglob('*'):
        if not p.is_file() or any(s in skip for s in p.relative_to(ROOT).parts):continue
        if p.name.startswith('.env') or p.suffix in ('.pt','.log','.pyc'):continue
        if p.name in ('mock_detections.json','response.json'):continue
        if folder=='dogfood-evidence' and not (p.name.startswith(('analysis-','hybrid-overlay-','ui-upload-sheet-','materials-sheet-','wire-overlay-','audit-')) or p.name in ('ui-verification.json','ui-plan1.png','accuracy-audit.json','extensions-verification.json','sheet-deletion-verification.json','sheet-deletion.png','priced-bom-ui.csv','materials-summary.json','bath2-raw.png')):continue
        files.append(p)
with ZipFile(target,'w',ZIP_DEFLATED) as z:
    for p in sorted(set(files)):
        z.write(p,'atreyus/'+str(p.relative_to(ROOT)))
print(f'Packaged {len(set(files))} source/evidence files; {target.stat().st_size:,} bytes; {target}')
