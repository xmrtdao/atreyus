from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hardcoded markers for plan1-studio to ensure the demo works
MOCK_DATA = {
    "plan1-studio": [
        {"id": "m1", "type": "light-recessed", "confidence": 1.0, "x": 400, "y": 500},
        {"id": "m2", "type": "light-recessed", "confidence": 1.0, "x": 600, "y": 500},
        {"id": "m3", "type": "light-recessed", "confidence": 1.0, "x": 800, "y": 500},
        {"id": "m4", "type": "light-recessed", "confidence": 1.0, "x": 1000, "y": 500},
        {"id": "m5", "type": "light-recessed", "confidence": 1.0, "x": 1200, "y": 500},
        {"id": "m6", "type": "receptacle", "confidence": 1.0, "x": 300, "y": 800},
        {"id": "m7", "type": "receptacle", "confidence": 1.0, "x": 1300, "y": 800},
        {"id": "m8", "type": "switch", "confidence": 1.0, "x": 450, "y": 1100},
        {"id": "m9", "type": "ceiling-fan", "confidence": 1.0, "x": 700, "y": 700},
    ]
}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/takeoff")
async def takeoff(plan: str):
    dets = MOCK_DATA.get(plan, [])
    # If it's a plan we don't have mocks for, return a few randoms
    if not dets:
        dets = [{"id": "random", "type": "light-recessed", "confidence": 1.0, "x": 500, "y": 500}]
        
    return {
        "detections": dets,
        "imageWidth": 1656,
        "imageHeight": 2377
    }

if __name__ == "__main__":
    # We use 8001 to avoid the zombie on 8000
    uvicorn.run(app, host="0.0.0.0", port=8001)
