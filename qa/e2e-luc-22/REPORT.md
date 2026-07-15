# LUC-22 E2E verification — PR #4

**PRD:** [LUC-22](https://linear.app/lucaskamakura/issue/LUC-22/convert-uploaded-floor-plan-image-into-editable-drawing)  
**PR head:** `c09aa16` (Fix stale floor plan conversion previews)  
**Change type:** Frontend-only (client-side vectorization; no backend)  
**Verdict:** **APPROVE** — 6/6 acceptance criteria PASS

## QA summary

Playwright headless Chromium exercised the hybrid convert flow on a high-contrast blueprint fixture: upload → calibrate → place furniture → Convert (cancel) → Convert (accept) → underlay toggle → select/delete converted wall → hand-draw wall with shared Wall tool. `npm run lint` and `npm run build` also passed.

## Acceptance criteria

| ID | Criterion | Result |
|----|-----------|--------|
| AC1 | User can convert an uploaded plan image into editable vector geometry | PASS — detected 6 walls, accepted into `DrawElement` walls |
| AC2 | Converted geometry uses the same data model/tools as hand-drawn plans | PASS — `kind:"wall"` DrawElements; Wall tool adds another segment |
| AC3 | User can edit/delete converted elements after conversion | PASS — Wall segment inspector + Delete (7→6 walls) |
| AC4 | Original image remains available as underlay or can be hidden | PASS — Hide/Show underlay; opacity 0.35 after accept |
| AC5 | Failed/poor conversion does not destroy image/furniture without confirmation | PASS — Cancel keeps image + Sofa; accept keeps both |
| AC6 | Scale (`pixelsPerInch`) remains valid after conversion | PASS — PPI unchanged (~2.67) |

## Artifacts

See `qa/e2e-luc-22/artifacts/` (screenshots, preview GIF, full WebM, `results.json`).
