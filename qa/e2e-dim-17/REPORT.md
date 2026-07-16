# DIM-17 E2E Verification

- **PR:** #12
- **Commit:** `eac07154caa6b56f45650c7071e0113657fb5b55`
- **Verdict:** APPROVE

## Acceptance criteria

- ✅ **AC1** Negative-slope wall matches draft (upper-right → lower-left) — stored=(419.6,119.6)→(178.6,319.6) slope=-0.830
- ✅ **AC2** Negative-slope line matches draft — stored=(500.0,139.3)→(258.9,358.9)
- ✅ **AC3** Positive-slope, horizontal, and vertical walls/lines render correctly — posWall=true horizWall=true vertWall=true posLine=true horizLine=true vertLine=true
- ✅ **AC4** Rooms and rectangles normalize from any drag direction — room=(250,379)-(450,520) rect=(639,429)-(820,559)
- ✅ **AC5** Selecting and dragging corrected wall preserves angle and length — moved=true Δlen=0.00 Δang=0.0000 stillNeg=true
- ✅ **AC6** Negative-slope orientation survives reload and save/load — reloadOk=true openOk=true
- ✅ **AC7** Segments shorter than 4 px threshold are rejected — elementCount before=10 after=10
- ✅ **AC8** Vectorized/converted walls and legacy plans load without errors — hasVec=true hasLegacyNeg=true elements=1 consoleErrors=0
