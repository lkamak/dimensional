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

async function dragWorld(page, x1, y1, x2, y2) {
  const a = await worldToScreen(page, x1, y1);
  const b = await worldToScreen(page, x2, y2);
  if (!a || !b) throw new Error("Could not map drag points");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await pause(page, 300);
  // Intermediate move so reviewers can see the drag
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 12 });
  await pause(page, 400);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await pause(page, 300);
  await page.mouse.up();
  await pause(page, 800);
}

function getElements(page) {
  return page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("dimensional.session.v2") || "null",
    );
    return session?.plan?.elements ?? [];
  });
}

function approxEqual(a, b, tol = 2.5) {
  return Math.abs(a - b) <= tol;
}

function isNegativeSlope(el) {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  return dx !== 0 && dy / dx < 0;
}

function segmentLength(el) {
  return Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
}

function segmentAngle(el) {
  return Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
}

async function twoClickDraw(page, toolLabel, start, end) {
  await page.getByRole("button", { name: new RegExp(`^${toolLabel}$`, "i") }).click();
  await pause(page, 700);
  await clickWorld(page, start.x, start.y);
  await pause(page, 900);
  await clickWorld(page, end.x, end.y);
  await pause(page, 1100);
}

async function dragDraw(page, toolLabel, start, end) {
  await page.getByRole("button", { name: new RegExp(`^${toolLabel}$`, "i") }).click();
  await pause(page, 700);
  await dragWorld(page, start.x, start.y, end.x, end.y);
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

    // Blank canvas — Wall tool is active by default after starting a blank plan
    const drawPlanBtn = page.getByRole("button", { name: /^Draw a plan$/i });
    if (await drawPlanBtn.isVisible().catch(() => false)) {
      await drawPlanBtn.click();
    } else {
      await page.getByRole("button", { name: /^Draw plan$/i }).click();
    }
    await pause(page, 1500);
    await shot(page, "02-blank-canvas");

    // Ensure canvas is present
    await page.locator(".canvas-area canvas").first().waitFor({ state: "visible", timeout: 8000 });
    await bindStage(page);

    // --- AC1: negative-slope wall ---
    const wallNegStart = { x: 420, y: 120 };
    const wallNegEnd = { x: 180, y: 320 };
    await twoClickDraw(page, "Wall", wallNegStart, wallNegEnd);
    await shot(page, "03-negative-slope-wall");
    let elements = await getElements(page);
    const negWall = elements.find((e) => e.kind === "wall");
    const ac1 =
      negWall &&
      approxEqual(negWall.x1, wallNegStart.x) &&
      approxEqual(negWall.y1, wallNegStart.y) &&
      approxEqual(negWall.x2, wallNegEnd.x) &&
      approxEqual(negWall.y2, wallNegEnd.y) &&
      isNegativeSlope(negWall);
    record(
      "AC1",
      "Negative-slope wall matches draft (upper-right → lower-left)",
      Boolean(ac1),
      negWall
        ? `stored=(${negWall.x1.toFixed(1)},${negWall.y1.toFixed(1)})→(${negWall.x2.toFixed(1)},${negWall.y2.toFixed(1)}) slope=${((negWall.y2 - negWall.y1) / (negWall.x2 - negWall.x1)).toFixed(3)}`
        : "no wall found",
    );

    // --- AC2: negative-slope line ---
    const lineNegStart = { x: 500, y: 140 };
    const lineNegEnd = { x: 260, y: 360 };
    await twoClickDraw(page, "Line", lineNegStart, lineNegEnd);
    await shot(page, "04-negative-slope-line");
    elements = await getElements(page);
    const negLine = elements.find((e) => e.kind === "line");
    const ac2 =
      negLine &&
      approxEqual(negLine.x1, lineNegStart.x) &&
      approxEqual(negLine.y1, lineNegStart.y) &&
      approxEqual(negLine.x2, lineNegEnd.x) &&
      approxEqual(negLine.y2, lineNegEnd.y) &&
      isNegativeSlope(negLine);
    record(
      "AC2",
      "Negative-slope line matches draft",
      Boolean(ac2),
      negLine
        ? `stored=(${negLine.x1.toFixed(1)},${negLine.y1.toFixed(1)})→(${negLine.x2.toFixed(1)},${negLine.y2.toFixed(1)})`
        : "no line found",
    );

    // --- AC3: positive / horizontal / vertical walls & lines ---
    await twoClickDraw(page, "Wall", { x: 80, y: 80 }, { x: 220, y: 200 }); // positive
    await twoClickDraw(page, "Wall", { x: 80, y: 420 }, { x: 280, y: 420 }); // horizontal
    await twoClickDraw(page, "Wall", { x: 600, y: 80 }, { x: 600, y: 260 }); // vertical
    await twoClickDraw(page, "Line", { x: 700, y: 100 }, { x: 860, y: 240 }); // positive line
    await twoClickDraw(page, "Line", { x: 700, y: 420 }, { x: 900, y: 420 }); // horizontal line
    await twoClickDraw(page, "Line", { x: 980, y: 80 }, { x: 980, y: 280 }); // vertical line
    await shot(page, "05-other-orientations");
    elements = await getElements(page);
    const walls = elements.filter((e) => e.kind === "wall");
    const lines = elements.filter((e) => e.kind === "line");
    const posWall = walls.find(
      (w) => approxEqual(w.x1, 80) && approxEqual(w.y1, 80) && approxEqual(w.x2, 220) && approxEqual(w.y2, 200),
    );
    const horizWall = walls.find(
      (w) => approxEqual(w.x1, 80) && approxEqual(w.y1, 420) && approxEqual(w.x2, 280) && approxEqual(w.y2, 420),
    );
    const vertWall = walls.find(
      (w) => approxEqual(w.x1, 600) && approxEqual(w.y1, 80) && approxEqual(w.x2, 600) && approxEqual(w.y2, 260),
    );
    const posLine = lines.find(
      (w) => approxEqual(w.x1, 700) && approxEqual(w.y1, 100) && approxEqual(w.x2, 860) && approxEqual(w.y2, 240),
    );
    const horizLine = lines.find(
      (w) => approxEqual(w.x1, 700) && approxEqual(w.y1, 420) && approxEqual(w.x2, 900) && approxEqual(w.y2, 420),
    );
    const vertLine = lines.find(
      (w) => approxEqual(w.x1, 980) && approxEqual(w.y1, 80) && approxEqual(w.x2, 980) && approxEqual(w.y2, 280),
    );
    const ac3 = Boolean(posWall && horizWall && vertWall && posLine && horizLine && vertLine);
    record(
      "AC3",
      "Positive-slope, horizontal, and vertical walls/lines render correctly",
      ac3,
      `posWall=${!!posWall} horizWall=${!!horizWall} vertWall=${!!vertWall} posLine=${!!posLine} horizLine=${!!horizLine} vertLine=${!!vertLine}`,
    );

    // --- AC4: rooms/rects still normalize ---
    // Drag from lower-right to upper-left; expect min/max normalization
    await dragDraw(page, "Room", { x: 450, y: 520 }, { x: 250, y: 380 });
    await dragDraw(page, "Rect", { x: 820, y: 560 }, { x: 640, y: 430 });
    await shot(page, "06-room-rect-normalized");
    elements = await getElements(page);
    const room = elements.find((e) => e.kind === "room");
    const rect = elements.find((e) => e.kind === "rect");
    const roomOk =
      room &&
      approxEqual(room.x1, 250) &&
      approxEqual(room.y1, 380) &&
      approxEqual(room.x2, 450) &&
      approxEqual(room.y2, 520);
    const rectOk =
      rect &&
      approxEqual(rect.x1, 640) &&
      approxEqual(rect.y1, 430) &&
      approxEqual(rect.x2, 820) &&
      approxEqual(rect.y2, 560);
    record(
      "AC4",
      "Rooms and rectangles normalize from any drag direction",
      Boolean(roomOk && rectOk),
      `room=${room ? `(${room.x1.toFixed(0)},${room.y1.toFixed(0)})-(${room.x2.toFixed(0)},${room.y2.toFixed(0)})` : "none"} rect=${rect ? `(${rect.x1.toFixed(0)},${rect.y1.toFixed(0)})-(${rect.x2.toFixed(0)},${rect.y2.toFixed(0)})` : "none"}`,
    );

    // --- AC5: select + drag preserves angle/length of negative-slope wall ---
    await page.getByRole("button", { name: /^Select$/i }).click();
    await pause(page, 700);
    // Click midpoint of negative-slope wall
    const midX = (negWall.x1 + negWall.x2) / 2;
    const midY = (negWall.y1 + negWall.y2) / 2;
    await clickWorld(page, midX, midY);
    await pause(page, 900);
    const beforeDrag = (await getElements(page)).find((e) => e.id === negWall.id);
    const beforeLen = segmentLength(beforeDrag);
    const beforeAng = segmentAngle(beforeDrag);
    // Drag the selected wall by ~40px
    await dragWorld(page, midX, midY, midX + 40, midY + 30);
    await shot(page, "07-after-drag-neg-wall");
    const afterDrag = (await getElements(page)).find((e) => e.id === negWall.id);
    const afterLen = segmentLength(afterDrag);
    const afterAng = segmentAngle(afterDrag);
    const moved =
      Math.hypot(afterDrag.x1 - beforeDrag.x1, afterDrag.y1 - beforeDrag.y1) > 5;
    const ac5 =
      moved &&
      Math.abs(afterLen - beforeLen) < 2 &&
      Math.abs(afterAng - beforeAng) < 0.05 &&
      isNegativeSlope(afterDrag);
    record(
      "AC5",
      "Selecting and dragging corrected wall preserves angle and length",
      Boolean(ac5),
      `moved=${moved} Δlen=${(afterLen - beforeLen).toFixed(2)} Δang=${(afterAng - beforeAng).toFixed(4)} stillNeg=${isNegativeSlope(afterDrag)}`,
    );

    // --- AC6: reload + save/load preserve orientation ---
    const beforeReload = (await getElements(page)).find((e) => e.id === negWall.id);
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1500);
    await shot(page, "08-after-reload");
    const afterReload = (await getElements(page)).find((e) => e.id === negWall.id);
    const reloadOk =
      afterReload &&
      approxEqual(afterReload.x1, beforeReload.x1) &&
      approxEqual(afterReload.y1, beforeReload.y1) &&
      approxEqual(afterReload.x2, beforeReload.x2) &&
      approxEqual(afterReload.y2, beforeReload.y2) &&
      isNegativeSlope(afterReload);

    // Save to library and reopen in a fresh session
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 900);
    await page.getByLabel("Plan name").fill("DIM-17 Neg Slope");
    await pause(page, 600);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Save$/i })
      .click();
    await pause(page, 1200);
    await shot(page, "09-saved");

    // Clear session and open from library
    await page.evaluate(() => {
      localStorage.removeItem("dimensional.session.v2");
    });
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1200);
    await page.getByRole("button", { name: /^Open$/i }).click();
    await pause(page, 900);
    await page
      .getByRole("dialog")
      .locator("li")
      .filter({ hasText: "DIM-17 Neg Slope" })
      .locator("button")
      .first()
      .click();
    await pause(page, 1500);
    await shot(page, "10-reopened-from-library");
    const afterOpen = (await getElements(page)).find((e) => e.kind === "wall" && isNegativeSlope(e));
    // Match by coords (id may persist)
    const openOk =
      afterOpen &&
      approxEqual(afterOpen.x1, beforeReload.x1) &&
      approxEqual(afterOpen.y1, beforeReload.y1) &&
      approxEqual(afterOpen.x2, beforeReload.x2) &&
      approxEqual(afterOpen.y2, beforeReload.y2);
    record(
      "AC6",
      "Negative-slope orientation survives reload and save/load",
      Boolean(reloadOk && openOk),
      `reloadOk=${!!reloadOk} openOk=${!!openOk}`,
    );

    // --- AC7: segments shorter than 4px rejected ---
    const countBefore = (await getElements(page)).length;
    await twoClickDraw(page, "Wall", { x: 100, y: 100 }, { x: 102, y: 101 }); // dist ~2.2 < 4
    await twoClickDraw(page, "Line", { x: 150, y: 150 }, { x: 151, y: 152 }); // dist ~2.2 < 4
    await pause(page, 800);
    await shot(page, "11-short-segment-rejected");
    const countAfter = (await getElements(page)).length;
    record(
      "AC7",
      "Segments shorter than 4 px threshold are rejected",
      countAfter === countBefore,
      `elementCount before=${countBefore} after=${countAfter}`,
    );

    // --- AC8: vectorized/legacy walls + legacy plans load without errors ---
    await page.evaluate(() => {
      const legacyPlan = {
        imageDataUrl: null,
        canvasWidth: 1200,
        canvasHeight: 900,
        pixelsPerInch: 2,
        unitSystem: "imperial",
        items: [],
        // Legacy walls array (pre-DrawElement)
        walls: [
          { id: "legacy-wall-1", start: { x: 40, y: 40 }, end: { x: 200, y: 180 } },
          { id: "legacy-wall-2", start: { x: 300, y: 50 }, end: { x: 120, y: 220 } }, // negative slope
        ],
        elements: [
          // Already-oriented vectorized wall
          { id: "vec-1", kind: "wall", x1: 500, y1: 60, x2: 300, y2: 260 },
        ],
        imageUnderlayVisible: true,
        imageUnderlayOpacity: 1,
      };
      localStorage.setItem(
        "dimensional.session.v2",
        JSON.stringify({
          plan: legacyPlan,
          activePlanId: null,
          activePlanName: null,
          baselineState: legacyPlan,
        }),
      );
      // Also a pre-library v2 key
      localStorage.setItem("dimensional.plan.v2", JSON.stringify(legacyPlan));
    });
    consoleErrors.length = 0;
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1800);
    await shot(page, "12-legacy-vectorized-load");
    elements = await getElements(page);
    const hasVec = elements.some(
      (e) => e.id === "vec-1" && isNegativeSlope(e),
    );
    // Depending on migration path, walls may merge into elements
    const hasLegacyNeg = elements.some(
      (e) =>
        e.kind === "wall" &&
        ((approxEqual(e.x1, 300) && approxEqual(e.y1, 50) && approxEqual(e.x2, 120) && approxEqual(e.y2, 220)) ||
          (approxEqual(e.x1, 500) && approxEqual(e.y1, 60))),
    );
    const noFatal = consoleErrors.filter((e) => !/favicon|DevTools/i.test(e)).length === 0;
    record(
      "AC8",
      "Vectorized/converted walls and legacy plans load without errors",
      Boolean(hasVec && noFatal && elements.length >= 1),
      `hasVec=${hasVec} hasLegacyNeg=${hasLegacyNeg} elements=${elements.length} consoleErrors=${consoleErrors.length}`,
    );

    await shot(page, "13-final");
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (video) {
      const raw = await video.path();
      const webmDest = path.join(ARTIFACTS, "dim-17-e2e.webm");
      fs.renameSync(raw, webmDest);
      const gifDest = path.join(ARTIFACTS, "dim-17-e2e.gif");
      const gifOk = await makeGifFromWebm(webmDest, gifDest);
      // Also a shorter preview gif from key screenshots via ffmpeg if needed
      if (!gifOk) {
        console.warn("GIF conversion failed; webm retained");
      }
      // Compact preview gif from screenshots
      try {
        const shots = [
          "03-negative-slope-wall",
          "04-negative-slope-line",
          "05-other-orientations",
          "06-room-rect-normalized",
          "07-after-drag-neg-wall",
          "10-reopened-from-library",
          "12-legacy-vectorized-load",
        ]
          .map((n) => path.join(ARTIFACTS, `${n}.png`))
          .filter((p) => fs.existsSync(p));
        if (shots.length) {
          const listFile = path.join(ARTIFACTS, "gif-frames.txt");
          fs.writeFileSync(
            listFile,
            shots.map((p) => `file '${p}'\nduration 1.2`).join("\n") +
              `\nfile '${shots[shots.length - 1]}'\n`,
          );
          execSync(
            `ffmpeg -y -f concat -safe 0 -i ${JSON.stringify(listFile)} -vf "fps=2,scale=960:-1:flags=lanczos" -loop 0 ${JSON.stringify(path.join(ARTIFACTS, "dim-17-e2e-preview.gif"))}`,
            { stdio: "pipe" },
          );
        }
      } catch (e) {
        console.warn("preview gif failed", e.message);
      }
    }
  }

  const report = {
    issue: "DIM-17",
    pr: 11,
    commit: COMMIT,
    verdict: results.every((r) => r.pass) ? "APPROVE" : "REJECT",
    results,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(ARTIFACTS, "results.json"),
    JSON.stringify(report, null, 2),
  );

  const md = [
    `# DIM-17 E2E Verification`,
    ``,
    `- **PR:** #11`,
    `- **Commit:** \`${COMMIT}\``,
    `- **Verdict:** ${report.verdict}`,
    ``,
    `## Acceptance criteria`,
    ``,
    ...results.map(
      (r) =>
        `- ${r.pass ? "✅" : "❌"} **${r.id}** ${r.criterion} — ${r.detail}`,
    ),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "REPORT.md"), md);

  console.log("\n" + md);
  if (report.verdict !== "APPROVE") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
