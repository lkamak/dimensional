---
name: dimensional-implementation
description: Implements bug fixes and features in the dimensional floor-plan SPA using repo-specific draw-element semantics, validation commands, and browser regression checks. Use when implementing dimensional tickets, PlanCanvas draw-tool changes, coordinate/orientation bugs, or when the user asks to implement a plan for this repository.
---

# Dimensional Implementation

## Scope

Client-side React 19 + Vite 8 + TypeScript SPA. No backend. Plan state persists in browser `localStorage` (`dimensional.plan.v2`).

See [AGENTS.md](../../AGENTS.md) for dev commands and environment notes.

## Workflow

1. **Confirm the bug or feature** against the reported behavior. Read the triage/plan if one exists.
2. **Inspect draw paths first** when the issue involves walls, lines, rooms, or rects:
   - [`src/components/PlanCanvas.tsx`](../../src/components/PlanCanvas.tsx) — `commitDrawElement()`, `renderDraftPreview()`, `renderElementShape()`, `normalizeRect()`
   - [`src/types.ts`](../../src/types.ts) — `DrawElement`, `DrawElementKind`
   - [`src/App.tsx`](../../src/App.tsx) — `handleElementAdd()` stores coordinates unchanged
3. **Keep the diff minimal.** Match surrounding patterns; do not refactor unrelated code.
4. **Branch from `main`**, implement, commit with a focused message.
5. **Validate before finishing:**
   - `npm run lint`
   - `npm run build` (includes `tsc -b`)
   - Manual browser regression at `http://localhost:5173/` (no automated test suite)
6. **Push and open a PR** with lint/build results and browser evidence (screenshots or recording).

## Draw-element coordinate rules

`DrawElement` stores `(x1, y1, x2, y2)` for every kind, but semantics differ by kind:

| Kind | Semantics | Normalize on commit? |
|------|-----------|----------------------|
| `wall`, `line` | Oriented segment from first click to second | **No** — preserve raw `start`/`end` |
| `room`, `rect` | Axis-aligned bounding box | **Yes** — use `normalizeRect()` |

**Why:** `normalizeRect()` forces `(min x, min y)` → `(max x, max y)`. That is correct for rectangles but wrong for Konva `Line` segments: a down-left diagonal becomes the opposite down-right diagonal.

**Pattern in `commitDrawElement()`:**

```typescript
const isLineLike = kind === "wall" || kind === "line";
const coords = isLineLike
  ? { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
  : normalizeRect(start.x, start.y, end.x, end.y);
```

Preview and render already branch on kind; fix commit/storage when preview is correct but the committed element is wrong.

**Do not migrate legacy plans.** A previously normalized diagonal cannot be inferred back to the user's intended orientation.

## Manual regression checklist

When changing draw tools or coordinates, test all four tools in the browser:

- [ ] **Wall** — negative-slope diagonal (upper-right → lower-left) matches draft after commit
- [ ] **Line** — same negative-slope case
- [ ] **Wall / line** — positive-slope, horizontal, and vertical still correct
- [ ] **Room / rect** — drag from any corner produces the same axis-aligned box
- [ ] **Select + drag** — line-like elements keep angle and length
- [ ] **Persistence** — reload and save/load retain orientation
- [ ] **Short segments** — still rejected below the existing 4 px threshold in `commitDrawElement()`

Use **Draw plan** to get a blank canvas quickly. Start the dev server with `npm run dev` (port `5173`).

## Files usually safe to leave unchanged

These paths already support oriented line endpoints; change only if the ticket requires it:

- [`src/components/Inspector.tsx`](../../src/components/Inspector.tsx) — length uses Euclidean distance
- [`src/storage.ts`](../../src/storage.ts) — round-trips raw coordinates
- [`src/vectorize.ts`](../../src/vectorize.ts) — converted walls use oriented endpoints

## Common pitfall

Applying `normalizeRect()` to every `DrawElementKind` in `commitDrawElement()`. Any future resize or endpoint-editing work must continue to distinguish line-like vs rectangle-like kinds.

## Additional resources

- Draw-element file map and acceptance criteria template: [reference.md](reference.md)
