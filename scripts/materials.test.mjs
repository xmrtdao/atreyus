import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMaterials, deriveBoxes, deriveRuns } from '../src/takeoff/materials.mjs';

const base=()=>({referenceIndex:0,imageWidth:720,imageHeight:720,zoom:4,detections:[],runs:[]});
const device=(id,type,x,y)=>({id,type,x,y});
const row=(m,key)=>m.rows.find(r=>r.priceKey===key);

test('two adjacent switches share a 2-gang box and plate; moving one splits the location',()=>{
  const s=base();s.detections=[device('a','switch',.1,.1),device('b','switch-dimmer',.15,.1)];
  let m=computeMaterials(s);assert.equal(m.boxes.length,1);assert.equal(m.boxes[0].gangs,2);
  assert.equal(row(m,'box-2').quantity,1);assert.equal(row(m,'plate-2').quantity,1);
  s.detections[1].x=.4;m=computeMaterials(s);
  assert.equal(m.boxes.length,2);assert.equal(row(m,'box-1').quantity,2);assert.equal(row(m,'plate-1').quantity,2);
});

test('optional fan supply is excluded but its fan-rated prewire box remains',()=>{
  const s=base();s.detections=[device('fan','ceiling-fan',.5,.5)];
  const m=computeMaterials(s);assert.equal(row(m,'ceiling-fan').quantity,0);assert.equal(row(m,'box-fan').quantity,1);
  s.estimateSettings={includeOptionalFans:true};assert.equal(computeMaterials(s).total-m.total,125);
});

test('vacancy-sensor lettering spacing does not split a three-device bathroom bank',()=>{
  const s=base();s.detections=[device('d','switch-dimmer',.5,.2),device('vs','switch-sensor',.5,.2+13/180),device('f','switch-fan',.5,.2+24/180)];
  const boxes=deriveBoxes(s);assert.equal(boxes.length,1);assert.equal(boxes[0].gangs,3);
});

test('traced path between 3-way controls receives traveler cable, including through a fixture',()=>{
  const s=base();s.detections=[device('a','switch-3way',.1,.1),device('light','light-recessed',.35,.1),device('b','switch-3way-dimmer',.6,.1)];
  s.runs=[{id:'r1',fromId:'a',toId:'light',points:[[.1,.1],[.35,.1]],cableType:'auto'},
          {id:'r2',fromId:'light',toId:'b',points:[[.35,.1],[.6,.1]],cableType:'auto'}];
  const runs=deriveRuns(s);assert(runs.every(r=>r.resolvedCable==='14/3 NM-B'));
  assert(Math.abs(runs[0].horizontalFt-2.5)<1e-9);assert.equal(runs[0].riseFt,4);assert.equal(runs[0].billableFeet,8);
  s.runs[0].cableType='12/2 NM-B';assert.equal(deriveRuns(s)[0].resolvedCable,'12/2 NM-B');
});

test('an explicit 3-4-5 route measures correctly and an edited bend changes its length',()=>{
  const s=base();s.estimateSettings={wastePercent:0,switchRiseFt:0};
  s.runs=[{id:'r',points:[[0,0],[.3,.4]],included:true}];
  assert.equal(deriveRuns(s)[0].horizontalFt,5);
  s.runs[0].points=[[0,0],[.3,0],[.3,.4]];assert.equal(deriveRuns(s)[0].horizontalFt,7);
});

test('moving a linked device changes cable length; orphaned runs are excluded',()=>{
  const s=base();s.detections=[device('a','switch',.1,.1),device('b','light-wall',.4,.1)];
  s.runs=[{id:'r',fromId:'a',toId:'b',points:[[.1,.1],[.4,.1]]}];
  const before=deriveRuns(s)[0].horizontalFt;s.detections[1].x=.8;
  assert(deriveRuns(s)[0].horizontalFt>before);
  s.detections.pop();const m=computeMaterials(s);assert.equal(m.unresolvedRuns,1);assert(!m.rows.some(r=>r.category==='cable'));
});

test('unknown scale does not manufacture a cable quantity or price',()=>{
  const s=base();s.referenceIndex=null;s.runs=[{id:'r',points:[[0,0],[.5,0]]}];
  let m=computeMaterials(s);assert.equal(m.unresolvedRuns,1);assert.equal(m.rows.length,0);
  s.estimateSettings={pointsPerFoot:18};m=computeMaterials(s);assert.equal(m.unresolvedRuns,0);assert.equal(row(m,'14/2 NM-B').quantity,6);
});

test('weatherproof cover, spare gang override and explicit separation are priced once',()=>{
  const s=base();s.detections=[device('wp','receptacle-wp',.1,.1),device('a','switch',.5,.5),device('b','switch',.55,.5)];
  const box=deriveBoxes(s).find(b=>b.members.length===2);s.boxOverrides={[box.id]:{gangs:3}};
  let m=computeMaterials(s);assert.equal(row(m,'cover-weatherproof').quantity,1);assert.equal(row(m,'plate-3').quantity,1);
  s.detections[2].separateBox=true;m=computeMaterials(s);assert.equal(row(m,'plate-1').quantity,2);
});

test('all priced rows trace to actual devices, box locations or runs; missing prices stay explicit',()=>{
  const s=base();s.detections=[device('a','switch',.1,.1),device('custom','custom:Special device',.5,.5)];
  let m=computeMaterials(s);const ids=new Set([...s.detections.map(d=>d.id),...m.boxes.map(b=>b.id),...m.runs.map(r=>r.id)]);
  assert(m.rows.every(r=>r.sourceIds.length && r.sourceIds.every(id=>ids.has(id))));assert.equal(m.unpriced,1);
  s.priceOverrides={'custom:Special device':12.5};m=computeMaterials(s);assert.equal(m.unpriced,0);assert.equal(row(m,'custom:Special device').total,12.5);
});

test('non-lighting controls use the sheet-note 12 AWG allowance',()=>{
  const s=base();s.detections=[device('s','switch',.1,.1),device('r','receptacle-halfhot',.3,.1)];
  s.runs=[{id:'wire',fromId:'s',toId:'r',points:[[.1,.1],[.3,.1]],cableType:'auto'}];
  assert.equal(deriveRuns(s)[0].resolvedCable,'12/2 NM-B');
  s.detections[1].type='light-wall';assert.equal(deriveRuns(s)[0].resolvedCable,'14/2 NM-B');
});
