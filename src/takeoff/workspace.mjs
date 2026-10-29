// Workspace metadata lives in the same atomic localStorage snapshot as takeoffs.
export function deletedSheetIds(workspace) {
  return Array.isArray(workspace._workspace?.deletedIds) ? workspace._workspace.deletedIds : [];
}

export function removeSheets(workspace, ids) {
  const unique=[...new Set(ids)].filter(id=>id!=='_workspace');
  const next={...workspace},removed={};
  for(const id of unique){
    if(Object.hasOwn(next,id))removed[id]=next[id];
    delete next[id];
  }
  next._workspace={...workspace._workspace,deletedIds:[...new Set([...deletedSheetIds(workspace),...unique])]};
  return {workspace:next,ids:unique,removed};
}

export function restoreSheets(workspace, removal) {
  const next={...workspace};
  for(const [id,sheet] of Object.entries(removal.removed))if(!Object.hasOwn(next,id))next[id]=sheet;
  next._workspace={...workspace._workspace,deletedIds:deletedSheetIds(workspace).filter(id=>!removal.ids.includes(id))};
  return next;
}

export function restoreExamples(workspace, ids) {
  return {...workspace,_workspace:{...workspace._workspace,deletedIds:deletedSheetIds(workspace).filter(id=>!ids.includes(id))}};
}
