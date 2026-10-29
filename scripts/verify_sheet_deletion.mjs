import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await context.newPage(),errors=[],report=[];
page.on('pageerror',e=>errors.push(e.message));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('atreyus-takeoffs-v3')||'{}'));
const uploaded=data=>Object.values(data).filter(s=>s?.sheetId?.startsWith('upload-'));
const row=id=>page.locator(`[data-sheet-row="${id}"]`);
async function upload(){
  await page.getByLabel('Upload PDF',{exact:true}).setInputFiles(root+'assets/plans/plans.pdf');
  await page.getByRole('status').filter({hasText:'4 sheets ready'}).waitFor({timeout:90000});
}
async function remove(id,accept=true){
  page.once('dialog',d=>accept?d.accept():d.dismiss());
  await row(id).getByRole('button',{name:/^Delete sheet:/}).click();
}
try{
  await page.goto('https://atreyus.mobilemonero.com/',{waitUntil:'networkidle'});
  await upload();const old=uploaded(await saved()).map(s=>s.sheetId);
  await row(old[0]).locator('[data-sheet-open]').click();
  await page.getByRole('button',{name:'Run detection',exact:true}).click();
  assert(await row(old[0]).getByRole('button',{name:/^Delete sheet:/}).isDisabled());
  await page.getByRole('status').filter({hasText:/candidates/}).waitFor({timeout:180000});
  const original=(await saved())[old[0]];assert.equal(original.detections.length,56);assert(original.runs.length>0);
  await upload();const recent=uploaded(await saved()).map(s=>s.sheetId).filter(id=>!old.includes(id));
  assert.equal(recent.length,4);assert.equal(await page.locator('[data-sheet-row]').count(),12);
  await row(old[0]).locator('[data-sheet-open]').click();
  await remove(old[0],false);assert.equal(await row(old[0]).count(),1);
  await remove(old[0]);assert.equal(await row(old[0]).count(),0);assert(!(await saved())[old[0]]);
  await page.getByRole('button',{name:'Undo sheet deletion',exact:true}).click();
  assert.deepEqual((await saved())[old[0]].detections,original.detections);
  assert.deepEqual((await saved())[old[0]].runs,original.runs);
  await remove(old[0]);await page.reload({waitUntil:'networkidle'});
  assert.equal(await row(old[0]).count(),0);assert(!(await saved())[old[0]]);
  report.push({step:'Single-sheet deletion, cancel, complete takeoff undo, persistence after reload',passed:true});

  await page.getByRole('button',{name:'Manage sheets',exact:true}).click();
  for(const id of old.slice(1))await row(id).getByRole('checkbox').check();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete selected (3)',exact:true}).click();
  assert.equal(uploaded(await saved()).length,4);
  for(const id of recent)assert((await saved())[id]);
  for(const id of old)assert(!(await saved())[id]);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-sheet-row]').count(),8);
  report.push({step:'Bulk-delete remaining old upload while retaining all four new sheets',passed:true});

  await remove('plan1-studio');await page.reload({waitUntil:'networkidle'});
  assert.equal(await row('plan1-studio').count(),0);
  await page.getByRole('button',{name:'Restore example sheets',exact:true}).click();
  assert.equal(await row('plan1-studio').count(),1);assert.equal(uploaded(await saved()).length,4);
  report.push({step:'Example removal persists; example restoration preserves uploaded workspace',passed:true});

  await row(recent[0]).locator('[data-sheet-open]').click();
  await page.getByRole('button',{name:'Run detection',exact:true}).click();
  await page.getByRole('status').filter({hasText:/candidates/}).waitFor({timeout:180000});
  assert.equal((await saved())[recent[0]].detections.length,56);
  assert(await page.getByRole('img',{name:'Electrical plan'}).evaluate(i=>i.complete && i.naturalWidth>0));

  // A second tab must not bring a removed sheet back into the shared workspace.
  const second=await context.newPage();await second.goto('https://atreyus.mobilemonero.com/',{waitUntil:'networkidle'});
  await remove(recent[3]);await second.waitForFunction(id=>!document.querySelector(`[data-sheet-row="${id}"]`),recent[3]);
  await second.close();report.push({step:'Retained sheet remains operational; second tab reflects deletion',passed:true});

  await page.getByRole('button',{name:'Manage sheets',exact:true}).click();
  await page.getByRole('button',{name:'Select all',exact:true}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete selected (7)',exact:true}).click();
  assert.equal(await page.locator('[data-sheet-row]').count(),0);
  await page.getByRole('button',{name:'Undo sheet deletion',exact:true}).click();
  assert.equal(await page.locator('[data-sheet-row]').count(),7);
  await page.screenshot({path:root+'dogfood-evidence/sheet-deletion.png'});
  assert.deepEqual(errors,[]);report.push({step:'Empty workspace and bulk undo',passed:true,uncaughtBrowserErrors:errors.length});
  await writeFile(root+'dogfood-evidence/sheet-deletion-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await page.screenshot({path:root+'dogfood-evidence/sheet-deletion-failure.png'});console.error(e);process.exitCode=1;}
finally{await browser.close();}
