// Detections are normalized (0..1) x/y — the same coordinate space as rooms.
// AI results arrive in image px and are converted here.
import { TYPES } from './types.js';

export function pxToNorm(pxX, pxY, imgW, imgH) {
  return { x: pxX / imgW, y: pxY / imgH };
}

// Map backend YOLO classes into our takeoff types.
const CLASS_MAP = {
  'ceiling-fan': 'ceiling-fan', fan: 'ceiling-fan',
  'light': 'light-recessed', lamp: 'light-pendant',
  'switch': 'switch', receptacle: 'receptacle',
  'outlet': 'receptacle', 'socket': 'receptacle',
  'smoke': 'smoke-detector', 'detector': 'smoke-detector',
};

export function mapDetections(raw, imgW, imgH, imgName) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d, i) => {
      let cx, cy;

      // 1. Try direct x, y
      if (typeof d.x === 'number' && typeof d.y === 'number') {
        [cx, cy] = [d.x, d.y];
      }
      // 2. Try center array
      else if (Array.isArray(d.center) && d.center.length >= 2) {
        [cx, cy] = [d.center[0], d.center[1]];
      }
      // 3. Try bbox array
      else if (Array.isArray(d.bbox) && d.bbox.length >= 4) {
        [cx, cy] = [ (d.bbox[0] + d.bbox[2]) / 2, (d.bbox[1] + d.bbox[3]) / 2 ];
      }
      else {
        return null;
      }

      // API coordinates are explicitly pixels, including points within the first pixel.
      if (!(imgW > 0 && imgH > 0)) return null;
      const { x, y } = pxToNorm(cx, cy, imgW, imgH);

      let type = d.type ?? d.class ?? '';
      if (!(type in TYPES)) type = CLASS_MAP[type] ?? 'other';

      return {
        ...d,
        id: d.id ?? `ai_${imgName}_${i}`,
        type,
        confidence: typeof d.confidence === 'number' ? d.confidence : 0,
        x, y,
        source: d.source ?? 'ai',
        roomId: d.roomId ?? null,
        bbox: d.bbox?.map((v, i) => v / (i % 2 ? imgH : imgW)),
      };
    })
    .filter(d => d && d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1);
}
