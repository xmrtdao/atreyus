# Source-symbol audit

`annotations.py` is an **evaluation-only visual reference**, authored by inspecting
the original unmarked four-sheet PDF and source coordinate grids. The application
does not import it. Device locations are not a production lookup table.

Each reference records a symbol centre in original PDF points, its legend subtype,
and its room. The evaluator performs a one-to-one spatial match within 6 PDF points
and separately reports wrong types, wrong rooms, misses and extras. Annotation
coordinates are hand-read, so the distance threshold is a matching tolerance rather
than a claim of survey-grade positional accuracy.

## Scope and interpretation

- This is an **agent-assisted, in-sample source audit**, not an independent human
  estimator's certified count or a held-out benchmark for other drawing styles.
- All electrical device symbols in the electrical viewports are included. Legend
  examples, mechanical plans, plumbing fixtures, structural columns, keynote
  labels and the watermark are excluded.
- B32 identifies the electrical panel; B38 is HVAC equipment and its *electrical
  outlet*, when drawn, is counted rather than inventing a second electrical device.
- The fan's central J is part of the fan/prewire symbol, not an additional box.
- The unlabelled water-heater cupboards use the explicit review name
  `Equipment alcove (unlabelled)`. Open-plan zone divisions are documented review
  assumptions, visible as polygons; they are not inferred physical partitions.
- The attic circle is a service/lighting outlet with an unconfirmed fixture
  specification. It does not imply a supplied decorative light.

## Audit findings and reference corrections

The first source sweep exposed missing panels on all four sheets, mirrored wall
lights on Plan 4, the three-prong microwave outlet on Plan 3, and the second laundry
outlet on Plan 4. It also exposed incorrect open-plan and hallway room assignments.

High-resolution source crops in `dogfood-evidence/audit-*.png` were then used to
correct approximate annotation coordinates, not to copy prediction coordinates.
In particular:

- Plan 2's sink faucet is **not** a wall light; the initial annotation was removed
  after inspecting `bath2-raw.png`. Its electrical panel centre is at the outlined
  rectangle, not at the keynote arrow.
- Plan 2's kitchen GFI/DW locations and switch-tag spacing were corrected from
  enlarged source crops.
- Plan 3 has an additional east-wall AFI outlet near y=625, confirmed in the source.
- Plan 4's laundry has the **240V on the left and GFI on the right**; these were
  corrected from the actual printed tags. East-wall coordinate estimates were also
  corrected using the source grid.

Run `py scripts/evaluate_accuracy.py` after generating fresh analysis artifacts.
A zero-exit audit requires every annotated location, class and room to match, with
no extra predictions. The report is `dogfood-evidence/accuracy-audit.json`.
