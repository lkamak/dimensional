---
name: dimensional-test
description: Create or update unit and integration tests for the dimensional floor-plan SPA. Use when the user asks to add tests, write tests, cover a module, or set up Vitest for this repository.
---

# dimensional-test

Create and update **unit** and **integration** tests for this React 19 + Vite 8 + TypeScript SPA. Prefer Vitest (native Vite integration). There may be no test runner yet — bootstrap it when missing.

## When to use

- User asks to add, update, or fix tests
- A code change needs coverage (new logic in `units`, `storage`, `vectorize`, components)
- User asks to set up a test suite

## Bootstrap (if missing)

If `vitest` is not in `package.json` / no `*.test.ts(x)` exist:

1. Install: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
2. Add `vitest/config` to `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
```

3. Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

4. Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

5. Do **not** invent a second runner (Jest, Playwright) unless the user asks. No E2E browser suite by default.

## File layout

| Kind | Location | Naming |
|------|----------|--------|
| Unit | Colocated next to source | `units.test.ts`, `storage.test.ts` |
| Integration | Colocated or `src/**/*.integration.test.tsx` | `TopBar.integration.test.tsx` |

Prefer colocated `*.test.ts` / `*.test.tsx` under `src/`.

## Unit vs integration

**Unit** — pure modules, no React tree, mock `localStorage` when needed:

| Module | Focus |
|--------|--------|
| `src/units.ts` | Imperial/metric conversion, formatting, round-trips |
| `src/storage.ts` | Parse/migrate/save/load, legacy keys, `StorageResult` errors |
| `src/vectorize.ts` | Geometry / convert-to-drawing helpers |
| `src/catalog.ts` | Preset shape/invariants if logic is added |

**Integration** — React Testing Library: render components (or thin App slices) with real props/state helpers; assert user-visible behavior.

| Area | Paths |
|------|--------|
| App / state | `src/App.tsx`, `src/types.ts` |
| Catalog UI | `src/components/CatalogRail.tsx` |
| Inspector | `src/components/Inspector.tsx` |
| Top bar / units | `src/components/TopBar.tsx` |
| Plan library | `src/components/PlanLibraryModal.tsx` |
| Empty upload | `src/components/EmptyState.tsx` |

**Canvas (`PlanCanvas.tsx` / Konva)**: prefer testing exported helpers and props-driven behavior. Avoid brittle pixel/stage assertions unless the bug is canvas-specific; then keep assertions high-level (callbacks fired, selection updated).

## Writing rules

1. Match existing TypeScript style (`verbatimModuleSyntax`, type-only imports).
2. Clear `localStorage` in `beforeEach` for storage/session tests. Keys include `dimensional.session.v2`, `dimensional.library.*`, legacy `dimensional.plan.v1` / `v2`.
3. Prefer behavior assertions over implementation details.
4. One concern per test file section; name tests after the behavior (`formats 84 in as 7'`).
5. Update tests when changing behavior; do not delete coverage without replacing it.
6. After adding/changing tests, run `npm test` and fix failures before finishing.

## Unit example

```ts
import { describe, expect, it } from "vitest";
import { formatImperial, inchesToDisplayValue } from "./units";

describe("formatImperial", () => {
  it("formats whole feet", () => {
    expect(formatImperial(84)).toBe("7'");
  });
});

describe("inchesToDisplayValue", () => {
  it("converts to cm for metric", () => {
    expect(inchesToDisplayValue(10, "metric")).toBe(25.4);
  });
});
```

## Integration example

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("invokes onFile when a file is chosen", async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    render(<EmptyState onFile={onFile} />);
    // interact with the real file input / button labels in the component
    expect(onFile).toHaveBeenCalled();
  });
});
```

Adapt selectors to actual accessible names in the component — do not invent UI copy.

## Done checklist

- [ ] Unit and/or integration tests match the change
- [ ] Runner + scripts exist if this was first test work
- [ ] `npm test` passes
- [ ] No Playwright/Cypress unless requested
