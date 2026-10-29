import { TYPES } from './types.js';

// A takeoff for one sheet: rooms + detections, normalized to 0..1 image coords.
export function emptySheet(sheetId) {
  return { sheetId, rooms: [], detections: [], updatedAt: Date.now() };
}

// ---- persistence -----------------------------------------------------------
// V2 used incomplete crops; its coordinates must not be silently reused on complete plans.
const KEY = 'atreyus-takeoffs-v3';

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
    return true;
  } catch {
    return false;
  }
}

// ---- derivation used everywhere -------------------------------------------

// room for a detection: explicit override wins, else point-in-rect lookup
export function roomOf(det, rooms) {
  if (det.roomId) return det.roomId;
  for (const r of rooms) {
    if (containsRoom(r, det.x, det.y)) return r.id;
  }
  return 'Unassigned';
}

export function containsRoom(room, x, y) {
  if (!room.polygon) return room.x0 <= x && x <= room.x1 && room.y0 <= y && y <= room.y1;
  let inside = false;
  for (let i = 0, j = room.polygon.length - 1; i < room.polygon.length; j = i++) {
    const a = room.polygon[i], b = room.polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function annotate(detections, rooms) {
  return detections.map(d => ({ ...d, roomId: roomOf(d, rooms) }));
}

// per-room, per-group counts + grand totals
export function computeBom(detections, rooms) {
  const dets = annotate(detections, rooms);
  const roomRows = [...new Set([...rooms.map(r => r.id), ...dets.map(d => d.roomId), 'Unassigned'])].map(roomId => {
    const here = dets.filter(d => d.roomId === roomId);
    const byGroup = {};
    for (const d of here) {
      const g = d.type?.startsWith('custom:') ? 'custom' : TYPES[d.type]?.group ?? 'other';
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
    const g = d.type?.startsWith('custom:') ? 'custom' : TYPES[d.type]?.group ?? 'other';
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
