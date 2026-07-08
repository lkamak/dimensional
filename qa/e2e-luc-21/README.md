# LUC-21 E2E verification

PRD: [LUC-21](https://linear.app/lucaskamakura/issue/LUC-21/draw-floor-plans-without-requiring-an-upload)  
PR: https://github.com/lkamak/dimensional/pull/2  
Commit under test: `ea2cb70`

## Result: APPROVE (6/6 acceptance criteria)

Artifacts in `artifacts/`. Re-run with:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
node qa/e2e-luc-21/verify-luc-21.mjs
```
