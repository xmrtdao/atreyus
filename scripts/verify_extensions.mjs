import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1800,height:1100},acceptDownloads:true});
const page=await context.newPage(),errors=[],report=[];
page.on('pageerror',e=>errors.push(e.message));
const storage=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('atreyus-takeoffs-v3')||'{}'));
const total=async()=>Number((await page.getByTestId('material-total').innerText()).replace(/[^0-9.]/g,''));
async function exported(name){
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const d=await pending,path=root+`dogfood-evidence/${name}.json`;await d.saveAs(path);return JSON.parse(await readFile(path,'utf8'));
}
try{
  await page.goto('https://atreyus.mobilemonero.com/',{waitUntil:'networkidle'});
  const ids=['plan1-studio','plan2-2bed','plan3-2bed','plan4-3bed'];
  const expectedSymbols=[56,67,83,98],expectedBoxes=[39,46,56,65];
  for(let i=0;i<4;i++){
    await page.getByRole('button',{name:new RegExp(`^Plan ${i+1} ·`)}).click();
    await page.getByRole('button',{name:'Run detection',exact:true}).click();
    await page.getByRole('status').filter({hasText:/candidates/}).waitFor({timeout:180000});
    const s=(await storage())[ids[i]];
    assert.equal(s.detections.length,expectedSymbols[i]);assert(s.runs.length>0);
    await page.getByLabel('Show gang boxes').check();await page.getByLabel('Show cable runs').check();
    assert.equal(await page.locator('rect[data-box]').count(),expectedBoxes[i]);
    assert.equal(await page.locator('[data-run-visible]').count(),s.runs.length);
    await page.getByRole('button',{name:'Priced materials',exact:true}).click();
    assert(await total()>0);
    const e=await exported(`materials-sheet-${i+1}`),m=e.materialEstimate;
    assert.equal(m.unpriced,0);assert.equal(m.unresolvedRuns,0);
    const drawnIds=new Set([...e.detections.map(d=>d.id),...m.boxes.map(b=>b.id),...m.runs.map(r=>r.id)]);
    assert(m.rows.every(r=>r.sourceIds.length && r.sourceIds.every(id=>drawnIds.has(id))));
    assert(m.runs.every(r=>r.sourceStrokeIndices.length && r.billableFeet>0));
    report.push({sheet:i+1,symbols:e.detections.length,boxLocations:m.boxes.length,tracedRuns:m.runs.length,materialAllowanceUSD:m.total,unpriced:m.unpriced});
    await page.screenshot({path:root+`dogfood-evidence/materials-sheet-${i+1}.png`});
    if(i===0){
      const initial=await total();
      await page.getByLabel('Unit price: Switch (SP)',{exact:true}).fill('10');
      assert(Math.abs((await total())-initial-14)<.011);
      await page.getByLabel('Unit price: Switch (SP)',{exact:true}).fill('3');
      await page.getByLabel('Include optional ceiling-fan supply').check();
      assert(Math.abs((await total())-initial-125)<.011);
      await page.getByLabel('Include optional ceiling-fan supply').uncheck();
      const csvWait=page.waitForEvent('download');await page.getByRole('button',{name:'Export priced BOM CSV'}).click();
      const csv=await csvWait;await csv.saveAs(root+'dogfood-evidence/priced-bom-ui.csv');
      assert((await readFile(root+'dogfood-evidence/priced-bom-ui.csv','utf8')).includes('Routing assumptions'));
      await page.getByRole('button',{name:'Close materials',exact:true}).click();

      // Box size and device relocation through the real drawing.
      await page.locator('text[data-box]').filter({hasText:'3-gang'}).first().click();
      await page.getByLabel('Box gang size').selectOption('4');assert.equal(await page.locator('text[data-box]').filter({hasText:'4-gang'}).count(),1);
      await page.getByLabel('Box gang size').selectOption('3');await page.getByRole('button',{name:'Close box detail'}).click();
      await page.locator('text[data-box]').filter({hasText:'2-gang'}).first().click();
      await page.locator('section').filter({has:page.getByLabel('Box gang size')}).getByRole('list').getByRole('button').first().click();
      const mark=page.locator('[data-marker][aria-pressed="true"]'),box=await mark.boundingBox(),img=await page.getByRole('img',{name:'Electrical plan'}).boundingBox();
      await page.getByRole('button',{name:'×',exact:true}).click();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(img.x+img.width*.55,img.y+img.height*.78,{steps:8});await page.mouse.up();
      assert.equal(await page.locator('rect[data-box]').count(),40);
      await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.locator('rect[data-box]').count(),39);

      // Route type, geometric edit, creation, deletion and undo.
      await page.locator('text[data-run]').first().click();
      await page.getByLabel('Run cable type').selectOption('12/3 NM-B');
      assert((await storage())[ids[0]].runs.some(r=>r.cableType==='12/3 NM-B'));
      await page.getByRole('button',{name:'Close cable detail'}).click();
      await page.getByRole('button',{name:'Trace cable',exact:true}).click();
      const im=await page.getByRole('img',{name:'Electrical plan'}).boundingBox();
      await page.mouse.click(im.x+im.width*.15,im.y+im.height*.82);await page.mouse.click(im.x+im.width*.42,im.y+im.height*.9);
      await page.getByRole('button',{name:'Finish cable',exact:true}).click();
      const fresh=(await storage())[ids[0]].runs.find(r=>r.source==='user');assert(fresh);
      const handle=page.locator(`[data-run-id="${fresh.id}"][data-run-vertex="1"]`),hb=await handle.boundingBox();
      await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+45,hb.y-35,{steps:5});await page.mouse.up();
      assert.equal((await storage())[ids[0]].runs.find(r=>r.id===fresh.id).source,'user-edited');
      await page.getByRole('button',{name:'Delete cable run',exact:true}).click();assert.equal((await storage())[ids[0]].runs.length,s.runs.length);
      await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await storage())[ids[0]].runs.length,s.runs.length+1);
      await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:/^Plan 1 ·/}).click();
      assert.equal((await storage())[ids[0]].runs.length,s.runs.length+1);
      report.push({step:'Price edits, optional supply, priced CSV, gang edit, switch relocation, cable CRUD/undo/reload',passed:true});
    }else await page.getByRole('button',{name:'Close materials',exact:true}).click();
  }
  assert.deepEqual(errors,[]);report.push({uncaughtBrowserErrors:errors.length});
  await writeFile(root+'dogfood-evidence/extensions-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await page.screenshot({path:root+'dogfood-evidence/extensions-failure.png'});console.error(e);process.exitCode=1;}
finally{await browser.close();}
