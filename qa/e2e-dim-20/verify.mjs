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

async function moveWorld(page, worldX, worldY, steps = 10) {
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

/** Draft preview Lines use listening=false and opacity 0.65. */
async function getDraftPreviewLines(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return [];
    const out = [];
    stage.find("Line").forEach((node) => {
      if (node.listening()) return;
      if (Math.abs(node.opacity() - 0.65) > 0.05) return;
      const pts = node.points();
      if (!pts || pts.length < 4) return;
      out.push({
        x1: pts[0],
        y1: pts[1],
        x2: pts[2],
        y2: pts[3],
        stroke: node.stroke(),
        strokeWidth: node.strokeWidth(),
        lineCap: node.lineCap(),
        dash: node.dash() || [],
        opacity: node.opacity(),
      });
    });
    return out;
  });
}

async function getStageScale(page) {
  await bindStage(page);
  return page.evaluate(() => window.__qaStage?.scaleX() ?? 1);
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

    // Ensure Wall tool
    await page.getByRole("button", { name: /^Wall$/i }).click();
    await pause(page, 800);

    const origin = { x: 220, y: 180 };
    const dirA = { x: 420, y: 180 };
    const dirB = { x: 420, y: 360 };
    const dirC = { x: 180, y: 340 };
    const commitEnd = { x: 480, y: 280 };

    // --- AC1: preview visible after first click ---
    await clickWorld(page, origin.x, origin.y);
    await pause(page, 900);
    await moveWorld(page, dirA.x, dirA.y, 16);
    await pause(page, 1100);
    await shot(page, "03-wall-preview-after-first-click");
    let drafts = await getDraftPreviewLines(page);
    const wallDraft = drafts.find((d) => d.dash.length === 0);
    const ac1 =
      wallDraft &&
      approxEqual(wallDraft.x1, origin.x) &&
      approxEqual(wallDraft.y1, origin.y) &&
      approxEqual(wallDraft.x2, dirA.x) &&
      approxEqual(wallDraft.y2, dirA.y);
    record(
      "AC1",
      "After first Wall click, preview line is visible from origin to mouse",
      Boolean(ac1),
      wallDraft
        ? `preview=(${wallDraft.x1.toFixed(1)},${wallDraft.y1.toFixed(1)})→(${wallDraft.x2.toFixed(1)},${wallDraft.y2.toFixed(1)}) stroke=${wallDraft.stroke} opacity=${wallDraft.opacity}`
        : "no wall draft preview found",
    );

    // --- AC2: preview follows multiple direction changes ---
    await moveWorld(page, dirB.x, dirB.y, 18);
    await pause(page, 1100);
    await shot(page, "04-wall-preview-dir-b");
    drafts = await getDraftPreviewLines(page);
    const draftB = drafts.find((d) => d.dash.length === 0);
    const okB =
      draftB &&
      approxEqual(draftB.x1, origin.x) &&
      approxEqual(draftB.y1, origin.y) &&
      approxEqual(draftB.x2, dirB.x) &&
      approxEqual(draftB.y2, dirB.y);

    await moveWorld(page, dirC.x, dirC.y, 18);
    await pause(page, 1100);
    await shot(page, "05-wall-preview-dir-c");
    drafts = await getDraftPreviewLines(page);
    const draftC = drafts.find((d) => d.dash.length === 0);
    const okC =
      draftC &&
      approxEqual(draftC.x1, origin.x) &&
      approxEqual(draftC.y1, origin.y) &&
      approxEqual(draftC.x2, dirC.x) &&
      approxEqual(draftC.y2, dirC.y);

    // One more swing so the video shows continuous tracking
    await moveWorld(page, dirA.x, dirA.y + 40, 14);
    await pause(page, 900);
    await moveWorld(page, commitEnd.x, commitEnd.y, 16);
    await pause(page, 1000);
    await shot(page, "06-wall-preview-before-commit");
    drafts = await getDraftPreviewLines(page);
    const draftPreCommit = drafts.find((d) => d.dash.length === 0);
    const okPre =
      draftPreCommit &&
      approxEqual(draftPreCommit.x2, commitEnd.x) &&
      approxEqual(draftPreCommit.y2, commitEnd.y);

    record(
      "AC2",
      "Preview endpoint updates on every mousemove across direction changes",
      Boolean(okB && okC && okPre),
      `dirB=${okB} dirC=${okC} preCommit=${okPre} ends=[B:(${draftB?.x2?.toFixed?.(0)},${draftB?.y2?.toFixed?.(0)}) C:(${draftC?.x2?.toFixed?.(0)},${draftC?.y2?.toFixed?.(0)})]`,
    );

    // --- AC3: styling + thickness across zoom ---
    const styleOk =
      draftPreCommit &&
      draftPreCommit.stroke === "#3d5a5b" &&
      draftPreCommit.lineCap === "square" &&
      Math.abs(draftPreCommit.opacity - 0.65) < 0.05;
    const scaleBefore = await getStageScale(page);
    const swBefore = draftPreCommit?.strokeWidth ?? 0;
    const expectedBefore = 8 / scaleBefore;

    // Zoom with wheel at canvas center
    const canvasBox = await page.locator(".canvas-area canvas").boundingBox();
    await page.mouse.move(
      canvasBox.x + canvasBox.width / 2,
      canvasBox.y + canvasBox.height / 2,
    );
    await page.mouse.wheel(0, -400);
    await pause(page, 1000);
    await moveWorld(page, commitEnd.x, commitEnd.y, 8);
    await pause(page, 900);
    await shot(page, "07-wall-preview-zoomed");
    drafts = await getDraftPreviewLines(page);
    const draftZoomed = drafts.find((d) => d.dash.length === 0);
    const scaleAfter = await getStageScale(page);
    const swAfter = draftZoomed?.strokeWidth ?? 0;
    const expectedAfter = 8 / scaleAfter;
    const thicknessOk =
      Math.abs(swBefore - expectedBefore) < 0.2 &&
      Math.abs(swAfter - expectedAfter) < 0.2 &&
      scaleAfter !== scaleBefore &&
      // screen thickness ≈ strokeWidth * scale ≈ 8
      Math.abs(swBefore * scaleBefore - 8) < 0.5 &&
      Math.abs(swAfter * scaleAfter - 8) < 0.5;

    record(
      "AC3",
      "Preview uses existing wall styling and consistent on-screen thickness across zoom",
      Boolean(styleOk && thicknessOk),
      `styleOk=${styleOk} scale ${scaleBefore.toFixed(2)}→${scaleAfter.toFixed(2)} sw ${swBefore.toFixed(2)}→${swAfter.toFixed(2)} screenPx≈${(swAfter * scaleAfter).toFixed(2)}`,
    );

    // Reset zoom roughly by reloading blank? Better: continue and commit from current view
    // --- AC4: second click commits exactly one wall and clears preview ---
    const beforeCount = (await getElements(page)).length;
    await clickWorld(page, commitEnd.x, commitEnd.y);
    await pause(page, 1200);
    await shot(page, "08-wall-committed");
    const afterCommit = await getElements(page);
    drafts = await getDraftPreviewLines(page);
    const previewCleared = drafts.length === 0;
    const newWalls = afterCommit.filter((e) => e.kind === "wall");
    // normalizeRect preserves endpoints when end is SE of start
    const committed = newWalls.find(
      (w) =>
        approxEqual(w.x1, origin.x) &&
        approxEqual(w.y1, origin.y) &&
        approxEqual(w.x2, commitEnd.x) &&
        approxEqual(w.y2, commitEnd.y),
    );
    const ac4 =
      afterCommit.length === beforeCount + 1 &&
      Boolean(committed) &&
      previewCleared;
    record(
      "AC4",
      "Second click creates exactly one committed wall and clears preview",
      Boolean(ac4),
      `Δelements=${afterCommit.length - beforeCount} committed=${Boolean(committed)} previewCleared=${previewCleared} wall=${committed ? `(${committed.x1.toFixed(0)},${committed.y1.toFixed(0)})→(${committed.x2.toFixed(0)},${committed.y2.toFixed(0)})` : "none"}`,
    );

    // --- AC5: Escape / tool change clears without persisting ---
    await page.getByRole("button", { name: /^Wall$/i }).click();
    await pause(page, 600);
    const countEscBase = (await getElements(page)).length;
    await clickWorld(page, 120, 120);
    await pause(page, 700);
    await moveWorld(page, 260, 200, 12);
    await pause(page, 900);
    drafts = await getDraftPreviewLines(page);
    const hadPreview = drafts.some((d) => d.dash.length === 0);
    await page.keyboard.press("Escape");
    await pause(page, 900);
    await shot(page, "09-escape-clears-preview");
    drafts = await getDraftPreviewLines(page);
    const escCleared = drafts.length === 0;
    const escNoAdd = (await getElements(page)).length === countEscBase;

    // Tool-switch cancel
    await page.getByRole("button", { name: /^Wall$/i }).click();
    await pause(page, 500);
    await clickWorld(page, 140, 400);
    await pause(page, 700);
    await moveWorld(page, 300, 480, 12);
    await pause(page, 900);
    drafts = await getDraftPreviewLines(page);
    const hadPreview2 = drafts.some((d) => d.dash.length === 0);
    await page.getByRole("button", { name: /^Line$/i }).click();
    await pause(page, 900);
    await shot(page, "10-tool-switch-clears-preview");
    drafts = await getDraftPreviewLines(page);
    const toolCleared = drafts.length === 0;
    const toolNoAdd = (await getElements(page)).length === countEscBase;

    record(
      "AC5",
      "Escape or changing tools clears preview without adding/persisting an element",
      Boolean(hadPreview && escCleared && escNoAdd && hadPreview2 && toolCleared && toolNoAdd),
      `escape: had=${hadPreview} cleared=${escCleared} noAdd=${escNoAdd}; tool: had=${hadPreview2} cleared=${toolCleared} noAdd=${toolNoAdd}`,
    );

    // --- AC6: sub-4px wall not committed ---
    await page.getByRole("button", { name: /^Wall$/i }).click();
    await pause(page, 600);
    const countShortBase = (await getElements(page)).length;
    await clickWorld(page, 600, 120);
    await pause(page, 700);
    await moveWorld(page, 602, 121, 6);
    await pause(page, 800);
    await clickWorld(page, 602, 121); // dist ~2.2 < 4
    await pause(page, 1000);
    await shot(page, "11-short-wall-rejected");
    const countShortAfter = (await getElements(page)).length;
    // Cancel leftover draft (short reject returns early without clearing preview — pre-existing)
    await page.keyboard.press("Escape");
    await pause(page, 700);
    drafts = await getDraftPreviewLines(page);
    record(
      "AC6",
      "Wall shorter than 4px minimum is not committed",
      countShortAfter === countShortBase,
      `elementCount before=${countShortBase} after=${countShortAfter} (preview leftover cancelled via Escape)`,
    );

    // --- AC7: Line tool preview follows continuously ---
    await page.getByRole("button", { name: /^Line$/i }).click();
    await pause(page, 700);
    const lineOrigin = { x: 520, y: 400 };
    const lineA = { x: 700, y: 400 };
    const lineB = { x: 700, y: 560 };
    const lineC = { x: 540, y: 560 };
    await clickWorld(page, lineOrigin.x, lineOrigin.y);
    await pause(page, 800);
    await moveWorld(page, lineA.x, lineA.y, 14);
    await pause(page, 1000);
    drafts = await getDraftPreviewLines(page);
    const lineDraftA = drafts.find((d) => d.dash.length > 0);
    const lineOkA =
      lineDraftA &&
      approxEqual(lineDraftA.x1, lineOrigin.x) &&
      approxEqual(lineDraftA.y1, lineOrigin.y) &&
      approxEqual(lineDraftA.x2, lineA.x) &&
      approxEqual(lineDraftA.y2, lineA.y);

    await moveWorld(page, lineB.x, lineB.y, 14);
    await pause(page, 1000);
    await shot(page, "12-line-preview-tracking");
    drafts = await getDraftPreviewLines(page);
    const lineDraftB = drafts.find((d) => d.dash.length > 0);
    const lineOkB =
      lineDraftB &&
      approxEqual(lineDraftB.x2, lineB.x) &&
      approxEqual(lineDraftB.y2, lineB.y);

    await moveWorld(page, lineC.x, lineC.y, 14);
    await pause(page, 1000);
    await shot(page, "13-line-preview-dir-c");
    drafts = await getDraftPreviewLines(page);
    const lineDraftC = drafts.find((d) => d.dash.length > 0);
    const lineOkC =
      lineDraftC &&
      approxEqual(lineDraftC.x2, lineC.x) &&
      approxEqual(lineDraftC.y2, lineC.y);

    const lineCountBefore = (await getElements(page)).filter(
      (e) => e.kind === "line",
    ).length;
    await clickWorld(page, lineC.x, lineC.y);
    await pause(page, 1100);
    await shot(page, "14-line-committed");
    const lineCountAfter = (await getElements(page)).filter(
      (e) => e.kind === "line",
    ).length;
    drafts = await getDraftPreviewLines(page);

    record(
      "AC7",
      "Shared Line tool preview also follows the cursor continuously",
      Boolean(lineOkA && lineOkB && lineOkC && lineCountAfter === lineCountBefore + 1 && drafts.length === 0),
      `trackA=${lineOkA} trackB=${lineOkB} trackC=${lineOkC} committedΔ=${lineCountAfter - lineCountBefore} previewCleared=${drafts.length === 0}`,
    );

    await pause(page, 1500);
    await shot(page, "15-final");

    if (consoleErrors.length) {
      console.log("Console errors:", consoleErrors.slice(0, 8));
    }
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      const destWebm = path.join(ARTIFACTS, "dim-20-preview-tracking.webm");
      fs.renameSync(videoPath, destWebm);
      const destGif = path.join(ARTIFACTS, "dim-20-preview-tracking.gif");
      const gifOk = await makeGifFromWebm(destWebm, destGif);
      console.log(`Video: ${destWebm}`);
      console.log(`GIF: ${gifOk ? destGif : "failed"}`);
    }
  }

  const summary = {
    commit: COMMIT,
    prd: "DIM-20",
    results,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    total: results.length,
  };
  fs.writeFileSync(
    path.join(ARTIFACTS, "results.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
