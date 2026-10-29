import {readFile,writeFile} from 'node:fs/promises';
import {computeMaterials} from '../src/takeoff/materials.mjs';
const summaries=[];
for(let i=1;i<=4;i++){
  const data=JSON.parse(await readFile(new URL(`../dogfood-evidence/analysis-${i}.json`,import.meta.url),'utf8'));
  const sheet={...data,detections:data.detections.map(d=>({...d,x:d.center[0]/data.imageWidth,y:d.center[1]/data.imageHeight}))};
  const m=computeMaterials(sheet);
  const summary={sheet:i,devices:sheet.detections.length,boxes:m.boxes.length,runs:m.runs.length,total:m.total,
    gangs:m.boxes.filter(b=>b.members.every(d=>d.type.startsWith('switch'))).map(b=>({gangs:b.gangs,members:b.members.map(d=>[d.type,Math.round(d.center[0]/data.zoom+data.clip[0]),Math.round(d.center[1]/data.zoom+data.clip[1])])})),
    cable:m.rows.filter(r=>r.category==='cable'),unpriced:m.unpriced,unresolvedRuns:m.unresolvedRuns};
  summaries.push(summary);console.log(JSON.stringify(summary));
}
await writeFile(new URL('../dogfood-evidence/materials-summary.json',import.meta.url),JSON.stringify(summaries,null,2));
