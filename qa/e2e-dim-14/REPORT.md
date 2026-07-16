# DIM-14 E2E verification

- PR: #16
- Commit: `5001153a5170ddbd03aa0afaf4152a8bb3c1885c`
- Verdict: **APPROVE** (7 pass / 0 fail)

| ID | Result | Criterion | Detail |
|----|--------|-----------|--------|
| AC1 | PASS | With imperial units selected, the calibration modal labels the field Length (ft). | label="Length (ft)" |
| AC2 | PASS | The imperial placeholder/example communicates that entering 10 represents a 10-foot wall. | placeholder="e.g. 10 for 10 ft wall" |
| AC3 | PASS | Entering 10 for a 120-pixel calibration line sets the scale to 1 pixel per inch (equivalent to 12 pixels per foot). | pixelsPerInch=1.001984126984127, scaleUI="Scale set · 1 in = 1.0 px" |
| AC4 | PASS | Positive decimal feet values such as 10.5 are accepted and converted correctly. | 10.5 ft on 126px line => pixelsPerInch=1.0015117157974303 (expect ~1.0) |
| AC5 | PASS | Invalid, zero, and negative values remain rejected. | modalStay={zero:true,neg:true,empty:true,invalid:true}, ppiUnchanged=1.0015117157974303 |
| AC6 | PASS | Metric calibration remains unchanged and continues to accept centimeters. | label="Length (cm)", placeholder="e.g. 300 for 3 m wall", unit=metric, ppi=1.001984126984127 |
| AC7 | PASS | Furniture inspector values and existing saved-plan scale data remain inch-based and are not reinterpreted. | preservedPpi=2.5 (seeded 2.5), widthLabel="WIDTH (IN)", depthLabel="DEPTH (IN)", widthInput=84, sofa.widthIn=84 |
