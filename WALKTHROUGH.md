# Stage 3 technical walkthrough — AI Electrical Takeoff

This walkthrough follows the supplied **Stage 3 – Technical Assessment: AI
Electrical Takeoff**. Use the original four-page Escondido PDF, not the partial
third-party crop previews. The live application is
**https://atreyus.mobilemonero.com**.

## Documents and starting point

- **README.md:** installation, startup, active models and architecture diagram.
- **DESIGN.md:** short design discussion covering breakdown, first release,
  acceptance, rollout/versioning, support and trade-offs.
- **ESTIMATING.md:** box assemblies, cable tracing, scale/routing assumptions and
  price provenance.
- **VERIFICATION.md:** measured results, test receipts, evidence and scope limits.
- **benchmarks/README.md:** how the 304-symbol source audit was constructed.

Refresh the application after an upgrade. Select a sheet and choose **Run
detection** to load the current analysis. Existing saved takeoffs are snapshots;
rerunning explicitly replaces that sheet's marks, rooms and routes, with Undo.
The hosted walkthrough uses the compiled frontend build, keeping the current view
stable while the API generates images and exports. `start.ps1` starts that mode;
run `npm run build` first after changing the UI.

## 1. Load the actual PDF and inspect all four sheets

1. Start on the public page in a fresh browser context.
2. Use **Download original four-sheet PDF**, or select `assets/plans/plans.pdf`
   from the source package.
3. Choose **Upload PDF · all sheets** and wait for the progress message to say
   **4 sheets ready**.
4. Open each imported sheet independently. The upload does not run cloud inference;
   it validates, stores and renders every page in a background job.
5. Open **Full sheet & legend** to show the original drawing context. The working
   view contains the complete electrical plan, including exterior devices.

| PDF page | Original sheet | Home | Audited electrical symbols |
|---|---|---|---:|
| 1 | A1-111 | Plan 1, studio | 56 |
| 2 | A2-111 | Plan 2, 2 bedrooms | 67 |
| 3 | A3-111 | Plan 3, 2 bedrooms | 83 |
| 4 | A4-111 | Plan 4, 3 bedrooms | 98 |

### Remove old sheets or duplicate imports

Each upload creates its own four-sheet set so that an existing edited takeoff is
not overwritten. Uploaded/saved timestamps distinguish repeated imports.

- Click the **trash icon on a sheet row** to delete that sheet and its saved
  takeoff from the workspace.
- For an old four-sheet set, choose **Manage sheets**, check its four rows, and
  choose **Delete selected (4)**. The newer set remains available.
- **Select all** is available in management mode for clearing the entire workspace.
- **Undo sheet deletion** restores the last removed set, including its saved
  marks, rooms, cable routes and estimate settings, until the page is reloaded.
- Deletion persists after reload. Example sheets can also be removed; **Restore
  example sheets** brings their source entries back as fresh takeoffs.
- **Clear** in the drawing tools empties a sheet's marks/rooms/routes while keeping
  the sheet listed. The sheet-row trash icon removes the sheet itself.

Workspace deletion is browser-local. Uploaded source PDFs, rendered assets and
inference caches have separate retention on the API host. Export JSON before
removing work that needs a portable archive. Sheet deletion is disabled while a
job is running, and workspace changes synchronize across tabs in the same browser.

## 2. Detect components and show their evidence

1. Choose **Hybrid · MEPdetect + custom Roboflow** and **Run detection**.
2. Show the visible marks, then enable **Boxes** to inspect detection bounding boxes.
   **Locations** is the separate overlay for physical device/gang boxes.
3. Click a mark. The inspector shows its type, room, model confidence or legend
   similarity, original class, printed subtype tags and relevant specification notes.
4. Open **Analysis provenance** to show the providers, raw proposal counts and
   pipeline build. Cached analysis is labelled as saved analysis.
5. Enable **Excluded** to show rejected proposals and inspect their reasons.

The active pipeline uses hosted MEPdetect and custom Roboflow image inference,
then vector/raster legend evidence and PDF text. No language-model prompt is used
in the active detector. The implementation is in `providers.py`, `vector_symbols.py`,
`legend.py`, `plan_semantics.py` and the merge stages in `main.py`.

Explain the difficult cases explicitly: mirrored wall-light blocks, three-prong
receptacles, the B32 panel keynote, combined smoke/CO, and the optional/prewire fan
qualification. The custom Roboflow model has weak standalone recall; the result is
a documented hybrid, not a claim that the custom model independently detects all
classes.

## 3. Trace each count back to the drawing

1. Use the **Room** filter to inspect one room's quantities and the home totals.
2. Click a component type in the table to isolate its marks.
3. Turn **Rooms** on to show boundaries and open-plan polygons.
4. Pick a quantity and point to the individual marks behind it. A count is derived
   from current detections, never a separately entered total.

The assessment's counting rules are reflected in the model:

- Separately labelled Kitchen and Dining remain separate on Plan 2; combined
  Kitchen / Dining labels remain combined where actually printed.
- Exterior lights and weatherproof exterior devices are assigned to Exterior.
- A combined smoke/CO device counts once. A fan's central J is part of the fan
  symbol, not a second junction-box device.
- Switch subtypes follow printed D, F, VS, A and 3D tags.
- Unlabelled heater cupboards are explicitly named **Equipment alcove (unlabelled)**
  as a review alias, not represented as text extracted from the plan.

## 4. Demonstrate component CRUD and immediate recalculation

1. **Create:** choose **Add component**, click the drawing, then select its type.
2. **Read:** click an existing mark to inspect its type, room and evidence score.
3. **Update:** change the type/room and drag the mark to a different position.
4. **Delete:** choose **Delete detection**.
5. Watch room/type totals update after each operation; use **Undo** to restore it.
6. Draw and name a room to assign its enclosed devices; room names can be edited.
7. Export JSON, reload, and confirm the browser-local takeoff is retained.

## 5. Demonstrate gang boxes and plates

1. Enable **Locations**. Inspect a two- or three-switch bank at a door.
2. Show one N-gang box and one N-gang plate rather than N single-gang boxes.
3. Click its label to inspect its member devices or choose spare gang capacity.
4. Move a switch away from the bank; box/plate quantities update. Undo the move.
5. Use **Separate box** in a switch's inspector when automatic grouping is unsuitable.
6. Show a **Fan-rated** location. The optional fan supply is excluded by default,
   but its prewire box remains in the material estimate.

## 6. Demonstrate cable tracing and CRUD

1. Enable **Cable**. Every included run is drawn and labelled with type and billable
   feet; blue and orange distinguish ordinary and traveler allowances.
2. Click a run to show its source-stroke count, horizontal measurement, rise/drop,
   cable inference and billable length. The export retains actual PDF stroke IDs.
3. Show the **1/4″ = 1′-0″** scale: 18 PDF points per real foot.
4. State the default routing proxy: follow the drawn curve, add **4 ft per switch
   endpoint**, add **10% waste**, then round each run up to a whole foot.
5. Show the 2-wire/3-wire distinction and the note-6 lighting/other-load gauge
   defaults. These remain editable estimating assumptions, not an engineered
   conductor schedule derived from a dashed line alone.
6. Change cable type, move a square vertex, reassign From/To endpoints, or exclude
   a run. Lengths and material totals update immediately.
7. Use **Trace cable**, click a route, and choose **Finish cable** to add a manual
   run. Delete it and demonstrate Undo and reload persistence.

Solid sink/faucet outlines are excluded even when they overlap electrical symbols.
Ambiguous or undrawn connections require explicit review/manual tracing. Shown
control routes do not constitute a complete feeder/receptacle/interconnect design.

## 7. Show the priced material summary

1. Open **Priced materials** for one home.
2. Show the device, box/plate and cable sections and the displayed total.
3. Click a row to highlight every drawn source object behind its quantity.
4. Change a unit price and observe the exact total change.
5. Change waste/rise or enable optional fan supply; explain the resulting delta.
6. Download **Export priced BOM CSV** or full JSON. Show its quantities, rates,
   source object IDs, routing settings and price provenance.

Prices are editable illustrative USD allowances dated 28 October 2026, not live
supplier quotes. NM-B prices are cost proxies for the notes' TW/THW copper
installation; confirm assemblies/installation method before procurement. Labor,
tax and undrawn circuits are excluded. Missing prices or scale are shown as a
partial estimate rather than silently filled in.

## 8. Evidence and technical discussion

The source audit matches 304 annotated device locations, classes and room
assignments, with no misses/extras at the documented tolerance. This is an
**agent-assisted in-sample audit**, not an independent certification or evidence of
generalization to other drawing styles. The runtime never reads the annotation
file; demonstrate that separation in `benchmarks/README.md` if asked.

Useful evidence:

- `dogfood-evidence/accuracy-audit.json`: per-sheet and per-class results.
- `analysis-*.json`, `hybrid-overlay-*.png`: actual detection output on all sheets.
- `materials-sheet-*.json/.png`: priced output and visible overlays on all sheets.
- `ui-verification.json`, `extensions-verification.json`: fresh-browser journeys.
- `sheet-deletion-verification.json`: duplicate imports, deletion, Undo and reload.
- `VERIFICATION.md`: latest build, measured timings and test results.

The README contains the architecture/data-flow diagram and commands to reproduce
the tests. The short design document covers pilot rollout, versioned models/caches,
saved-takeoff stability, correction-driven improvement and support triage. The
source handoff is `deliverables/atreyus-source.zip`; repository publication is a
separate submission step and has not been performed automatically.
