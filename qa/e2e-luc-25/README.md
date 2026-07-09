# LUC-25 E2E verification

Playwright headless verification of [LUC-25](https://linear.app/lucaskamakura/issue/LUC-25/add-left-mouse-drag-to-pan-for-the-blueprint-canvas) against PR #5 (`bf603bf`).

## Run

```bash
npm run dev -- --host 127.0.0.1 --port 5173
node qa/e2e-luc-25/verify-luc-25.mjs
```

## Artifacts

See `artifacts/` for screenshots, `luc-25-e2e.gif`, `luc-25-e2e.webm`, and `results.json`.
