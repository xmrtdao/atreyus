# Retired implementation, retained for comparison with pre-repair behaviour.
# (original main.py was corrupted by PowerShell encoding round-trip; see AGENTS.md)

import os, sys, json, cv2, numpy as np, traceback
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn, shutil

# Compute directories from script location
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

# Plan resolution
PORT = 8000

def load_env_keys(env_path=None):
    keys = {}
    candidates = [env_path] if env_path else []
    if env_path and not os.path.isabs(env_path):
        candidates.insert(0, str(PROJECT_ROOT / env_path))
    candidates += [
        "relay/.env", "../relay/.env", "../../relay/.env",
        str(PROJECT_ROOT / "relay" / ".env"),
        str(PROJECT_ROOT.parent / "relay" / ".env"),
    ]
    for p in candidates:
        resolved = Path(p).resolve()
        if resolved.is_file():
            path = str(resolved)
            break
    else:
        return keys
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                keys[k] = v
    return keys

ENV_KEYS = load_env_keys()
OLLAMA_API_KEY = ENV_KEYS.get("OLLAMA_API_KEY")
OLLAMA_BASE_URL = "https://api.ollama.com/v1"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
RESULTS_DIR = Path("results")
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# Roboflow config
ROBOFLOW_API_KEY = ENV_KEYS.get("ROBOFLOW_API_KEY", "")
ROBOFLOW_MODEL_ID = ENV_KEYS.get("ROBOFLOW_MODEL_ID", "electrical-plan/2")
ROBOFLOW_CONF = float(ENV_KEYS.get("ROBOFLOW_CONFIDENCE", "0.25"))

def roboflow_available():
    return bool(ROBOFLOW_API_KEY and ROBOFLOW_MODEL_ID)

# YOLO detector (optional)
detector = None
MODEL_PATH = ENV_KEYS.get("ATREYUS_MODEL_PATH", "yolo11s.pt")
try:
    from YOLOplanDetector import YOLOplanDetector, PDFProcessor
    detector = YOLOplanDetector(MODEL_PATH)
except Exception as _e:
    print(f"WARN: could not load model {MODEL_PATH}: {_e}", flush=True)

def map_roboflow_class(cls_name):
    n = (cls_name or "").lower()
    if "exhaust" in n or ("fan" in n and "exhaust" in n):
        return "exhaust-fan"
    if "fan" in n:
        return "ceiling-fan"
    if "smoke" in n or "detector" in n or "co " in n or "carbon" in n:
        return "smoke-detector"
    if "switch" in n:
        if "3" in n or "three" in n:
            return "switch-3way"
        if "dimmer" in n:
            return "switch-dimmer"
        if "sensor" in n or "vacancy" in n or "occupancy" in n:
            return "switch-sensor"
        return "switch"
    if "receptacle" in n or "outlet" in n or "powerpoint" in n or "gfi" in n or "gfc" in n:
        if "gfi" in n or "gfc" in n:
            return "receptacle-gfi"
        if "240" in n or "240v" in n:
            return "receptacle-240"
        if "wp" in n or "waterproof" in n or "weather" in n:
            return "receptacle-wp"
        return "receptacle"
    if "light" in n or "luminaire" in n or "fixture" in n or "lamp" in n or "downlight" in n:
        if "pendant" in n:
            return "light-pendant"
        if "wall" in n:
            return "light-wall"
        if "exterior" in n or "outdoor" in n:
            return "light-exterior"
        return "light-recessed"
    if "quad" in n or "duplex" in n:
        return "receptacle"
    if "junction" in n or "box" in n:
        return "junction-box"
    return "junction-box"

# ============================================================
# Template matching supplement using user's icon templates
# ============================================================
ICON_DIR_TEMPLATE = Path(__file__).resolve().parent / "icons"

def load_icon_templates():
    templates = {}
    if not ICON_DIR_TEMPLATE.exists():
        return templates
    canonical_map = {
        "ceiling-fan": "ceiling-fan",
        "exhaust-fan": "exhaust-fan",
        "switch (1)": "switch",
        "switch-dimmer": "switch-dimmer",
        "switch-3waydimmer (1)": "switch-3way",
        "switch-fan": "switch",
        "switch-vacancy-sensor": "switch-sensor",
        "smoke-detector": "smoke-detector",
        "smoke-cm-combo": "smoke-detector",
        "junction-box": "junction-box",
        "duplex-outlet-240v": "receptacle-240",
        "indoor-air-quality-fan": "ceiling-fan",
        "astro-motion-switch": "switch-sensor",
        "afi-circuit-interrupter": "receptacle",
    }
    for f in sorted(ICON_DIR_TEMPLATE.glob("*.png")):
        canonical = canonical_map.get(f.stem, f.stem)
        img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
        if img is not None:
            templates[canonical] = img
    return templates

def detect_with_template_matching(image_path):
    templates = load_icon_templates()
    if not templates:
        return []
    img = cv2.imread(str(image_path) if isinstance(image_path, (str, Path)) else image_path)
    if img is None:
        return []
    gray_plan = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h_plan, w_plan = gray_plan.shape
    detections = []
    for sym_type, sym_img in templates.items():
        h_sym, w_sym = sym_img.shape
        # Skip templates that are disproportionately large relative to plan
        if h_sym > h_plan * 0.5 or w_sym > w_plan * 0.5:
            continue
        res = cv2.matchTemplate(gray_plan, sym_img, cv2.TM_CCOEFF_NORMED)
        threshold = 0.55
        loc = np.where(res >= threshold)
        found_points = []
        for pt in zip(*loc[::-1]):
            cx = int(pt[0] + w_sym / 2)
            cy = int(pt[1] + h_sym / 2)
            score = float(res[pt[1], pt[0]])
            found_points.append({"x": cx, "y": cy, "score": score})
        if not found_points:
            continue
        found_points.sort(key=lambda p: p["score"], reverse=True)
        keep = []
        for best in found_points:
            # Exclude legend region (only for full-size plans)
            if w_plan >= 5000 and best["x"] >= 6400 and best["x"] < 7200 and best["y"] >= 2300 and best["y"] < 4800:
                continue
            keep.append(best)
        # Deduplicate by proximity
        deduped = []
        for k in keep:
            too_close = False
            for existing in deduped:
                dist = np.sqrt((k["x"] - existing["x"])**2 + (k["y"] - existing["y"])**2)
                if dist < 40:
                    too_close = True
                    break
            if not too_close:
                deduped.append(k)
        for d in deduped:
            detections.append({
                "id": f"tmpl_{sym_type}_{d['x']}_{d['y']}",
                "type": sym_type,
                "confidence": round(d["score"], 4),
                "bbox": [d["x"] - w_sym/2, d["y"] - h_sym/2, d["x"] + w_sym/2, d["y"] + h_sym/2],
                "center": [d["x"], d["y"]],
                "area": float(w_sym * h_sym),
            })
    print(f"Template matching found {len(detections)} symbols", flush=True)
    return detections

# ============================================================
# Contour-based detector
# ============================================================
def detect_with_contours(image):
    # ... existing contour detection ...
    # (function already defined in file)
    if isinstance(image, (str, Path)):
        img = cv2.imread(str(image))
    else:
        img = image
    if img is None:
        return [], 0, 0
    img_h, img_w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    img_area = max(img_w * img_h, 1)
    min_area = max(20, int(img_area * 0.00002))
    max_area = max(200, int(img_area * 0.005))
    filtered = [c for c in contours if min_area < cv2.contourArea(c) < max_area]
    denom = max(img_w * img_h, 1)
    dets = []
    for i, c in enumerate(filtered):
        x, y, w, h = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        cx, cy = x + w // 2, y + h // 2
        ar = w / h if h > 0 else 0
        peri = cv2.arcLength(c, True)
        circ = (4 * np.pi * area / (peri * peri)) if peri > 0 else 0.0
        # Shape-based classification
        if circ >= 0.72:
            sym_type = "receptacle" if area >= 120 else "light-recessed"
        elif ar > 1.5:
            sym_type = "light-recessed"
        elif ar < 0.8:
            sym_type = "switch"
        else:
            sym_type = "other"
        final_type = sym_type  # canonical mapping is already done
        if final_type == "receptacle": final_type = "receptacle"
        elif final_type == "light-recessed": final_type = "light-recessed"
        elif final_type == "switch": final_type = "switch"
        else: final_type = "other"
        dets.append({
            "id": f"cnt_{i}",
            "type": final_type,
            "confidence": round(float(area) / denom, 4),
            "bbox": [int(x), int(y), int(x + w), int(y + h)],
            "center": [cx, cy],
            "area": float(area),
        })
    return dets, img_w, img_h

# ============================================================
# Roboflow inference (serverless) — workflow + classic
# ============================================================
def detect_with_roboflow(image_path, use_workflow=False):
    import requests as _r, base64, cv2
    try:
        with open(image_path, "rb") as f:
            img_bytes = f.read()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        im = cv2.imread(image_path)
        img_h, img_w = (im.shape[:2] if im is not None else (0, 0))
        
        # Try workflow first if configured (model ID contains workflow slug) or
        # explicitly requested via use_workflow parameter.
        is_workflow = use_workflow or (ROBOFLOW_MODEL_ID is not None and (
            "workflows" in ROBOFLOW_MODEL_ID or 
            "rfdetr" in ROBOFLOW_MODEL_ID.lower()
        ))
        
        if is_workflow:
            workflow_url = f"https://serverless.roboflow.com/{ROBOFLOW_MODEL_ID}"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ROBOFLOW_API_KEY}",
            }
            payload = {
                "inputs": {
                    "image": {"type": "url", "value": f"file://{image_path}"}
                }
            }
            resp = _r.post(workflow_url, headers=headers, json=payload, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            
            preds = None
            img_w_r = 0
            img_h_r = 0
            if isinstance(data, dict) and "outputs" in data:
                for out in data.get("outputs", []):
                    p = out.get("predictions") if isinstance(out, dict) else None
                    if isinstance(p, dict) and "predictions" in p and isinstance(p["predictions"], list):
                        preds = p["predictions"]
                        img_w_r = p.get("image", {}).get("width") or img_w
                        img_h_r = p.get("image", {}).get("height") or img_h
                        break
                    if isinstance(p, list):
                        preds = p
                        img_w_r = img_w
                        img_h_r = img_h
                        break
            if preds is None and isinstance(data, dict) and "predictions" in data and isinstance(data["predictions"], list):
                preds = data["predictions"]
                img_w_r = data.get("image", {}).get("width") or img_w
                img_h_r = data.get("image", {}).get("height") or img_h
            
            if preds is None:
                preds = []
            
            img_area = max(img_w_r * img_h_r, 1)
            dets = []
            for i, p in enumerate(preds):
                conf = float(p.get("confidence", p.get("score", 0)))
                area = float(p.get("width", 0) * p.get("height", 0))
                if conf < ROBOFLOW_CONF:
                    continue
                if area > 0.25 * img_area:
                    continue
                cx = p.get("x", 0); cy = p.get("y", 0)
                w = p.get("width", 0); h = p.get("height", 0)
                if w == 0 and "bbox" in p:
                    bb = p["bbox"]
                    w = bb[2] - bb[0]; h = bb[3] - bb[1]
                    cx = (bb[0] + bb[2]) / 2; cy = (bb[1] + bb[3]) / 2
                cls_raw = p.get("class") or p.get("class_name") or p.get("label") or ""
                mapped = map_roboflow_class(cls_raw)
                if mapped == "junction-box" and conf < 0.5:
                    continue
                dets.append({
                    "id": f"rf_{i}",
                    "class": mapped,
                    "confidence": conf,
                    "bbox": [cx - w/2, cy - h/2, cx + w/2, cy + h/2],
                    "center": [cx, cy],
                    "area": area,
                })
            for d in dets:
                if "type" not in d:
                    d["type"] = d.get("class", "other")
            print(f"Workflow found {len(dets)} detections on {image_path}", flush=True)
            return dets, img_w_r, img_h_r
        
    except Exception as e:
        print(f"Workflow failed: {e}", flush=True)
    
    # Classic inference (fallback when no workflow or failure)
    if not ROBOFLOW_MODEL_ID:
        return [], img_w, img_h
    
    # Classic serverless endpoint
    url = f"https://serverless.roboflow.com/{ROBOFLOW_MODEL_ID}"
    params = {"api_key": ROBOFLOW_API_KEY, "confidence": int(ROBOFLOW_CONF * 100)}
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    resp = _r.post(url, params=params, data=b64, headers=headers, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    
    preds = data.get("predictions", []) if isinstance(data, dict) else []
    img_w_r = data.get("image", {}).get("width") or img_w
    img_h_r = data.get("image", {}).get("height") or img_h
    
    img_area = max(img_w_r * img_h_r, 1)
    dets = []
    for i, p in enumerate(preds):
        cx = p.get("x", 0); cy = p.get("y", 0)
        w = p.get("width", 0); h = p.get("height", 0)
        if w == 0 and "bbox" in p:
            bb = p["bbox"]
            w = bb[2] - bb[0]; h = bb[3] - bb[1]
            cx = (bb[0] + bb[2]) / 2; cy = (bb[1] + bb[3]) / 2
        cls_raw = p.get("class") or p.get("class_name") or p.get("label") or ""
        mapped = map_roboflow_class(cls_raw)
        dets.append({
            "id": f"rf_{i}",
            "class": mapped,
            "confidence": float(p.get("confidence", p.get("score", 0))),
            "bbox": [cx - w/2, cy - h/2, cx + w/2, cy + h/2],
            "center": [cx, cy],
            "area": float(w * h),
        })
    for d in dets:
        if "type" not in d:
            d["type"] = d.get("class", "other")
    return dets, img_w_r, img_h_r


# ============================================================
# Endpoints
# ============================================================

def _resolve_plan_path(plan_name: str) -> Path:
    p = PROJECT_ROOT / "atreyus" / "public" / "plans" / f"{plan_name}.png"
    return p.resolve()

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_PATH, "model_loaded": detector is not None}

@app.post("/api/takeoff/upload")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        image_paths = PDFProcessor.pdf_to_images(str(file_path), str(RESULTS_DIR / "temp"))
        if not image_paths:
            raise HTTPException(status_code=500, detail="could not convert PDF to images")
        first_img = image_paths[0]
        import cv2
        _img = cv2.imread(first_img)
        if _img is None:
            raise HTTPException(status_code=500, detail="could not read first page image")
        _h, _w = _img.shape[:2]
        if roboflow_available():
            try:
                dets, rw, rh = detect_with_roboflow(first_img)
                if rw: _w = rw
                if rh: _h = rh
                if dets:
                    return {
                        "planId": "upload",
                        "planUrl": f"/results/{os.path.basename(image_paths[0])}",
                        "detections": dets,
                        "imageWidth": _w,
                        "imageHeight": _h,
                    }
            except Exception as e:
                print(f"Roboflow upload failed, falling back: {e}", flush=True)
        if detector is None:
            raise HTTPException(status_code=503, detail="model not loaded")
        result = detector.detect_symbols(first_img, save_annotated=True, output_dir=str(RESULTS_DIR))
        for d in result['detections']:
            d["type"] = map_roboflow_class(d.get("class", ""))
        return {
            "planId": "upload",
            "planUrl": f"/results/{os.path.basename(result['annotated_image'])}",
            "detections": result['detections'],
            "imageWidth": _w,
            "imageHeight": _h,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/takeoff")
async def get_takeoff(plan: str = "plan1-studio"):
    try:
        return await _get_takeoff_impl(plan)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"takeoff 500: {tb}", flush=True)
        raise HTTPException(status_code=500, detail=f"{tb}")

async def _get_takeoff_impl(plan: str = "plan1-studio"):
    plan_path = _resolve_plan_path(plan)
    if not plan_path.exists():
        raise HTTPException(status_code=404, detail="Plan not found")
    import cv2
    img = cv2.imread(str(plan_path))
    if img is None:
        raise HTTPException(status_code=500, detail="could not read plan image")
    img_h, img_w = img.shape[:2]
    # Try Roboflow first (trained model) when configured.
    if roboflow_available():
        try:
            dets, rw, rh = detect_with_roboflow(str(plan_path), use_workflow=True)
            if rw: img_w = rw
            if rh: img_h = rh
            if dets:
                for d in dets:
                    if "type" not in d:
                        d["type"] = d.get("class", "other")
                print(f"Roboflow found {len(dets)} detections on {plan}", flush=True)
                return {"detections": dets, "imageWidth": img_w, "imageHeight": rh}
        except Exception as e:
            print(f"Roboflow failed, falling back to contour: {e}", flush=True)
    # Supplement with icon template matching (user's 14 legend icons)
    try:
        tmpl_dets = detect_with_template_matching(str(plan_path))
        if tmpl_dets:
            # Merge: keep both sets, deduplicate by proximity
            all_dets = dets + tmpl_dets if dets else tmpl_dets
            # Deduplicate by proximity (within 40 pixels)
            deduped = []
            for d in sorted(all_dets, key=lambda d: -d.get("confidence", 0)):
                too_close = False
                for existing in deduped:
                    cx1, cy1 = d.get("center", [0, 0])
                    cx2, cy2 = existing.get("center", [0, 0])
                    dist = np.sqrt((cx1 - cx2)**2 + (cy1 - cy2)**2)
                    if dist < 40:
                        too_close = True
                        break
                if not too_close:
                    deduped.append(d)
            dets = deduped
            print(f"Template matching added {len(tmpl_dets)} symbols, merged to {len(dets)} on {plan}", flush=True)
    except Exception as e:
        print(f"Template matching failed: {e}", flush=True)
    # Contour-based detector (fallback)
    try:
        contour_dets, rw, rh = detect_with_contours(img)
        if contour_dets:
            if img_w >= 5000:
                legend_x1, legend_y1, legend_x2, legend_y2 = 6400, 2300, 7200, 4800
                kept = [d for d in contour_dets
                        if not (legend_x1 <= d["center"][0] < legend_x2
                                and legend_y1 <= d["center"][1] < legend_y2)]
                if kept:
                    contour_dets = kept
            print(f"contour detector found {len(contour_dets)} symbols on {plan}", flush=True)
            return {"detections": contour_dets, "imageWidth": rw, "imageHeight": rh}
    except Exception as e:
        print(f"contour detector error, falling back: {e}", flush=True)
    # YOLO fallback
    if detector is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    result = detector.detect_symbols(str(plan_path), save_annotated=True, output_dir=str(RESULTS_DIR))
    for d in result['detections']:
        if "type" not in d and "class" in d:
            d["type"] = map_roboflow_class(d["class"])
    return {
        "detections": result['detections'],
        "imageWidth": img_w,
        "imageHeight": img_h,
        "annotated_image": result['annotated_image'],
    }

@app.post("/api/llm/analyze")
async def analyze_with_llm(data: dict):
    try:
        payload = {
            "model": "gemma4:cloud",
            "messages": [
                {"role": "system", "content": "You are an expert electrical estimator. Analyze the provided symbol counts and suggest missing items or errors based on standard home electrical codes."},
                {"role": "user", "content": f"Current takeoff data: {json.dumps(data)}"}
            ],
            "options": { "temperature": 0.2 }
        }
        headers = { "Authorization": f"Bearer {OLLAMA_API_KEY}" }
        res = requests.post(f"{OLLAMA_BASE_URL}/chat", json=payload, headers=headers)
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
