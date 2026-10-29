import test from 'node:test';
import assert from 'node:assert/strict';
import {removeSheets,restoreSheets,restoreExamples,deletedSheetIds} from '../src/takeoff/workspace.mjs';

test('deleting an uploaded sheet removes its complete takeoff while preserving the newer upload',()=>{
  const old={sheetId:'upload-old-1',detections:[{id:'d'}],rooms:[{id:'r'}],runs:[{id:'c'}],priceOverrides:{switch:10}};
  const next={sheetId:'upload-new-1',detections:[]};
  const original={'upload-old-1':old,'upload-new-1':next};
  const removed=removeSheets(original,['upload-old-1']);
  assert(!Object.hasOwn(removed.workspace,'upload-old-1'));
  assert.deepEqual(removed.workspace['upload-new-1'],next);
  assert.deepEqual(original['upload-old-1'],old);
  assert.deepEqual(deletedSheetIds(JSON.parse(JSON.stringify(removed.workspace))),['upload-old-1']);
  assert.deepEqual(restoreSheets(removed.workspace,removed)['upload-old-1'],old);
});

test('bulk deletion removes unloaded examples too, and restoring examples does not resurrect removed upload data',()=>{
  const source={'upload-old-1':{sheetId:'upload-old-1'}};
  const removed=removeSheets(source,['plan1-studio','plan2-2bed','upload-old-1']);
  assert.equal(deletedSheetIds(removed.workspace).length,3);
  const restored=restoreExamples(removed.workspace,['plan1-studio','plan2-2bed']);
  assert.deepEqual(deletedSheetIds(restored),['upload-old-1']);
  assert(!restored['upload-old-1']);assert(!restored['plan1-studio']);
});

test('undo preserves edits made after the deletion rather than overwriting them',()=>{
  const original={'plan1-studio':{detections:[{id:'before'}]}};
  const removed=removeSheets(original,['plan1-studio']);
  const current={...removed.workspace,'plan1-studio':{detections:[{id:'after'}]}};
  assert.equal(restoreSheets(current,removed)['plan1-studio'].detections[0].id,'after');
});
