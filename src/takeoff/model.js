import { TYPES } from './types.js';

// A takeoff for one sheet: rooms + detections, normalized to 0..1 image coords.
export function emptySheet(sheetId) {
  return { sheetId, rooms: [], detections: [], updatedAt: Date.now() };
}

// ---- persistence -----------------------------------------------------------
const KEY = 'atreyus-takeoffs-v1';

export function loadAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: keep session-local only
  }
}

// ---- derivation used everywhere -------------------------------------------

// room for a detection: explicit override wins, else point-in-rect lookup
export function roomOf(det, rooms) {
  if (det.roomId) return det.roomId;
  for (const r of rooms) {
    if (r.x0 <= det.x && det.x <= r.x1 && r.y0 <= det.y && det.y <= r.y1) return r.id;
  }
  return 'Unassigned';
}

export function annotate(detections, rooms) {
  return detections.map(d => ({ ...d, roomId: roomOf(d, rooms) }));
}

// per-room, per-group counts + grand totals
export function computeBom(detections, rooms) {
  const dets = annotate(detections, rooms);
  const roomRows = [...rooms.map(r => r.id), 'Unassigned'].map(roomId => {
    const here = dets.filter(d => d.roomId === roomId);
    const byGroup = {};
    for (const d of here) {
      const g = TYPES[d.type]?.group ?? 'other';
      byGroup[g] = (byGroup[g] ?? 0) + 1;
    }
    const byType = {};
    for (const d of here) byType[d.type] = (byType[d.type] ?? 0) + 1;
    // name fallback for rooms the point-in-rect didn't cover
    const room = rooms.find(r => r.id === roomId);
    return { roomId, name: room ? room.name : (roomId === 'Unassigned' ? 'Unassigned' : roomId), total: here.length, byGroup, byType };
  });
  const totals = {};
  for (const d of dets) {
    const g = TYPES[d.type]?.group ?? 'other';
    totals[g] = (totals[g] ?? 0) + 1;
  }
  return { roomRows, totals, dets };
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
