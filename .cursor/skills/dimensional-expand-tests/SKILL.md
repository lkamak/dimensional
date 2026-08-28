---
name: dimensional-expand-tests
description: Expands existing Vitest unit and integration tests to cover new or changed dimensional app behavior. Use proactively after implementing a feature, bug fix, refactor, or new function/component — not only when the user asks for tests. Follows the same convention of existing tests, expanding the tests to any new feature/functionality added.
---

# dimensional-expand-tests

Follow the same convention of existing tests, expanding the tests to any new feature/functionality added.

Apply this after you change application code. Do not wait for the user to ask. If you added or changed behavior and skipped tests, you are not done.

For first-time Vitest bootstrap (no runner, no `*.test.ts(x)`), follow [dimensional-test](../dimensional-test/SKILL.md) then return here.

## When to apply

Use when **any** of these is true:

- You implemented a feature, bug fix, or refactor in this repo
- You added a function, module, component, storage key, or user-visible flow
- Existing tests would fail or go stale because behavior changed
- The user mentions tests, coverage, or regressions

Skip only when the change cannot affect runtime behavior (docs, comments, skills, agents).

## Workflow

1. **Diff the behavior** — list new/changed exports, UI flows, and persistence. Ignore private helpers unless they are the bug.
2. **Find the template** — open the sibling `*.test.ts` / `*.test.tsx` (or `*.integration.test.tsx`). If none, copy the nearest existing test file’s imports, `describe` grouping, and setup.
3. **Match conventions** — same runner, file names, assertion style, and Testing Library patterns already in the tree. Do not introduce Jest, Playwright, or a new folder layout.
4. **Expand** — add cases for the new behavior; update assertions when behavior intentionally changed; do not delete coverage without replacing it.
5. **Run** — `npm test`. Fix failures before finishing.

## Conventions to copy (verify in-repo; do not invent)

Inspect existing tests first. Typical layout for this SPA:

| Kind | Files | What they cover |
|------|--------|-----------------|
| Unit | colocated `src/*.test.ts` | `units.ts`, `storage.ts`, `vectorize.ts`, catalog logic |
| Integration | colocated `src/components/*.test.tsx` or `*.integration.test.tsx` | RTL: CatalogRail, Inspector, TopBar, PlanLibraryModal, EmptyState |

- Vitest: `describe` / `it` / `expect`; `vi.fn()` for callbacks
- Integration: `@testing-library/react` + `userEvent`; query by real accessible names in the component
- `localStorage`: `beforeEach(() => localStorage.clear())` for storage/session tests (`dimensional.session.v2`, `dimensional.library.*`, legacy `dimensional.plan.v1` / `v2`)
- Canvas/Konva: test exported helpers and callbacks, not pixels
- TypeScript: `verbatimModuleSyntax`, type-only imports

If zero tests exist yet, use those rows as the default and create colocated files.

## What to add

- **New pure function** → cases in the sibling unit file (happy path, edge, round-trip if conversion/parse).
- **Changed return/format** → update the old assertion; add a case that locks the new contract.
- **New UI control/flow** → integration test: render, interact, assert visible result or callback.
- **New persistence/migration** → unit tests for load/save/legacy keys and `StorageResult` errors.

## Done

- [ ] New/changed behavior has tests in the existing style
- [ ] Stale assertions updated, coverage not dropped
- [ ] `npm test` passes
