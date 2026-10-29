# Cable, gang-box and priced material takeoff

## Drawing evidence

Enable **Locations** and **Cable** above the drawing. Locations outline the devices
that share a box and label its gang size or fan-rated/round-box type. Cable overlays
follow the source's plotted control curves and label cable type and billable feet.

The backend preserves the PDF drawing-stroke indices, original observed points,
dash gaps and endpoint lead extensions for each traced route. CAD exports contain
reversed segments, zero-length tessellation artifacts and more than one dash-gap
size; the tracer handles those without creating a switch-to-fixture proximity
network. Solid attic-service and switched-half-hot-outlet hookups are handled
separately. Other ambiguous solid lines are excluded: sink/faucet outlines overlap
wall-light symbols and must not be billed as cable. A reviewer can trace any missing
connection explicitly. Routes that
cannot be attached to supported devices are not silently invented.

Editable route vertices simplify the observed curve within **0.3 PDF points**.
Original observed points remain in the export. Endpoint links follow a device when
it moves. Deleting a device removes its incident runs; Undo restores both.

## Box and plate quantities

- Adjacent, aligned switches within **14 PDF points** are connected into one
  physical location. This accommodates the extra spacing used for vacancy-sensor
  lettering on the supplied sheets.
- N switches at a location receive one N-gang box and one N-gang plate, not N
  independent boxes. A location may be given spare capacity through its gang-size
  selector. Quantities and prices update immediately.
- A device's **Separate box** override prevents proximity grouping. Moving a
  switch to another location recalculates the groups.
- Receptacles receive device boxes and plates; weatherproof types receive
  weatherproof cover allowances. Fans/prewire symbols receive fan-rated boxes.
- Wall/service fixtures and detectors receive round boxes. Recessed fixtures and
  exhaust/IAQ fans are assumed to include their listed integral enclosure.
- Boxes are derived from actual device IDs. Deleting a box location explicitly
  deletes its member devices and their incident runs; the UI says so and supports
  Undo. A panel's own enclosure is included in its panel allowance.

These are estimating assemblies. Different product families may require different
boxes or covers; the visible locations and editable allowance rates make that
review explicit.

## Cable measurement and selection

The supplied drawings state **1/4″ = 1′-0″**, so one real foot is 18 PDF points.
The complete crop's pixel coordinates are converted through its recorded render
scale; zooming the viewer never changes the measurement.

Default billable length per run:

```
ceil((drawn horizontal route feet + 4 ft × switch endpoints) × 1.10)
```

The curve is a schematic horizontal routing proxy. The extra 4 ft per switch end
represents a rise/drop to the ceiling; 10% is waste/slack. Both are editable. A
missing/unconfirmed scale produces an unresolved run, not a made-up cable quantity.

Electrical note 6 specifies minimum **14 AWG at lighting** and **12 AWG at other
circuits**. Lighting-control allowances default to 14/2; motor/receptacle-control
allowances default to 12/2. A traced route between 3-way controls receives a
3-conductor traveler allowance. The user can change the defaults or override each
run. This is route-based inference, not a claim that every conductor was specified
by the dashed line.

The catalogue uses **NM-B assembly cost proxies**. The printed notes name TW/THW
copper conductors; installation method, raceway and product selection need estimator
confirmation. Parallel fan-control curves are priced independently as drawn unless
the estimator combines/excludes them for a specified shared multiconductor cable.

## Pricing and scope

Prices are **illustrative estimator-entered USD allowances dated 28 October 2026**,
stored in `src/takeoff/materials.mjs`. They are not live supplier prices or an
electrical installation quote. Every rate is editable in **Priced materials**.

- Optional ceiling-fan **supply is excluded by default**; its fan-rated prewire box
  remains. Enable supply explicitly to include the optional equipment cost.
- The panel allowance is generic. Note 5 specifies a 100 A subpanel while B32
  refers to cover-sheet options; confirm the selected assembly and breaker schedule.
- AFI-protected outlets are priced as standard duplex devices. The estimate does
  not invent an AFCI breaker schedule from outlet quantities.
- Labor, tax, undrawn feeds, undrawn receptacle circuits and unshown detector
  interconnection wiring are outside the generated control-run quantity.
- Unpriced items and included routes with missing scale/endpoints produce a visible
  **partial estimate** status rather than disappearing from the calculation.

## Review and CRUD

1. Click a box label to inspect its devices or change its gang capacity.
2. Click a cable label to inspect source evidence, change cable type, reassign its
   endpoints, include/exclude it, or delete it.
3. Drag square route handles to reshape a route. Moving an endpoint detaches its
   device link; selecting a From/To device reattaches it.
4. Use **Trace cable**, click points along the intended route, and choose **Finish
   cable** to create an estimator-drawn run. It is labelled as user-created.
5. Click a priced material row to highlight all of its source objects on the plan.
6. Export priced CSV or JSON. The export includes quantities, rates, source IDs,
   assumptions, model/build provenance, and route geometry. Browser reload retains
   edits through local autosave.

## Verification

`node --test scripts/materials.test.mjs` checks gang grouping and relocation,
vacancy-sensor spacing, optional fan exclusion, 3-way routing, scale conversion,
geometric edits, orphan handling, missing prices, source traceability and the
note-6 gauge distinction. Backend tests check that cable routes require real source
strokes. `node scripts/verify_extensions.mjs` exercises the public UI, verifies all
four sheets, edits boxes/routes/prices, checks Undo and reload, and downloads the
actual JSON and priced CSV artifacts.
