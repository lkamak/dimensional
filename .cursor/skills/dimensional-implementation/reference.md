# Dimensional draw elements — reference

## Primary files

| File | Role |
|------|------|
| `src/components/PlanCanvas.tsx` | Drawing, preview, commit, drag, render |
| `src/types.ts` | `DrawElement`, `DrawElementKind` |
| `src/App.tsx` | Plan state, `handleElementAdd`, vectorize import |
| `src/components/Inspector.tsx` | Selected element length/display |
| `src/storage.ts` | `localStorage` read/write |
| `src/vectorize.ts` | Image → wall segment conversion |

## `PlanCanvas.tsx` functions

- `normalizeRect(x1, y1, x2, y2)` — bounding-box min/max; use for `room` and `rect` only on commit
- `drawKindFromTool(toolMode)` — maps toolbar mode to `DrawElementKind`
- `renderDraftPreview()` — live preview while drawing; already uses raw endpoints for wall/line
- `renderElementShape()` — committed elements; wall/line as `Line`, room/rect as `Rect` + normalize
- `commitDrawElement()` — **commit boundary**; where coordinate semantics must be correct

## Acceptance criteria template

Copy and adapt for draw-tool tickets:

```markdown
## Acceptance criteria

- [ ] Wall negative-slope diagonal matches draft preview after commit
- [ ] Line negative-slope diagonal matches draft preview after commit
- [ ] Positive-slope, horizontal, and vertical wall/line unchanged
- [ ] Room and rect still normalize from any drag direction
- [ ] Select + drag preserves line angle and length
- [ ] Orientation survives reload and save/load
- [ ] Segments under 4 px still rejected
- [ ] Vectorized walls and existing plans load without errors
```

## Example: negative-slope wall bug

**Symptom:** Preview shows down-left diagonal; committed wall flips to down-right.

**Root cause:** `commitDrawElement()` always called `normalizeRect()`.

**Fix:** Branch on `kind === "wall" || kind === "line"`; skip normalization for line-like kinds.

**Regression scope:** All four draw tools + persistence. No schema change.
