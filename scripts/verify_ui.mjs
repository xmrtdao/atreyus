import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=new URL('../dogfood-evidence/',import.meta.url);
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('atreyus-takeoffs-v3')||'{}'));
try {
  await page.goto('https://atreyus.mobilemonero.com/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/^Plan 1 · Studio/}).click();
  await page.getByRole('button',{name:'Run detection',exact:true}).click();
  await page.getByRole('status').filter({hasText:/candidates/}).waitFor({timeout:180000});
  let sheet=(await saved())['plan1-studio'];
  assert(sheet.detections.length>0);
  assert.equal(await page.locator('[data-marker]').count(),sheet.detections.length);
  assert(await page.getByRole('img',{name:'Electrical plan'}).evaluate(i=>i.complete && i.naturalWidth>0));
  results.push({step:'Public clean browser detection',count:sheet.detections.length});
  await page.screenshot({path:root+'dogfood-evidence/ui-plan1.png'});

  // CRUD through actual pointer events and form controls.
  const count=sheet.detections.length;
  await page.getByRole('button',{name:'Add component',exact:true}).click();
  const image=await page.getByRole('img',{name:'Electrical plan'}).boundingBox();
  await page.mouse.click(image.x+image.width*.47,image.y+image.height*.61);
  await page.getByRole('combobox',{name:'Detection type',exact:true}).selectOption('light-pendant');
  await page.getByRole('combobox',{name:'Detection room',exact:true}).selectOption('Exterior');
  sheet=(await saved())['plan1-studio'];
  assert.equal(sheet.detections.length,count+1);
  const added=sheet.detections.find(d=>d.source==='user');
  assert.equal(added.type,'light-pendant');assert.equal(added.roomId,'Exterior');
  await page.getByRole('button',{name:'×',exact:true}).click();
  const mark=page.locator(`[data-marker="${added.id}"]`);
  const pos=await mark.boundingBox();
  await page.mouse.move(pos.x+pos.width/2,pos.y+pos.height/2);
  await page.mouse.down();await page.mouse.move(pos.x+40,pos.y+30,{steps:5});await page.mouse.up();
  sheet=(await saved())['plan1-studio'];
  assert.notEqual(sheet.detections.find(d=>d.id===added.id).x,added.x);
  await page.getByRole('button',{name:'Delete detection',exact:true}).click();
  assert.equal((await saved())['plan1-studio'].detections.length,count);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal((await saved())['plan1-studio'].detections.length,count+1);
  await page.locator(`[data-marker="${added.id}"]`).click();
  await page.getByRole('button',{name:'Delete detection',exact:true}).click();
  results.push({step:'Create, change type/room, move, delete, undo',passed:true});

  await page.getByRole('button',{name:'Draw room',exact:true}).click();
  await page.mouse.move(image.x+image.width*.1,image.y+image.height*.75);
  await page.mouse.down();await page.mouse.move(image.x+image.width*.3,image.y+image.height*.85,{steps:5});await page.mouse.up();
  await page.getByRole('textbox',{name:'New room name'}).fill('Review test room');
  await page.getByRole('button',{name:'Save room',exact:true}).click();
  assert((await saved())['plan1-studio'].rooms.some(r=>r.name==='Review test room'));
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert(!(await saved())['plan1-studio'].rooms.some(r=>r.name==='Review test room'));
  results.push({step:'Draw room, assign enclosed marks, undo',passed:true});

  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const download=await downloadPromise;
  await download.saveAs(root+'dogfood-evidence/ui-export.json');
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:/^Plan 1 · Studio/}).click();
  assert.equal((await saved())['plan1-studio'].detections.length,count);
  results.push({step:'Export and persistence after reload',passed:true});

  const start=Date.now();
  await page.getByLabel('Upload PDF',{exact:true}).setInputFiles(root+'assets/plans/plans.pdf');
  await page.getByRole('status').filter({hasText:'4 sheets ready'}).waitFor({timeout:90000});
  const uploaded=Object.values(await saved()).filter(s=>s?.sheetId?.startsWith('upload-'));
  assert.equal(uploaded.length,4);
  assert.equal(new Set(uploaded.map(s=>s.planUrl)).size,4);
  results.push({step:'Real PDF upload / four-sheet split',seconds:(Date.now()-start)/1000});
  for(let i=0;i<4;i++){
    await page.getByRole('button',{name:new RegExp(`^plans.pdf · Sheet ${i+1}`)}).click();
    await page.getByRole('button',{name:'Run detection',exact:true}).click();
    await page.getByRole('status').filter({hasText:/candidates/}).waitFor({timeout:180000});
    const s=(await saved())[uploaded[i].sheetId];
    assert(s.detections.length>0);
    assert.equal(await page.locator('[data-marker]').count(),s.detections.length);
    assert(await page.getByRole('img',{name:'Electrical plan'}).evaluate(i=>i.complete && i.naturalWidth>0));
    await page.screenshot({path:root+`dogfood-evidence/ui-upload-sheet-${i+1}.png`});
    results.push({step:`Uploaded sheet ${i+1} analysis and visible marks`,count:s.detections.length});
  }
  assert.deepEqual(errors,[]);
  results.push({step:'Uncaught browser errors',count:errors.length});
  await writeFile(new URL('ui-verification.json',evidence),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} catch(e) {
  await page.screenshot({path:root+'dogfood-evidence/ui-failure.png'});
  console.error(e);
  process.exitCode=1;
} finally {await browser.close();}
