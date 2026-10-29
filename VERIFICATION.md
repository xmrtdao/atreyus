# Verification — Atreyus 3.1.0

**Live:** https://atreyus.mobilemonero.com  
**Verified API build:** `500e364adf1a`  
**Date:** 28 October 2026

## 1. Symbol accuracy: all four supplied sheets

The evaluation-only source audit contains **304 electrical symbols**, visually
annotated from the original unmarked PDF. The running API's output matches every
reference by position, class and room, with **zero misses, extras, class mismatches
or room mismatches**, under a 6-PDF-point matching tolerance.

| Sheet | Reference / detected | Ceiling fans | Recessed lights | All switch subtypes |
|---|---:|---:|---:|---:|
| Plan 1 | 56 / 56 | 1 | 7 | 13 |
| Plan 2 | 67 / 67 | 2 | 11 | 13 |
| Plan 3 | 83 / 83 | 2 | 13 | 20 |
| Plan 4 | 98 / 98 | 3 | 18 | 22 |

This is an **agent-assisted, in-sample source audit**, not an independent
estimator's certification or an accuracy guarantee for unseen drawings. Open-plan
zone divisions are documented review assumptions. Annotation coordinates are
hand-read from source grids; the tolerance is not a claim of survey precision.

The application does **not** read `benchmarks/annotations.py`. Detection still
comes from MEPdetect/Roboflow proposals, the sheet legend's vector/raster glyphs,
printed subtype tags and keyed equipment geometry. The reference is used only by
`scripts/evaluate_accuracy.py`. Its per-class report is
`dogfood-evidence/accuracy-audit.json`; methodology is in `benchmarks/README.md`.

### Errors found and repaired by the audit

- Added reflection-aware matching for mirrored CAD blocks, including wall lights.
- Added the three-prong receptacle glyph variant, recovering the microwave outlet
  on Plan 3 and the second laundry outlet on Plan 4.
- Located the four B32 electrical panels through their actual outlined geometry
  and keynote, rather than adding a fixed count or using the arrow position.
- Replaced incorrect rectangular open-plan splits with visible room polygons.
- Named otherwise unlabelled equipment cupboards explicitly as review aliases.
- Corrected orphan room IDs and kept switches at one shared location in one room.
- Preserved combined types, optional/prewire fan qualifications, and printed
  appliance/AFI/GFI/WP/240V tags.

## 2. Cable, boxes and priced BOM

Final fresh-browser extension results, using the default editable allowance rates:

| Sheet | Box locations | Traced control runs | Illustrative material allowance (USD) |
|---|---:|---:|---:|
| Plan 1 | 39 | 17 | $1,649.95 |
| Plan 2 | 46 | 20 | $1,760.40 |
| Plan 3 | 56 | 26 | $2,370.00 |
| Plan 4 | 65 | 31 | $2,575.60 |

These are **material allowances for devices, assemblies and shown control routes**,
not contractor quotes. Prices are estimator-authored examples, not supplier quotes.
Labor, tax and undrawn circuits/feeds are excluded. Every positive material row
has actual device, box or route IDs behind it; zero unpriced rows and zero
unresolved included routes occurred in these four default examples.

### Drawing-backed behavior verified

- Gang locations show one N-gang box and one N-gang plate. The grouping handles
  the wider vacancy-sensor lettering spacing; moving a switch changes grouping.
- Optional fan supply is excluded by default while the fan-rated prewire box remains.
- Cable routes retain actual PDF stroke IDs, observed points, and explicit endpoint
  extensions. Editable curve simplification is bounded to 0.3 PDF points.
- Cable quantities use the recorded render transform and 18 PDF points/ft on these
  sheets, plus editable rise/drop, waste and whole-foot rounding.
- Lighting and other-load defaults reflect the note-6 minimum 14/12 AWG distinction.
  Traced routes between 3-way controls receive a traveler allowance; overrides work.
- NM-B prices are assembly-cost proxies; the notes specify TW/THW copper and the
  installation method remains an estimator decision.
- Visual review rejected solid sink/faucet outlines that overlapped wall lights.
  A regression test prevents billing those outlines as cable. Other ambiguous or
  unshown routes require explicit user tracing rather than fabricated connections.

Full assumptions and instructions: [ESTIMATING.md](ESTIMATING.md).

## 3. Real public-site user journeys

Both browser suites start with a fresh Chromium context, use real forms/pointer
events and the public endpoints, and inspect saved/exported data rather than
stopping at successful HTTP responses.

### Core suite — `node scripts/verify_ui.mjs`

Passed sheet selection, inference, visible-mark/count equality, add/type/room/move/
delete, Undo, drawn-room assignment, JSON download, persistence after reload, real
four-page PDF upload, and independent analysis of all four uploaded sheets.
The final compiled-site run had **zero uncaught browser errors**. Its upload/render
journey took **7.453 seconds** while the estimating and sheet-deletion browser
suites were running concurrently.

The final direct API suite accepted the PDF with HTTP 202 in **0.03 seconds**,
rendered four distinct images in **5.37 seconds**, and checked that every image
could actually be downloaded. Upload does not wait for provider inference.

### Estimating suite — `node scripts/verify_extensions.mjs`

The final build passed:

- Four sheets with exact source-audit symbol counts, visible box counts and cable paths.
- Opening priced materials and checking every exported priced row's source IDs.
- Changing a unit price and verifying the exact resulting total change.
- Including/excluding optional fan supply and verifying its cost delta.
- Downloading the actual priced CSV, including routing assumptions.
- Changing gang capacity and moving a switch out of its bank, then Undo.
- Changing cable type; drawing a cable; dragging its vertex; deleting it; Undo.
- Reloading and confirming route edits persist.
- **Zero uncaught browser errors.**

Evidence: `dogfood-evidence/extensions-verification.json`, `materials-sheet-1.json`
through `materials-sheet-4.json`, their screenshots, and `priced-bom-ui.csv`.

## 4. Automated checks and handoff

- `npm run build`: passed.
- `py -m unittest discover -s backend_ai/tests`: **11 tests passed**.
- `node --test scripts/materials.test.mjs`: **10 tests passed**.
- `node --test scripts/workspace.test.mjs`: **3 tests passed**.
- `py scripts/evaluate_accuracy.py`: source-audit gate passed for all 304 symbols.
- Core and estimating public-browser journeys: passed.
- `node scripts/verify_sheet_deletion.mjs`: passed individual and bulk deletion,
  cancelled deletion, full-takeoff Undo, reload persistence, example removal and
  restoration, newer-upload preservation, empty-workspace recovery and cross-tab
  synchronization. Zero uncaught browser errors.
- Encoding checks: 57 source/documentation files passed; final edited files checked again.
- Targeted Git whitespace checks: passed.
- Source credential-pattern scan: 89 files, zero flagged files.

`deliverables/atreyus-source.zip` contains current source, benchmark annotations,
the original plans, design/estimating documentation and evidence. The running host
was restarted through `start.ps1` and reports API 3.1.0. No GitHub commit or push was
performed. Earlier core-only verification is preserved in
`docs/verification-3.0.md`.

### Workspace follow-up

Each sheet row now has a trash control. **Manage sheets** supports selecting and
deleting an old imported set in one action; import/saved timestamps distinguish
duplicate filenames. The deletion and its marker are persisted atomically with
the browser workspace. Removing an active sheet selects a remaining one, and
**Undo sheet deletion** restores its complete saved takeoff during that session.
The supplied examples can also be removed and restored from the source catalogue.
Uploaded source files and inference caches retain their separate server lifecycle.

The README and [WALKTHROUGH.md](WALKTHROUGH.md) now map the UI steps to the reattached
assessment: four-sheet ingestion, per-class/room counts, visible evidence, CRUD,
gang sizes, measured cable/routing assumptions, priced summaries, and exports.

The hosted frontend now serves the compiled `dist` build on port 5174. A regression
run exposed a development-server reload that reset the selected sheet while
artifacts were being written; fixed-build serving removes that HMR dependency.
The startup script and walkthrough document the build/update procedure.

## Remaining scope limits

The custom Roboflow model still has weak standalone recall; the strong supplied-
sheet result depends on the documented hybrid/vector/legend approach. Other drawing
styles need their own evaluation, scale confirmation and review. Room boundaries
are review metadata, not learned segmentation. Cable lengths follow schematic
curves under disclosed routing assumptions, and pricing remains editable budget
allowances. Browser-local autosave is not collaborative project storage.
