import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(__dirname, "artifacts");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const COMMIT =
  process.env.GIT_COMMIT ||
  execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

fs.mkdirSync(ARTIFACTS, { recursive: true });

const results = [];
function record(id, criterion, pass, detail) {
  results.push({ id, criterion, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${criterion} — ${detail}`);
}

async function pause(page, ms = 1200) {
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(ARTIFACTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

/** Bind window.__qaStage via React fiber walk (Konva module is scoped). */
async function bindStage(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".canvas-area");
    if (!root) return false;
    const fiberKey = Object.keys(root).find((k) =>
      k.startsWith("__reactFiber"),
    );
    if (!fiberKey) return false;
    const found = [];
    function walk(n, depth) {
      if (!n || depth > 40 || found.length) return;
      let s = n.memoizedState;
      let hookIdx = 0;
      while (s && hookIdx < 40) {
        const memo = s.memoizedState;
        if (
          memo &&
          typeof memo === "object" &&
          memo.current &&
          typeof memo.current.x === "function" &&
          typeof memo.current.scaleX === "function" &&
          typeof memo.current.container === "function"
        ) {
          found.push(memo.current);
          window.__qaStage = memo.current;
          return;
        }
        s = s.next;
        hookIdx++;
      }
      walk(n.child, depth + 1);
      walk(n.sibling, depth + 1);
    }
    walk(root[fiberKey], 0);
    return found.length > 0;
  });
}

/**
 * Read PlanCanvas drawDraft from React fiber hooks.
 * Hook order in PlanCanvas: scale, position, spaceDown, drawDraft, ...
 */
async function getDrawDraft(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const root = document.querySelector(".canvas-area");
    if (!root) return null;
    const fiberKey = Object.keys(root).find((k) =>
      k.startsWith("__reactFiber"),
    );
    if (!fiberKey) return null;

    let draft = null;
    function walk(n, depth) {
      if (!n || depth > 50 || draft) return;
      // Look for useState value shaped like drawDraft
      let s = n.memoizedState;
      let hookIdx = 0;
      while (s && hookIdx < 50) {
        const v = s.memoizedState;
        if (
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof v.kind === "string" &&
          v.start &&
          typeof v.start.x === "number" &&
          typeof v.start.y === "number" &&
          ("end" in v)
        ) {
          draft = {
            kind: v.kind,
            start: { x: v.start.x, y: v.start.y },
            end: v.end
              ? { x: v.end.x, y: v.end.y }
              : null,
          };
          return;
        }
        s = s.next;
        hookIdx++;
      }
      walk(n.child, depth + 1);
      walk(n.sibling, depth + 1);
    }
    walk(root[fiberKey], 0);
    return draft;
  });
}

/** Find draft preview Konva Line (opacity 0.65, listening false). */
async function getDraftPreviewLine(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return null;
    const lines = [];
    stage.find("Line").forEach((node) => {
      const opacity = node.opacity();
      const listening = node.listening();
      if (Math.abs(opacity - 0.65) < 0.02 && listening === false) {
        const pts = node.points();
        lines.push({
          points: pts.slice(),
          stroke: node.stroke(),
          strokeWidth: node.strokeWidth(),
          lineCap: node.lineCap(),
          dash: node.dash(),
          opacity,
        });
      }
    });
    return lines[0] || null;
  });
}

async function getStageScale(page) {
  await bindStage(page);
  return page.evaluate(() => window.__qaStage?.scaleX() ?? 1);
}

async function worldToScreen(page, worldX, worldY) {
  await bindStage(page);
  return page.evaluate(
    ({ worldX, worldY }) => {
      const canvas = document.querySelector(".canvas-area canvas");
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const stage = window.__qaStage;
      if (!stage) {
        return {
          x: rect.left + worldX,
          y: rect.top + worldY,
        };
      }
      const scale = stage.scaleX();
      const pos = stage.position();
      return {
        x: rect.left + pos.x + worldX * scale,
        y: rect.top + pos.y + worldY * scale,
      };
    },
    { worldX, worldY },
  );
}

async function clickWorld(page, worldX, worldY) {
  const pt = await worldToScreen(page, worldX, worldY);
  if (!pt) throw new Error(`Could not map world (${worldX},${worldY})`);
  await page.mouse.click(pt.x, pt.y, { delay: 40 });
  return pt;
}

async function moveWorld(page, worldX, worldY, steps = 16) {
  const pt = await worldToScreen(page, worldX, worldY);
  if (!pt) throw new Error(`Could not map world (${worldX},${worldY})`);
  await page.mouse.move(pt.x, pt.y, { steps });
  return pt;
}

function getElements(page) {
  return page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("dimensional.session.v2") || "null",
    );
    return session?.plan?.elements ?? [];
  });
}

function approxEqual(a, b, tol = 3) {
  return Math.abs(a - b) <= tol;
}

async function selectTool(page, toolLabel) {
  await page.getByRole("button", { name: new RegExp(`^${toolLabel}$`, "i") }).click();
  await pause(page, 700);
}

async function makeGifFromWebm(webmPath, gifPath) {
  try {
    execSync(
      `ffmpeg -y -i ${JSON.stringify(webmPath)} -vf "fps=8,scale=960:-1:flags=lanczos" -loop 0 ${JSON.stringify(gifPath)}`,
      { stdio: "pipe" },
    );
    return true;
  } catch {
    return false;
  }
}

async function startBlankPlan(page) {
  const drawPlanBtn = page.getByRole("button", { name: /^Draw a plan$/i });
  if (await drawPlanBtn.isVisible().catch(() => false)) {
    await drawPlanBtn.click();
  } else {
    await page.getByRole("button", { name: /^Draw plan$/i }).click();
  }
  await pause(page, 1500);
  await page.locator(".canvas-area canvas").first().waitFor({
    state: "visible",
    timeout: 8000,
  });
  await bindStage(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: ARTIFACTS, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1500);
    await shot(page, "01-empty");

    await startBlankPlan(page);
    await shot(page, "02-blank-canvas");

    // ========== AC1 + AC2: Wall preview visible + tracks cursor ==========
    await selectTool(page, "Wall");
    const origin = { x: 280, y: 220 };
    await clickWorld(page, origin.x, origin.y);
    await pause(page, 900);

    // First move — should create preview end
    const p1 = { x: 480, y: 220 };
    await moveWorld(page, p1.x, p1.y, 20);
    await pause(page, 1000);
    await shot(page, "03-wall-preview-east");

    let draft = await getDrawDraft(page);
    let preview = await getDraftPreviewLine(page);
    const ac1 =
      draft &&
      draft.kind === "wall" &&
      approxEqual(draft.start.x, origin.x) &&
      approxEqual(draft.start.y, origin.y) &&
      draft.end != null &&
      preview != null &&
      preview.stroke === "#3d5a5b" &&
      preview.lineCap === "square" &&
      Math.abs(preview.opacity - 0.65) < 0.02;
    record(
      "AC1",
      "After first Wall click, preview line visible from origin to mouse",
      Boolean(ac1),
      draft
        ? `draft=${JSON.stringify(draft)} previewStroke=${preview?.stroke} cap=${preview?.lineCap} sw=${preview?.strokeWidth?.toFixed?.(2)}`
        : "no draft",
    );

    // Multiple direction changes — preview must follow each time
    const path = [
      { x: 480, y: 380 }, // south-east
      { x: 200, y: 400 }, // south-west
      { x: 180, y: 160 }, // north-west
      { x: 520, y: 160 }, // north-east
    ];
    const trackedEnds = [];
    for (let i = 0; i < path.length; i++) {
      await moveWorld(page, path[i].x, path[i].y, 18);
      await pause(page, 900);
      draft = await getDrawDraft(page);
      trackedEnds.push(draft?.end ? { ...draft.end } : null);
      await shot(page, `04-wall-dir-${i + 1}`);
    }

    const elementsDuringPreview = await getElements(page);
    // World↔screen mapping has fit-scale error; require each sample near target
    // and consecutive samples to move substantially in different directions.
    const nearTarget = trackedEnds.every(
      (end, i) =>
        end &&
        approxEqual(end.x, path[i].x, 35) &&
        approxEqual(end.y, path[i].y, 35),
    );
    const moves = [];
    for (let i = 1; i < trackedEnds.length; i++) {
      const a = trackedEnds[i - 1];
      const b = trackedEnds[i];
      if (!a || !b) continue;
      moves.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    const movedEnough = moves.length >= 3 && moves.every((d) => d > 80);
    const notPersisted = elementsDuringPreview.length === 0;
    const originFixed =
      draft &&
      approxEqual(draft.start.x, origin.x, 8) &&
      approxEqual(draft.start.y, origin.y, 8);

    record(
      "AC2",
      "Preview endpoint updates on every mousemove across direction changes",
      Boolean(nearTarget && movedEnough && notPersisted && originFixed),
      `nearTarget=${nearTarget} movedEnough=${movedEnough} moveDists=${moves.map((d) => d.toFixed(0)).join(",")} persistedElements=${elementsDuringPreview.length} ends=${JSON.stringify(trackedEnds)}`,
    );

    // ========== AC3: styling + thickness across zoom ==========
    await moveWorld(page, 450, 300, 12);
    await pause(page, 700);
    const scaleBefore = await getStageScale(page);
    preview = await getDraftPreviewLine(page);
    const swBefore = preview?.strokeWidth;
    const expectedBefore = 8 / scaleBefore;

    // Zoom in via wheel over canvas center
    const canvasBox = await page.locator(".canvas-area canvas").boundingBox();
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -120);
      await pause(page, 250);
    }
    await pause(page, 800);
    await moveWorld(page, 450, 300, 8);
    await pause(page, 700);
    const scaleAfterZoomIn = await getStageScale(page);
    preview = await getDraftPreviewLine(page);
    const swZoomIn = preview?.strokeWidth;
    const expectedZoomIn = 8 / scaleAfterZoomIn;

    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 120);
      await pause(page, 250);
    }
    await pause(page, 800);
    await moveWorld(page, 450, 300, 8);
    await pause(page, 700);
    await shot(page, "05-wall-preview-zoom");
    const scaleAfterZoomOut = await getStageScale(page);
    preview = await getDraftPreviewLine(page);
    const swZoomOut = preview?.strokeWidth;
    const expectedZoomOut = 8 / scaleAfterZoomOut;

    const styleOk =
      preview &&
      preview.stroke === "#3d5a5b" &&
      preview.lineCap === "square" &&
      Math.abs(preview.opacity - 0.65) < 0.02;
    const thicknessOk =
      Math.abs(swBefore - expectedBefore) < 0.15 &&
      Math.abs(swZoomIn - expectedZoomIn) < 0.15 &&
      Math.abs(swZoomOut - expectedZoomOut) < 0.15 &&
      scaleAfterZoomIn > scaleBefore * 1.2;
    // Screen-relative thickness: world strokeWidth * scale ≈ 8
    const screenThicknessStable =
      Math.abs(swBefore * scaleBefore - 8) < 0.3 &&
      Math.abs(swZoomIn * scaleAfterZoomIn - 8) < 0.3 &&
      Math.abs(swZoomOut * scaleAfterZoomOut - 8) < 0.3;

    record(
      "AC3",
      "Preview uses wall styling and consistent on-screen thickness across zoom",
      Boolean(styleOk && thicknessOk && screenThicknessStable),
      `scales=${scaleBefore.toFixed(2)}→${scaleAfterZoomIn.toFixed(2)}→${scaleAfterZoomOut.toFixed(2)} sw=${swBefore?.toFixed?.(2)}/${swZoomIn?.toFixed?.(2)}/${swZoomOut?.toFixed?.(2)} screenPx≈${(swBefore * scaleBefore).toFixed(2)}`,
    );

    // ========== AC4: second click commits one wall and clears preview ==========
    // Reset zoom roughly and commit
    const commitEnd = { x: 520, y: 340 };
    await moveWorld(page, commitEnd.x, commitEnd.y, 14);
    await pause(page, 900);
    await clickWorld(page, commitEnd.x, commitEnd.y);
    await pause(page, 1200);
    await shot(page, "06-wall-committed");

    draft = await getDrawDraft(page);
    preview = await getDraftPreviewLine(page);
    let elements = await getElements(page);
    const walls = elements.filter((e) => e.kind === "wall");
    const committed = walls[0];
    const ac4 =
      walls.length === 1 &&
      draft == null &&
      preview == null &&
      committed &&
      approxEqual(committed.x1, origin.x, 8) &&
      approxEqual(committed.y1, origin.y, 8) &&
      approxEqual(committed.x2, commitEnd.x, 12) &&
      approxEqual(committed.y2, commitEnd.y, 12);

    record(
      "AC4",
      "Second click creates exactly one committed wall and clears preview",
      Boolean(ac4),
      `walls=${walls.length} draft=${draft} preview=${!!preview} wall=${committed ? `(${committed.x1.toFixed(1)},${committed.y1.toFixed(1)})→(${committed.x2.toFixed(1)},${committed.y2.toFixed(1)})` : "none"}`,
    );

    // ========== AC5: Escape / tool change cancel without persisting ==========
    const countBeforeCancel = (await getElements(page)).length;
    await selectTool(page, "Wall");
    await clickWorld(page, 120, 120);
    await pause(page, 700);
    await moveWorld(page, 300, 280, 16);
    await pause(page, 900);
    await shot(page, "07-draft-before-escape");
    draft = await getDrawDraft(page);
    preview = await getDraftPreviewLine(page);
    const hadDraft = Boolean(draft?.end || preview);

    // Focus the page without clicking the stage (a stage click would commit the draft).
    await page.evaluate(() => window.focus());
    await page.keyboard.press("Escape");
    await pause(page, 1000);
    await shot(page, "08-after-escape");
    // Prefer visible signals: tool mode + Konva preview. Fiber memoizedState can
    // briefly retain a stale draft shape after the preview nodes are gone.
    const previewAfterEsc = await getDraftPreviewLine(page);
    const selectActive = await page
      .getByRole("button", { name: /^Select$/i })
      .evaluate((el) => el.classList.contains("btn-active"));
    let countAfterEscape = (await getElements(page)).length;
    const escapeOk =
      hadDraft &&
      previewAfterEsc == null &&
      selectActive &&
      countAfterEscape === countBeforeCancel;

    // Tool switch cancel
    await selectTool(page, "Wall");
    await clickWorld(page, 140, 400);
    await pause(page, 700);
    await moveWorld(page, 320, 480, 16);
    await pause(page, 900);
    draft = await getDrawDraft(page);
    preview = await getDraftPreviewLine(page);
    const hadDraft2 = Boolean(draft?.end || preview);
    await selectTool(page, "Line");
    await pause(page, 800);
    await shot(page, "09-after-tool-switch");
    const previewAfterTool = await getDraftPreviewLine(page);
    const lineToolActive = await page
      .getByRole("button", { name: /^Line$/i })
      .evaluate((el) => el.classList.contains("btn-active"));
    const countAfterTool = (await getElements(page)).length;
    const toolSwitchOk =
      hadDraft2 &&
      previewAfterTool == null &&
      lineToolActive &&
      countAfterTool === countBeforeCancel;

    record(
      "AC5",
      "Escape or tool change clears preview without adding/persisting element",
      Boolean(escapeOk && toolSwitchOk),
      `escapeOk=${escapeOk} (hadDraft=${hadDraft} selectActive=${selectActive} previewAfterEsc=${!!previewAfterEsc}) toolSwitchOk=${toolSwitchOk} (previewAfterTool=${!!previewAfterTool}) counts=${countBeforeCancel}/${countAfterEscape}/${countAfterTool}`,
    );

    // ========== AC6: sub-4px wall not committed ==========
    const countBeforeShort = (await getElements(page)).length;
    await selectTool(page, "Wall");
    await clickWorld(page, 600, 120);
    await pause(page, 700);
    await moveWorld(page, 602, 121, 8);
    await pause(page, 700);
    await clickWorld(page, 602, 121);
    await pause(page, 1000);
    await shot(page, "10-short-wall-rejected");
    const countAfterShort = (await getElements(page)).length;
    draft = await getDrawDraft(page);
    record(
      "AC6",
      "Wall shorter than 4px minimum is not committed",
      countAfterShort === countBeforeShort,
      `elementCount before=${countBeforeShort} after=${countAfterShort} draftStillActive=${!!draft}`,
    );

    // Clear any leftover short-wall draft before Line tests
    await page.keyboard.press("Escape");
    await pause(page, 800);

    // ========== AC7: Line tool preview follows continuously ==========
    await selectTool(page, "Line");
    const lineOrigin = { x: 200, y: 500 };
    await clickWorld(page, lineOrigin.x, lineOrigin.y);
    await pause(page, 800);
    const linePath = [
      { x: 400, y: 500 },
      { x: 420, y: 620 },
      { x: 160, y: 640 },
      { x: 180, y: 480 },
    ];
    const lineEnds = [];
    for (let i = 0; i < linePath.length; i++) {
      await moveWorld(page, linePath[i].x, linePath[i].y, 16);
      await pause(page, 850);
      draft = await getDrawDraft(page);
      lineEnds.push(draft?.end ? { ...draft.end } : null);
      if (i === 1) await shot(page, "11-line-preview-tracking");
    }
    preview = await getDraftPreviewLine(page);
    const lineNear = lineEnds.every(
      (end, i) =>
        end &&
        approxEqual(end.x, linePath[i].x, 35) &&
        approxEqual(end.y, linePath[i].y, 35),
    );
    const lineMoves = [];
    for (let i = 1; i < lineEnds.length; i++) {
      const a = lineEnds[i - 1];
      const b = lineEnds[i];
      if (!a || !b) continue;
      lineMoves.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    const lineMovedEnough =
      lineMoves.length >= 3 && lineMoves.every((d) => d > 80);
    const lineStyleOk =
      draft?.kind === "line" &&
      preview &&
      preview.stroke === "#3d5a5b" &&
      Array.isArray(preview.dash) &&
      preview.dash.length > 0;
    const elementsDuringLine = await getElements(page);
    const lineNotPersisted =
      elementsDuringLine.filter((e) => e.kind === "line").length === 0;

    // Commit the line to show final state
    const lineCommit = linePath[linePath.length - 1];
    await clickWorld(page, lineCommit.x, lineCommit.y);
    await pause(page, 1100);
    await shot(page, "12-line-committed");
    const lines = (await getElements(page)).filter((e) => e.kind === "line");

    record(
      "AC7",
      "Shared Line tool preview also follows the cursor continuously",
      Boolean(lineNear && lineMovedEnough && lineStyleOk && lineNotPersisted && lines.length === 1),
      `near=${lineNear} movedEnough=${lineMovedEnough} moveDists=${lineMoves.map((d) => d.toFixed(0)).join(",")} styleOk=${lineStyleOk} notPersisted=${lineNotPersisted} lines=${lines.length} ends=${JSON.stringify(lineEnds)}`,
    );

    await pause(page, 1500);
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      const destWebm = path.join(ARTIFACTS, "dim-20-wall-preview.webm");
      fs.renameSync(videoPath, destWebm);
      const destGif = path.join(ARTIFACTS, "dim-20-wall-preview.gif");
      const gifOk = await makeGifFromWebm(destWebm, destGif);
      console.log(`Video: ${destWebm}`);
      console.log(`GIF: ${gifOk ? destGif : "conversion failed"}`);
    }
  }

  const summary = {
    commit: COMMIT,
    prd: "DIM-20",
    pr: 14,
    results,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    consoleErrors,
  };
  fs.writeFileSync(
    path.join(ARTIFACTS, "results.json"),
    JSON.stringify(summary, null, 2),
  );

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0 || results.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
