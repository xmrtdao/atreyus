# Atreyus: Professional Electrical Takeoff AI

## 1. Problem Breakdown & Implementation Order

To build a production-grade takeoff system, I've decomposed the problem into a linear pipeline where each stage provides the ground truth for the next.

### Stage 1: PDF Ingestion & Normalization
*   **Splitter**: Decompose the multi-page PDF into individual sheets (Plan 1-4).
*   **Rasterization**: Convert vector PDFs to high-resolution images (400+ DPI) to ensure small symbols (like a 1/8" switch) are not aliased.
*   **Normalization**: Apply adaptive contrast enhancement to handle watermarks (e.g., "City of Escondido") that might confuse the AI.

### Stage 2: Symbol Detection (The AI Core)
*   **Model**: Using YOLO11 (via YOLOplan), a state-of-the-art object detection architecture.
*   **Classes**: Specifically targeting `Ceiling Fans`, `Lights` (Recessed, Pendant, Wall), `Switches`, and `Receptacles`.
*   **Legend-Awareness**: Implementing a second-pass analysis where the AI reads the "Legend" section of the sheet to map symbol shapes to specific types (e.g., identifying if a circle with a cross is a "Recessed Light" on this specific set).

### Stage 3: Spatial Analysis & Room Assignment
*   **Wall Segmentation**: Using a Hough Line Transform or a semantic segmentation model to identify room boundaries.
*   **Zoning**: Creating polygonal "Room Zones."
*   **Attribution**: Performing a point-in-polygon check for every detected symbol to assign it to a room (e.g., "Kitchen," "Bedroom 1").
*   **Exterior Logic**: Any symbol outside the primary building polygon is automatically tagged as "Exterior."

### Stage 4: Human-in-the-Loop (Review UI)
*   **Canvas Overlay**: Rendering the plan with an SVG/Canvas layer of markers.
*   **CRUD Interface**: Allowing estimators to add missing symbols, reclassify misidentified ones, or delete false positives.
*   **Immediate Feedback**: Every UI action triggers a recalculation of the Room-level counts and the Home-level BOM.

---

## 2. Release Strategy

### First Release (MVP)
**Scope**: PDF upload $\rightarrow$ AI Detection $\rightarrow$ Basic BOM $\rightarrow$ Marker Correction.
**Omissions**: Automatic room detection (users manually assign rooms), advanced cable length measurement, and priced totals.
**Shipping Criteria**: 
*   **Accuracy Threshold**: $\ge 85\%$ recall on "Critical" components (Fans, Main Panel) across the 4 test plans.
*   **Zero-Guess Policy**: Every number in the table must have a corresponding visual marker on the plan.

### Full Rollout
*   **Pilot Users**: Deploy to a small group of experienced estimators.
*   **Feature Flags**: Roll out "Automatic Room Detection" and "Cable Lengths" as optional toggles.
*   **Model Versioning**: Store the model version used for every takeoff. If the model is updated (e.g., from v1 to v2), the system flags "Re-scan Suggested" but preserves the user's manual corrections as the "Gold Truth."

---

## 3. Support & Maintenance

### Accuracy Tracking
*   **Correction Delta**: Track the number of user corrections per plan. A high "correction rate" on "Recessed Lights" triggers a dataset collection for re-training.
*   **Gold Dataset**: Every user-corrected plan is archived as a ground-truth sample to improve the model.

### Handling New Styles
*   **Legend Embedding**: Instead of a static model, the system will use a Vision-Language Model (VLM) to "read" the legend of each new plan set and update the detection classes dynamically.

### Bug Triage
*   **Visual Auditing**: Bugs are triaged by overlaying the AI's "Confidence Map" over the plan to see where the model was uncertain.

---

## 4. Trade-offs & Future Improvements

### What I'd do with more time/team:
1.  **Cable Routing AI**: Move from "dashed line" detection to a path-finding algorithm that calculates real cable runs based on standard construction routing (e.g., 12" drop from ceiling).
2.  **Auto-Ganging**: Implement a proximity-based grouping algorithm to automatically detect "2-gang" or "3-gang" boxes when switches are clustered.
3.  **Multi-Sheet Sync**: Link the Electrical plan with the Architectural layout to automatically pull room names and dimensions.
4.  **PDF Vector Extraction**: Instead of rasterizing, I would attempt to extract SVG paths directly from the PDF to get sub-pixel accuracy for symbol centers.
