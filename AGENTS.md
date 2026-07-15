# AGENTS.md

## Cursor Cloud specific instructions

`dimensional` is a single client-side React 19 + Vite 8 + TypeScript SPA (a floor-plan furniture simulator). There is no backend, database, or environment variables; all state persists in browser `localStorage` (key `dimensional.plan.v2`).

Standard commands live in `package.json` (`dev`, `build`, `lint`, `preview`); run them with `npm run <script>`.

Non-obvious notes:
- The dev server (`npm run dev`) serves on Vite's default port `5173` (not overridden in `vite.config.ts`).
- There is no dedicated type-check script; type-checking runs as part of `npm run build` (`tsc -b && vite build`).
- There is no automated test suite configured; validate changes manually in the browser or by adding a test runner.
- Lint uses `oxlint` (config in `.oxlintrc.json`), not ESLint.
