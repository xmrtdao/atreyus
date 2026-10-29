# Atreyus — Design and delivery

## 1. Breakdown and architecture

The first invariant is traceability: every count comes from a mark with an image
position, type, room and source. The pipeline is built in this order:

1. **Ingestion:** persist a validated PDF under a generated ID; accept immediately;
   render all pages in a worker. Store clip origin, render scale, dimensions and
   original page index. The full sheet remains available beside the working crop.
2. **Detection:** call the real MEPdetect and custom Roboflow models. Use full-image
   and tiled inference; merge in input coordinates. The supplied vector sheets
   additionally support matching the legend's CAD strokes and raster glyphs.
3. **Semantics:** associate printed subtype tags with compatible nearby glyphs.
   Keep combined devices as one component. Unknown classes remain reviewable.
4. **Room assignment:** visible traced room boundaries for the assessment sheets;
   extracted text labels for unfamiliar sheets. Kitchen and Dining stay separate
   when separately labelled. Open-plan divisions require estimator review.
5. **Review and counts:** React derives all totals from the current mark list.
   CRUD, room edits, filters and undo operate locally with immediate count updates.
   JSON preserves provenance and corrections; CSV provides a count schedule.
   Individual/bulk sheet deletion is persisted with the workspace, supports
   session Undo, and prevents completed jobs from resurrecting deleted sheets.
6. **Estimating:** trace actual PDF control strokes; derive gang boxes from aligned
   adjacent switches; derive cable quantities from editable routes and explicit
   scale/rise/waste assumptions. Every priced row retains its drawn source IDs.

FastAPI uses bounded worker pools so long inference calls do not block health or
job-status requests. Jobs, uploaded assets and caches persist on disk. A process
restart preserves completed output and reports interrupted jobs as retryable.
Generated IDs prevent upload-name collisions. The UI polls short requests rather
than holding one request open through PDF conversion and cloud inference.

## 2. First release and acceptance

Release a review-first pilot for the four supplied homes: separate sheets,
positioned fan/light/switch/receptacle proposals, supported legend subtypes,
room/type totals, complete CRUD, visible source context and portable exports.
The cable/box/pricing extension uses real plotted control curves and editable
allowance prices. Undrawn circuits are excluded rather than inferred from counts.

Functional acceptance is an actual clean-browser journey: upload the real PDF,
open all four generated images, run each analysis, correct a type/position/room,
delete and undo, confirm counts, export, then reload and confirm saved edits.

Accuracy acceptance is a **separate gate**: independently annotate all four sheets,
match predictions to ground truth at an agreed spatial tolerance, and report
per-class precision, recall, placement error and room-assignment accuracy. Proposed
pilot thresholds are 95% precision and 90% recall for core devices, with every
ceiling-fan location correct. These are targets, not measurements already achieved.
The supplied four-sheet, agent-assisted source audit now matches 304 annotated
device locations, classes and rooms. It is an in-sample check; the independent
held-out acceptance gate remains separate. Current custom-model recall is weak;
every generated takeoff remains a draft until
reviewed. Optional/prewire fan symbols retain that qualification.

## 3. Release and model changes

Pilot with a small estimator group and retain the source PDF plus reviewed JSON
for each bid. The engine selector provides an explicit provider choice; record the
chosen engine and model identifiers with each analysis. Pipeline code fingerprints
and image hashes separate cached outputs. Existing browser takeoffs are snapshots:
a model update must not silently rewrite a reviewed estimate. Rerunning detection
is explicit, warns about replacing marks, and can be undone.

Deploy the frontend build and API together. Smoke-test `/api/health`, the public
page, a four-sheet upload and a complete review/export flow before promoting.
Keep previous source/builds for rollback. Back up uploaded assets and results as
well as source; a backup is not a proven restore until the restore is exercised.

## 4. Support and learning loop

Treat wrong placements, omitted sheets, failed uploads and lost corrections as
high-priority defects. Use job IDs, build fingerprints and provider provenance to
reproduce issues. The client records before/after correction events in its export;
collect them with consent during a pilot. Production central telemetry and shared
accounts are future infrastructure, not implied by browser autosave.

Measure corrections per class and drawing style, distinguishing classification,
localization, missed-device and room errors. Independently adjudicate samples
before adding them to training data; user corrections are not automatically truth.
Evaluate new models on a held-out, versioned set and compare all classes, especially
rare subtypes, before switching the pilot default.

## 5. Trade-offs and next investment

Vector/legend matching is highly explainable on these CAD sheets and repairs
domain-model errors, but is not a universal detector. The room boundaries are
explicit reviewed layout metadata, not learned segmentation. Nearest text alone
cannot establish walls. Browser-local persistence makes corrections responsive
but is not collaborative storage. Cloud models avoid GPU deployment at the cost
of availability, latency and inference charges.

The estimating release uses 18 PDF points/ft on these sheets, 4 ft per switch end,
10% waste and whole-foot procurement rounding. Ordinary and 3-way routes default
to 14/2 and 14/3 cost allowances, with 12/2 for other loads per note 6; each run is
editable. NM-B assembly costs are a proxy for the notes' TW/THW copper installation,
which needs estimator confirmation. Prices are explicitly illustrative
estimator inputs, not vendor quotes. Optional fan supply is excluded by default;
the prewire fan-rated box remains. No undrawn feeds, labor or tax are included.

With more time/team capacity: independent all-class ground truth; retrain the
custom model with representative crops and negatives; learned polygon room
segmentation; durable database-backed queues; shared versioned estimates; broader
wire-style support and circuit engineering review; supplier-backed assemblies and
price updates with explicit versioned procurement specifications.
