# Template matching supplement using user's icon templates
# Uses the 14 icon files from Desktop/icons

import cv2
import numpy as np
from pathlib import Path

# Load templates from user's Desktop/icons folder
ICON_DIR = Path(__file__).resolve().parent / "icons"

def load_icon_templates():
    """Load the user's icon templates for supplementary matching."""
    templates = {}
    if not ICON_DIR.exists():
        return templates
    for f in sorted(ICON_DIR.glob("*.png")):
        name = f.stem
        # Map icon filenames to canonical electrical symbol types
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
        canonical = canonical_map.get(name, name)
        img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
        if img is not None:
            templates[canonical] = img
    return templates

# The templates can be used as a reference for future fine-tuning
# They are available at backend_ai/icons/ (resolved relative to this file).
print(f"Icon templates available: {len(load_icon_templates())}")
for name in load_icon_templates():
    print(f"  - {name}")
