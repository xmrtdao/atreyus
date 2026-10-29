# Verification — 28 October 2026

**Core review workflow: live and end-to-end verified.**

Public URL: https://atreyus.mobilemonero.com  
API version: `3.0.0`  
Verified pipeline build: `b33c240f8cfe`

## Real user journey

`node scripts/verify_ui.mjs` opened the public website in a **fresh Chromium
context at 1600 × 1000**, using real forms, pointer events, uploads and endpoints.
The final run passed:

- Select the supplied Plan 1 and run detection.
- Confirm every counted detection has a rendered mark and the image actually loads.
- Add a mark; change its type and room; drag it; delete; undo; delete again.
- Draw and name a room, then undo it.
- Download a real JSON export and confirm persistence after browser reload.
- Upload the original four-page PDF through the file input.
- Select and analyze **each of the four uploaded sheets** independently.
- Confirm each sheet's image loads and its mark count equals its stored detections.
- **Zero uncaught browser errors.**

The final public-browser upload/split took **13.989 seconds while another API
verification run was processing sheets concurrently**. Earlier non-contended UI
runs took about 5.4 seconds. The final direct API run accepted the PDF with HTTP
202 in **0.01 seconds** and rendered all four distinct images in **4.54 seconds**.
There is no remote inference in the upload handler.

Evidence: `dogfood-evidence/ui-verification.json`, `ui-plan1.png`,
`ui-upload-sheet-1.png` through `ui-upload-sheet-4.png`, and `ui-export.json`.

## Current generated output

These are actual pipeline outputs, **not independent all-class ground truth**.
All quantities are derived from the corresponding positioned marks.

| Sheet | Candidates | Ceiling-fan symbols | Recessed lights | Switches, all subtypes |
|---|---:|---:|---:|---:|
| Plan 1 | 55 | 1 | 7 | 13 |
| Plan 2 | 66 | 2 | 11 | 13 |
| Plan 3 | 81 | 2 | 13 | 20 |
| Plan 4 | 94 | 3 | 18 | 22 |

The eight ceiling-fan locations were visually checked against the complete source
drawings. The legend describes these as optional/prewire symbols. This is a
visual spot-check, not an independently annotated precision/recall benchmark.

Actual data: `dogfood-evidence/analysis-1.json` through `analysis-4.json`.
Visual evidence: `hybrid-overlay-1.png` through `hybrid-overlay-4.png`.

## Provider findings

- MEPdetect Electrical v2 returned 41 / 53 / 53 / 71 raw candidates on the four
  complete electrical viewports. Vector/raster legend evidence and printed tags
  refine the result and remove overlaps and demonstrable false positives.
- The custom Roboflow model returned 0 / 3 / 0 / 1 raw candidates in the final
  full-image-plus-tile probes. Some low-confidence proposals were false positives;
  they are excluded under the 0.40 custom-model review threshold and remain
  available in the excluded-proposal overlay. **The custom model's recall is weak.**
- Actual geometry and subtype refinements distinguish 3-way dimmers, fan/vacancy/
  astronomical switches, AFI/GFI/240V/WP/half-hot and dedicated appliance outlets,
  combined smoke/CO, exhaust/IAQ fans, exterior and attic/service lights.

## Defects repaired

- Upload waited for inference and returned only page 1; now it is a separate
  durable multi-page rendering job with visible progress and unique asset paths.
- Several supplied crop images omitted parts of homes. Complete electrical
  viewports are rendered from the original PDF; full sheets and legends remain
  accessible.
- MEPdetect was not called at all. Both providers now have working adapters.
- Roboflow was incorrectly treated as a workflow and sent a server-local `file://`
  URL. The adapter sends actual image bytes and supports the configured model.
- Generic contour guesses and a generic YOLO fallback could masquerade as
  electrical detections. Neither is used by the active API.
- Unknown classes were converted to junction boxes; they now remain unclassified.
- Nearby switches could be merged; glyph-aware deduplication preserves adjacent
  switch locations, and a fan's central J is not an extra junction box.
- Per-room counts could omit manually assigned room names. All assignments now
  participate in derived counts.
- Canvas fit/zoom, mark movement, explicit pixel normalization, bounding boxes,
  subtype editing, room overrides, undo and export were repaired or added.
- Printed text and crossed porch columns generated false devices. Explicit
  negative geometry checks exclude those proposals with inspectable reasons.
- A real concurrent UI test exposed an intermittent Windows status-file lock.
  Atomic snapshot replacement now has bounded retries. PDF library access is
  serialized. The same concurrent API/browser workload then passed.
- Invalid PDFs could retain a native Windows file handle and mask the intended
  validation error. Validation from bytes now returns the expected HTTP 422.
- The main repository contained a backend Git link rather than the active API
  source. It has been converted to ordinary source files. Original nested Git
  metadata is preserved at
  `atreyus/backend_ai`.

## Checks

- `npm run build`: passed.
- `py -m unittest discover -s backend_ai/tests`: **7 tests passed**.
- `py scripts/verify_pipeline.py`: four rendered sheets and four analyses passed.
- `node scripts/verify_ui.mjs`: complete public-site journey passed.
- Encoding checker: 41 source/documentation files passed; final changed files
  checked again after the concurrency fix.
- Targeted Git whitespace checks: passed.
- Source credential-pattern scan: 60 files, zero flagged files.

## Remaining limits and handoff

This is an operational **review-first component takeoff**, not a certified
fully automatic estimate. All-class precision, recall and room accuracy have not
been independently measured. Room boundaries are editable reviewed rectangles;
open-plan divisions and boundary devices need checking. Unfamiliar PDFs do not
inherit the supplied sheets' legend/room metadata and need additional review.

Automatic cable tracing, gang-box procurement and priced BOM are not implemented.
The current exports are component schedules. Browser-local autosave is not shared
account storage; export JSON for handoff.

The application is running on the existing Windows host/tunnel. `start.ps1` was
executed successfully and confirmed the API version/build. The backup at
`Desktop/atreyus` was left intact. No GitHub commit or push was performed; the
working source, design and evidence are packaged in `deliverables/atreyus-source.zip`.

A credential embedded in the Git remote appeared in diagnostic output. The remote
was changed to the credential-free repository URL. That GitHub token should be
rotated; its value is not included in this handoff.
