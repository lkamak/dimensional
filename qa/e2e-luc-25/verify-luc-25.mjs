import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "artifacts");
const VIDEO_DIR = path.join(OUT, "video-raw");
const FIXTURE = path.join(__dirname, "../fixtures/simple-floorplan.png");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const IMAGE_W = 480;
const IMAGE_H = 360;
const STORAGE_KEY = "dimensional.plan.v1";

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const results = [];
function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.log(`FAIL  ${id}: ${detail}`);
}
function skip(id, detail) {
  results.push({ id, status: "SKIP", detail });
  console.log(`SKIP  ${id}: ${detail}`);
}

async function pause(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
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

async function getStage(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return null;
    return {
      x: stage.x(),
      y: stage.y(),
      scaleX: stage.scaleX(),
      scaleY: stage.scaleY(),
      draggable: stage.draggable(),
      cursor: stage.container()?.style?.cursor || null,
    };
  });
}

async function getCursor(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    return stage?.container()?.style?.cursor || null;
  });
}

async function worldToScreen(page, worldX, worldY) {
  await bindStage(page);
  return page.evaluate(
    ({ worldX, worldY, imageWidth, imageHeight }) => {
      const canvas = document.querySelector(".canvas-area canvas");
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const stage = window.__qaStage;
      let scale;
      let posX;
      let posY;
      if (stage) {
        scale = stage.scaleX();
        posX = stage.x();
        posY = stage.y();
      } else {
        const pad = 48;
        const sx = (rect.width - pad * 2) / imageWidth;
        const sy = (rect.height - pad * 2) / imageHeight;
        scale = Math.min(sx, sy, 1.5);
        posX = (rect.width - imageWidth * scale) / 2;
        posY = (rect.height - imageHeight * scale) / 2;
      }
      return {
        x: rect.left + posX + worldX * scale,
        y: rect.top + posY + worldY * scale,
        scale,
        posX,
        posY,
      };
    },
    { worldX, worldY, imageWidth: IMAGE_W, imageHeight: IMAGE_H },
  );
}

async function clickWorld(page, worldX, worldY) {
  const p = await worldToScreen(page, worldX, worldY);
  if (!p) throw new Error("worldToScreen failed");
  await page.mouse.click(p.x, p.y);
  return p;
}

async function slowDragScreen(page, x1, y1, x2, y2, steps = 16, stepDelay = 55) {
  await page.mouse.move(x1, y1);
  await pause(page, 350);
  await page.mouse.down();
  await pause(page, 400);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      x1 + ((x2 - x1) * i) / steps,
      y1 + ((y2 - y1) * i) / steps,
    );
    await page.waitForTimeout(stepDelay);
  }
  await pause(page, 300);
  await page.mouse.up();
  await pause(page, 500);
}

async function readPlan(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

async function calibrate(page) {
  // Upload auto-enters calibrate; ensure calibrate mode
  const hint = page.locator("text=Click two points");
  if (!(await hint.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 400);
  }
  await clickWorld(page, 80, 180);
  await pause(page, 600);
  await clickWorld(page, 400, 180);
  await pause(page, 600);
  await page.waitForSelector("text=Set real length", { timeout: 10000 });
  await page.locator("#calib-length").fill("120");
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1000);
}

async function main() {
  try {
    execSync("npm run lint", {
      cwd: path.resolve(__dirname, "../.."),
      stdio: "pipe",
    });
    pass("AC9", "oxlint passed with no warnings");
  } catch (err) {
    fail(
      "AC9",
      `oxlint failed: ${err.stderr?.toString?.() || err.message}`,
    );
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1400, height: 900 } },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE);
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();
    await pause(page, 1200);
    await shot(page, "01-empty-state.png");

    await page
      .locator('header input[type="file"]')
      .setInputFiles(FIXTURE);
    await pause(page, 1400);
    await page.waitForSelector(".canvas-area canvas", { timeout: 15000 });
    await bindStage(page);
    await shot(page, "02-uploaded-calibrate.png");

    await calibrate(page);
    await shot(page, "03-calibrated-select.png");

    const scalePill = await page.locator("[class*='scalePill']").textContent();
    if (!scalePill?.includes("Scale set")) {
      fail("setup", `calibration failed: ${scalePill}`);
    } else {
      pass("setup-calibrate", scalePill.trim());
    }

    // Place furniture (centers on image)
    await page.getByRole("button", { name: "Sofa" }).click();
    await pause(page, 900);
    await shot(page, "04-furniture-placed.png");

    let plan = await readPlan(page);
    let sofa = plan?.items?.[0];
    if (!sofa) {
      fail("setup", "sofa not placed");
      throw new Error("sofa not placed");
    }
    pass(
      "setup-furniture",
      `Sofa at (${sofa.x.toFixed(1)}, ${sofa.y.toFixed(1)})`,
    );

    // Ensure select mode
    await page.keyboard.press("Escape");
    await pause(page, 500);
    await bindStage(page);

    // ----- AC7a: grab cursor over empty canvas -----
    const emptyPt = await worldToScreen(page, 60, 60);
    await page.mouse.move(emptyPt.x, emptyPt.y);
    await pause(page, 600);
    let cursor = await getCursor(page);
    await shot(page, "05-cursor-grab.png");
    if (cursor === "grab") {
      pass("AC7a", `Cursor is grab over empty canvas`);
    } else {
      fail("AC7a", `Expected grab, got "${cursor}"`);
    }

    // ----- AC1: left-drag pans -----
    const beforePan = await getStage(page);
    const panStart = await worldToScreen(page, 100, 80);
    await slowDragScreen(
      page,
      panStart.x,
      panStart.y,
      panStart.x + 180,
      panStart.y + 120,
      18,
      55,
    );
    const afterPan = await getStage(page);
    await shot(page, "06-after-pan.png");
    const dx = (afterPan?.x ?? 0) - (beforePan?.x ?? 0);
    const dy = (afterPan?.y ?? 0) - (beforePan?.y ?? 0);
    if (Math.abs(dx) > 40 && Math.abs(dy) > 30) {
      pass(
        "AC1",
        `Left-drag on empty canvas panned (Δx=${dx.toFixed(1)}, Δy=${dy.toFixed(1)})`,
      );
    } else {
      fail(
        "AC1",
        `Pan delta too small (Δx=${dx.toFixed(1)}, Δy=${dy.toFixed(1)}); before=${JSON.stringify(beforePan)} after=${JSON.stringify(afterPan)}`,
      );
    }

    // ----- AC7b: grabbing while dragging -----
    const mid = await worldToScreen(page, 120, 100);
    await page.mouse.move(mid.x, mid.y);
    await pause(page, 200);
    await page.mouse.down();
    await pause(page, 250);
    await page.mouse.move(mid.x + 50, mid.y + 40);
    await pause(page, 400);
    const grabbing = await getCursor(page);
    await shot(page, "07-cursor-grabbing.png");
    await page.mouse.up();
    await pause(page, 500);
    if (grabbing === "grabbing") {
      pass("AC7b", `Cursor is grabbing while dragging`);
    } else {
      fail("AC7b", `Expected grabbing during drag, got "${grabbing}"`);
    }

    // ----- AC2: wheel zoom + pan -----
    const beforeZoom = await getStage(page);
    const zoomPt = await worldToScreen(page, 240, 180);
    await page.mouse.move(zoomPt.x, zoomPt.y);
    await pause(page, 400);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(140);
    }
    await pause(page, 700);
    const afterZoom = await getStage(page);
    await shot(page, "08-after-zoom.png");
    const zoomed =
      afterZoom &&
      beforeZoom &&
      afterZoom.scaleX > beforeZoom.scaleX * 1.2;

    // Pan on empty canvas corner (avoid furniture under cursor after zoom)
    const emptyCorner = await page.evaluate(() => {
      const canvas = document.querySelector(".canvas-area canvas");
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + 40, y: rect.top + 40 };
    });
    await page.mouse.click(emptyCorner.x, emptyCorner.y);
    await pause(page, 400);
    const beforePan2 = await getStage(page);
    await slowDragScreen(
      page,
      emptyCorner.x,
      emptyCorner.y,
      emptyCorner.x + 120,
      emptyCorner.y + 90,
      14,
      50,
    );
    const afterPan2 = await getStage(page);
    await shot(page, "09-zoom-then-pan.png");
    const pan2dx = (afterPan2?.x ?? 0) - (beforePan2?.x ?? 0);
    const pan2dy = (afterPan2?.y ?? 0) - (beforePan2?.y ?? 0);
    if (zoomed && (Math.abs(pan2dx) > 30 || Math.abs(pan2dy) > 30)) {
      pass(
        "AC2",
        `Zoom ${beforeZoom.scaleX.toFixed(3)}→${afterZoom.scaleX.toFixed(3)} then pan Δ=(${pan2dx.toFixed(1)}, ${pan2dy.toFixed(1)})`,
      );
    } else {
      fail(
        "AC2",
        `zoomed=${zoomed} pan2=(${pan2dx}, ${pan2dy}) beforeZoom=${JSON.stringify(beforeZoom)} afterZoom=${JSON.stringify(afterZoom)} afterPan2=${JSON.stringify(afterPan2)}`,
      );
    }

    // ----- AC5: click furniture selects -----
    plan = await readPlan(page);
    sofa = plan.items[0];
    await clickWorld(page, sofa.x, sofa.y);
    await pause(page, 800);
    await shot(page, "10-furniture-selected.png");
    const hasEditor =
      (await page.locator('aside input[type="number"]').count()) > 0 ||
      (await page.getByRole("button", { name: /Delete/i }).count()) > 0;
    if (hasEditor) {
      pass("AC5", "Clicking furniture selects it (inspector editable)");
    } else {
      const aside = await page.locator("aside").nth(1).textContent();
      fail("AC5", `Selection UI missing: ${aside?.slice(0, 120)}`);
    }

    // ----- AC3: empty click deselects -----
    await clickWorld(page, 40, 40);
    await pause(page, 800);
    await shot(page, "11-deselected.png");
    const stillEditing =
      (await page.locator('aside input[type="number"]').count()) > 0;
    if (!stillEditing) {
      pass("AC3", "Plain left-click on empty canvas deselected");
    } else {
      fail("AC3", "Empty click did not deselect furniture");
    }

    // ----- AC4: furniture drag moves item, not canvas -----
    plan = await readPlan(page);
    sofa = plan.items[0];
    await clickWorld(page, sofa.x, sofa.y);
    await pause(page, 500);
    const stageBeforeFurn = await getStage(page);
    const furnBefore = (await readPlan(page)).items[0];
    const furnScreen = await worldToScreen(page, furnBefore.x, furnBefore.y);
    await slowDragScreen(
      page,
      furnScreen.x,
      furnScreen.y,
      furnScreen.x + 100,
      furnScreen.y + 70,
      14,
      50,
    );
    await pause(page, 700);
    const stageAfterFurn = await getStage(page);
    const furnAfter = (await readPlan(page)).items[0];
    await shot(page, "12-furniture-dragged.png");
    const furnDelta = Math.hypot(
      furnAfter.x - furnBefore.x,
      furnAfter.y - furnBefore.y,
    );
    const stageDelta = Math.hypot(
      (stageAfterFurn?.x ?? 0) - (stageBeforeFurn?.x ?? 0),
      (stageAfterFurn?.y ?? 0) - (stageBeforeFurn?.y ?? 0),
    );
    if (furnDelta > 25 && stageDelta < 20) {
      pass(
        "AC4",
        `Furniture moved ${furnDelta.toFixed(1)}px world; stage stable (Δ=${stageDelta.toFixed(1)})`,
      );
    } else {
      fail(
        "AC4",
        `furnDelta=${furnDelta.toFixed(1)} stageDelta=${stageDelta.toFixed(1)} ${JSON.stringify(furnBefore)}→${JSON.stringify(furnAfter)}`,
      );
    }

    // ----- AC6: calibrate unaffected; no pan while calibrating -----
    // Reset view by reloading plan state into a fresh page viewport fit:
    // Escape to select, then re-enter calibrate. Also reset stage via Reset+reupload
    // is heavy; instead click Reset is destructive. Prefer Escape + Calibrate and
    // use on-screen clicks (not world coords that may be off-canvas after pan/zoom).
    await page.keyboard.press("Escape");
    await pause(page, 400);

    // Fit view roughly: zoom out a few notches toward empty area then pan to origin-ish
    // by using the fit that happens on image load — trigger via Clear isn't enough.
    // Soft reset: press Escape, then use mouse wheel to zoom out, then pan toward center.
    const softReset = await page.evaluate(() => {
      const canvas = document.querySelector(".canvas-area canvas");
      const rect = canvas.getBoundingClientRect();
      return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    });
    await page.mouse.move(softReset.cx, softReset.cy);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(40);
    }
    await pause(page, 300);

    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 700);
    await page.waitForSelector("text=Click two points", { timeout: 5000 });

    const stageBeforeCal = await getStage(page);
    // Drag in screen space on canvas; calibrate mousedown places a point but must not pan
    const calCorner = await page.evaluate(() => {
      const canvas = document.querySelector(".canvas-area canvas");
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + 50, y: rect.top + 50 };
    });
    await slowDragScreen(
      page,
      calCorner.x,
      calCorner.y,
      calCorner.x + 150,
      calCorner.y + 100,
      12,
      45,
    );
    const stageAfterCal = await getStage(page);
    await shot(page, "13-calibrate-no-pan.png");
    const calPan = Math.hypot(
      (stageAfterCal?.x ?? 0) - (stageBeforeCal?.x ?? 0),
      (stageAfterCal?.y ?? 0) - (stageBeforeCal?.y ?? 0),
    );
    const stageNotDraggable = (await getStage(page))?.draggable === false;

    // Fresh calibrate for click-to-place (discard draft from drag mousedown)
    await page.keyboard.press("Escape");
    await pause(page, 400);
    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 600);
    await page.waitForSelector("text=Click two points", { timeout: 5000 });

    // Click two points in *screen* space inside the visible canvas, mapped via live stage
    // (world coords can fall off-screen after earlier pan/zoom).
    await bindStage(page);
    const calibClicks = await page.evaluate(() => {
      const canvas = document.querySelector(".canvas-area canvas");
      const rect = canvas.getBoundingClientRect();
      const stage = window.__qaStage;
      const scale = stage.scaleX();
      const x1 = rect.left + rect.width * 0.25;
      const y1 = rect.top + rect.height * 0.45;
      const x2 = rect.left + rect.width * 0.65;
      const y2 = rect.top + rect.height * 0.45;
      // Also report corresponding world for debugging
      const w1 = {
        x: (x1 - rect.left - stage.x()) / scale,
        y: (y1 - rect.top - stage.y()) / scale,
      };
      const w2 = {
        x: (x2 - rect.left - stage.x()) / scale,
        y: (y2 - rect.top - stage.y()) / scale,
      };
      return { x1, y1, x2, y2, w1, w2, scale, stageX: stage.x(), stageY: stage.y() };
    });
    console.log("AC6 calib clicks", calibClicks);
    await page.mouse.click(calibClicks.x1, calibClicks.y1);
    await pause(page, 700);
    const circlesAfterFirst = await page.evaluate(() => {
      const stage = window.__qaStage;
      return stage?.find?.("Circle")?.length ?? 0;
    });
    await page.mouse.click(calibClicks.x2, calibClicks.y2);
    await pause(page, 900);
    const modalVisible = await page
      .locator("text=Set real length")
      .isVisible()
      .catch(() => false);
    await shot(page, "14-calibrate-points.png");
    if (modalVisible) {
      await page.getByRole("button", { name: "Cancel" }).click();
      await pause(page, 400);
    }
    await page.keyboard.press("Escape");
    await pause(page, 400);

    if (calPan < 12 && modalVisible && stageNotDraggable) {
      pass(
        "AC6",
        `Calibrate: stage not draggable, drag did not pan (Δ=${calPan.toFixed(1)}); click-to-place works (circles after 1st=${circlesAfterFirst})`,
      );
    } else {
      fail(
        "AC6",
        `calPan=${calPan.toFixed(1)} modalVisible=${modalVisible} stageNotDraggable=${stageNotDraggable} circlesAfterFirst=${circlesAfterFirst} clicks=${JSON.stringify(calibClicks)}`,
      );
    }

    skip(
      "AC6-draw_wall",
      'draw_wall tool not present in this branch (ToolMode: select|calibrate|pan); calibrate covers non-select placement',
    );

    // ----- AC8: Space-hold pan -----
    await page.keyboard.press("Escape");
    await pause(page, 400);
    const stageBeforeSpace = await getStage(page);
    await page.keyboard.down("Space");
    await pause(page, 350);
    const spaceCursor = await getCursor(page);
    const spacePt = await worldToScreen(page, 200, 150);
    await slowDragScreen(
      page,
      spacePt.x,
      spacePt.y,
      spacePt.x + 130,
      spacePt.y + 80,
      12,
      45,
    );
    await page.keyboard.up("Space");
    await pause(page, 600);
    const stageAfterSpace = await getStage(page);
    await shot(page, "15-space-pan.png");
    const spaceDelta = Math.hypot(
      (stageAfterSpace?.x ?? 0) - (stageBeforeSpace?.x ?? 0),
      (stageAfterSpace?.y ?? 0) - (stageBeforeSpace?.y ?? 0),
    );
    if (spaceDelta > 40) {
      pass(
        "AC8",
        `Space-hold pan works (Δ=${spaceDelta.toFixed(1)}, cursor=${spaceCursor})`,
      );
    } else {
      fail(
        "AC8",
        `Space pan too small Δ=${spaceDelta.toFixed(1)} cursor=${spaceCursor}`,
      );
    }

    await pause(page, 1200);
    await shot(page, "16-final.png");
  } catch (err) {
    console.error("Verification error:", err);
    await shot(page, "99-error.png").catch(() => {});
    fail("runtime", String(err?.stack || err));
  }

  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  if (videoPath && fs.existsSync(videoPath)) {
    const dest = path.join(OUT, "luc-25-e2e.webm");
    fs.renameSync(videoPath, dest);
    console.log("Video saved:", dest);
    try {
      execSync(
        `ffmpeg -y -i "${dest}" -vf "fps=8,scale=960:-1:flags=lanczos,setpts=1.35*PTS" -loop 0 "${path.join(OUT, "luc-25-e2e.gif")}"`,
        { stdio: "pipe" },
      );
      console.log("GIF saved");
    } catch (e) {
      console.warn("GIF conversion failed:", e.message);
    }
  }

  try {
    for (const f of fs.readdirSync(VIDEO_DIR)) {
      fs.unlinkSync(path.join(VIDEO_DIR, f));
    }
    fs.rmdirSync(VIDEO_DIR);
  } catch {
    /* ignore */
  }

  const summary = {
    commit: execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(),
    prd: "LUC-25",
    criteria: Object.fromEntries(results.map((r) => [r.id, r])),
    passCount: results.filter((r) => r.status === "PASS").length,
    failCount: results.filter((r) => r.status === "FAIL").length,
    skipCount: results.filter((r) => r.status === "SKIP").length,
  };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
