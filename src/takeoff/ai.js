// Detections are normalized (0..1) x/y — the same coordinate space as rooms.
// AI results arrive in image px and are converted here.

export function pxToNorm(pxX, pxY, imgW, imgH) {
  return { x: pxX / imgW, y: pxY / imgH };
}

// Map backend YOLO classes (from a generic yolo11s or a custom weights set)
// into our takeoff types. Anything unknown lands in 'junction-box' for review.
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
      const c = d.center ?? [ (d.bbox[0] + d.bbox[2]) / 2, (d.bbox[1] + d.bbox[3]) / 2 ];
      const { x, y } = pxToNorm(c[0], c[1], imgW, imgH);
      return {
        id: `ai_${imgName}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        type: CLASS_MAP[d.class] ?? 'junction-box',
        confidence: typeof d.confidence === 'number' ? d.confidence : 0,
        x, y,
        source: 'ai',
        roomId: null,
      };
    })
    .filter(d => d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1);
}
