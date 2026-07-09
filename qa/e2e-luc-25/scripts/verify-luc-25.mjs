import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const ARTIFACTS = path.join(ROOT, "qa/e2e-luc-25/artifacts");
const FIXTURE = path.join(ROOT, "qa/e2e-luc-25/fixtures/floorplan.png");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const VIDEO_RAW = path.join(ARTIFACTS, "video-raw");

fs.mkdirSync(ARTIFACTS, { recursive: true });
fs.mkdirSync(VIDEO_RAW, { recursive: true });

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

async function getStageTransform(page) {
  return page.evaluate(() => {
    const stage = globalThis.Konva?.stages?.[0];
    if (!stage) return null;
    return {
      x: stage.x(),
      y: stage.y(),
      scale: stage.scaleX(),
      draggable: stage.draggable(),
      cursor: stage.container()?.style?.cursor || "",
    };
  });
}

async function canvasBox(page) {
  const canvas = page.locator(".konvajs-content canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 15000 });
  return canvas.boundingBox();
}

async function slowDrag(page, x1, y1, x2, y2, steps = 16) {
  await page.mouse.move(x1, y1);
  await pause(page, 350);
  await page.mouse.down();
  await pause(page, 350);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      x1 + ((x2 - x1) * i) / steps,
      y1 + ((y2 - y1) * i) / steps,
    );
    await page.waitForTimeout(55);
  }
  await pause(page, 250);
  await page.mouse.up();
  await pause(page, 500);
}

/** Find screen points that hit Image/Stage (pannable empty) vs furniture Rect. */
async function findHitPoints(page) {
  return page.evaluate(() => {
    const stage = globalThis.Konva.stages[0];
    const rect = stage.container().getBoundingClientRect();
    const empty = [];
    const furnitureHits = [];
    for (let nx = 0.05; nx <= 0.95; nx += 0.05) {
      for (let ny = 0.05; ny <= 0.95; ny += 0.05) {
        const sx = rect.width * nx;
        const sy = rect.height * ny;
        const shape = stage.getIntersection({ x: sx, y: sy });
        const kind = shape ? shape.getClassName() : "STAGE";
        const screen = { x: rect.left + sx, y: rect.top + sy, nx, ny, kind };
        if (kind === "Image" || kind === "STAGE") empty.push(screen);
        if (kind === "Rect") furnitureHits.push(screen);
      }
    }
    const groups = stage
      .find("Group")
      .filter((g) => g.getChildren().some((c) => c.getClassName() === "Rect"));
    const furniture = groups.map((g) => {
      const client = g.getClientRect();
      return {
        worldX: g.x(),
        worldY: g.y(),
        screenX: rect.left + client.x + client.width / 2,
        screenY: rect.top + client.y + client.height / 2,
        client,
      };
    });
    return { empty, furnitureHits, furniture };
  });
}

async function seedPlan(page) {
  const dataUrl = `data:image/png;base64,${fs.readFileSync(FIXTURE).toString("base64")}`;
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((plan) => {
    localStorage.clear();
    localStorage.setItem("dimensional.plan.v1", JSON.stringify(plan));
  }, {
    imageDataUrl: dataUrl,
    // ~2 px/in keeps furniture small vs 800x600 image so empty underlay remains hittable
    pixelsPerInch: 2,
    unitSystem: "imperial",
    items: [
      {
        id: "sofa-1",
        kind: "couch",
        label: "Sofa",
        widthIn: 84,
        depthIn: 38,
        x: 220,
        y: 220,
        rotation: 0,
      },
      {
        id: "desk-1",
        kind: "desk",
        label: "Desk",
        widthIn: 60,
        depthIn: 30,
        x: 520,
        y: 420,
        rotation: 0,
      },
    ],
  });
  await page.reload({ waitUntil: "networkidle" });
  await pause(page, 1500);
}

async function inspectorEmpty(page) {
  return page
    .getByText(/Select a piece of furniture/i)
    .isVisible()
    .catch(() => false);
}

async function selectedLabel(page) {
  if (await inspectorEmpty(page)) return null;
  const input = page.locator("#item-label");
  if (await input.isVisible().catch(() => false)) {
    return input.inputValue();
  }
  // Inspector heading (not CatalogRail)
  const heading = page.locator("aside.Inspector_inspector__h2, aside h2").last();
  if (await heading.isVisible().catch(() => false)) {
    return heading.innerText();
  }
  return "unknown";
}

async function ensureCalibrateMode(page) {
  const hint = page.getByText(/Click two points on a wall/i);
  if (await hint.isVisible().catch(() => false)) return;
  const calibrateBtn = page.getByRole("button", { name: "Calibrate" });
  const cls = (await calibrateBtn.getAttribute("class")) || "";
  if (!/btn-active/.test(cls)) {
    await calibrateBtn.click();
    await pause(page, 600);
  }
  await hint.waitFor({ state: "visible", timeout: 5000 });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VIDEO_RAW, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  try {
    // --- AC9 lint first (independent) ---
    let lintOk = false;
    let lintOut = "";
    try {
      lintOut = execSync("npm run lint", { cwd: ROOT, encoding: "utf8" });
      lintOk = true;
    } catch (e) {
      lintOut = `${e.stdout || ""}${e.stderr || ""}${e}`;
      lintOk = false;
    }
    record(
      "AC9",
      "oxlint passes with no new warnings",
      lintOk,
      lintOut.trim().slice(0, 400),
    );

    await seedPlan(page);
    await shot(page, "01-seeded-plan");

    let hits = await findHitPoints(page);
    if (hits.empty.length < 3 || hits.furniture.length < 1) {
      throw new Error(
        `Bad fixture layout: empty=${hits.empty.length} furniture=${hits.furniture.length}`,
      );
    }
    const emptyA = hits.empty.find((p) => p.kind === "Image") || hits.empty[0];
    const emptyB =
      hits.empty.find(
        (p) =>
          Math.hypot(p.x - emptyA.x, p.y - emptyA.y) > 80 &&
          p.kind === "Image",
      ) || hits.empty[Math.floor(hits.empty.length / 2)];

    // --- AC7: cursor grab on empty ---
    await page.mouse.move(emptyA.x, emptyA.y);
    await pause(page, 600);
    const cursorIdle = (await getStageTransform(page)).cursor;
    await shot(page, "02-cursor-grab-empty");

    // --- AC1: left-drag empty canvas pans ---
    const beforePan = await getStageTransform(page);
    await slowDrag(
      page,
      emptyA.x,
      emptyA.y,
      emptyA.x + 140,
      emptyA.y + 90,
    );
    const afterPan = await getStageTransform(page);
    const panDelta = Math.hypot(
      afterPan.x - beforePan.x,
      afterPan.y - beforePan.y,
    );
    record(
      "AC1",
      "In select mode, left-mouse drag on empty canvas/underlay pans; release ends pan",
      panDelta > 40 && afterPan.draggable === true,
      `delta=${panDelta.toFixed(1)}px; before=${JSON.stringify(beforePan)}; after=${JSON.stringify(afterPan)}; startHit=${emptyA.kind}`,
    );
    await shot(page, "03-after-pan");

    // Sample grabbing cursor mid-drag
    await page.mouse.move(emptyB.x, emptyB.y);
    await pause(page, 300);
    await page.mouse.down();
    await pause(page, 200);
    await page.mouse.move(emptyB.x + 40, emptyB.y + 30);
    await pause(page, 400);
    const cursorDragging = (await getStageTransform(page)).cursor;
    await page.mouse.up();
    await pause(page, 500);

    // Refresh hits after pan
    hits = await findHitPoints(page);
    const furn = hits.furniture[0];
    await page.mouse.move(furn.screenX, furn.screenY);
    await pause(page, 500);
    const cursorOnFurniture = (await getStageTransform(page)).cursor;
    record(
      "AC7",
      "Cursor shows grab over pannable empty canvas and grabbing while actively dragging",
      cursorIdle === "grab" && cursorDragging === "grabbing",
      `idle=${cursorIdle}; dragging=${cursorDragging}; onFurniture=${cursorOnFurniture}`,
    );
    await shot(page, "04-cursor-on-furniture");

    // --- AC5: click furniture selects ---
    // Click empty first
    const emptyForDeselect =
      hits.empty.find((p) => p.kind === "Image") || hits.empty[0];
    await page.mouse.click(emptyForDeselect.x, emptyForDeselect.y, {
      delay: 40,
    });
    await pause(page, 700);
    await page.mouse.click(furn.screenX, furn.screenY, { delay: 40 });
    await pause(page, 900);
    const label = await selectedLabel(page);
    const selectOk =
      label != null && /sofa|desk|couch|chair|table|bed/i.test(label);
    record(
      "AC5",
      "Clicking/tapping to select furniture or walls still works",
      selectOk,
      `selectedLabel=${label}; walls=N/A (no wall endpoints / draw_wall in this MVP)`,
    );
    await shot(page, "05-furniture-selected");

    // --- AC3: plain click empty deselects ---
    hits = await findHitPoints(page);
    const emptyClick =
      hits.empty.find((p) => p.kind === "Image") || hits.empty[0];
    await page.mouse.click(emptyClick.x, emptyClick.y, { delay: 30 });
    await pause(page, 900);
    const deselected = await inspectorEmpty(page);
    record(
      "AC3",
      "Plain left-click (no drag) on empty canvas still deselects",
      deselected === true,
      `inspectorEmpty=${deselected}; clickHit=${emptyClick.kind}`,
    );
    await shot(page, "06-deselected");

    // --- AC2: pan + wheel zoom ---
    hits = await findHitPoints(page);
    const zoomTarget =
      hits.empty.find((p) => p.kind === "Image") || hits.empty[0];
    const beforeZoom = await getStageTransform(page);
    await page.mouse.move(zoomTarget.x, zoomTarget.y);
    await pause(page, 400);
    await page.mouse.wheel(0, -450);
    await pause(page, 900);
    const afterZoom = await getStageTransform(page);
    const zoomChanged = Math.abs(afterZoom.scale - beforeZoom.scale) > 0.05;

    hits = await findHitPoints(page);
    const panPt = hits.empty.find((p) => p.kind === "Image") || hits.empty[0];
    const beforePan2 = await getStageTransform(page);
    await slowDrag(page, panPt.x, panPt.y, panPt.x - 110, panPt.y - 70);
    const afterPan2 = await getStageTransform(page);
    const panAfterZoom =
      Math.hypot(afterPan2.x - beforePan2.x, afterPan2.y - beforePan2.y) > 40;

    await page.mouse.move(panPt.x, panPt.y);
    await page.mouse.wheel(0, 280);
    await pause(page, 800);
    const afterZoom2 = await getStageTransform(page);
    const noJump =
      Number.isFinite(afterZoom2.x) &&
      Number.isFinite(afterZoom2.y) &&
      afterZoom2.scale > 0.1 &&
      afterZoom2.scale < 9;
    record(
      "AC2",
      "Panning works together with wheel zoom with no transform jumps",
      zoomChanged && panAfterZoom && noJump,
      `zoom ${beforeZoom.scale.toFixed(3)}→${afterZoom.scale.toFixed(3)}; panAfterZoom=${panAfterZoom}; final=${JSON.stringify(afterZoom2)}`,
    );
    await shot(page, "07-pan-zoom");

    // --- AC4: furniture drag moves item, not stage ---
    hits = await findHitPoints(page);
    const furn2 = hits.furniture[0];
    const beforeFurnStage = await getStageTransform(page);
    const beforeItems = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dimensional.plan.v1")).items.map(
        (i) => ({ id: i.id, x: i.x, y: i.y }),
      ),
    );
    await slowDrag(
      page,
      furn2.screenX,
      furn2.screenY,
      furn2.screenX + 90,
      furn2.screenY + 55,
      14,
    );
    const afterFurnStage = await getStageTransform(page);
    const afterItems = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dimensional.plan.v1")).items.map(
        (i) => ({ id: i.id, x: i.x, y: i.y }),
      ),
    );
    const stageBarelyMoved =
      Math.hypot(
        afterFurnStage.x - beforeFurnStage.x,
        afterFurnStage.y - beforeFurnStage.y,
      ) < 8;
    const itemMoved = beforeItems.some((b) => {
      const a = afterItems.find((x) => x.id === b.id);
      return a && Math.hypot(a.x - b.x, a.y - b.y) > 15;
    });
    record(
      "AC4",
      "Dragging furniture (or wall endpoint) moves that item and does not pan the canvas",
      itemMoved && stageBarelyMoved,
      `itemMoved=${itemMoved}; stageDelta=${Math.hypot(afterFurnStage.x - beforeFurnStage.x, afterFurnStage.y - beforeFurnStage.y).toFixed(2)}; wallEndpoints=N/A`,
    );
    await shot(page, "08-furniture-drag");

    // --- AC8: Space-hold pan ---
    await page.keyboard.press("Escape");
    await pause(page, 500);
    hits = await findHitPoints(page);
    // Space pan should work even over furniture
    const spacePt = hits.furniture[0] || hits.empty[0];
    const beforeSpace = await getStageTransform(page);
    await page.keyboard.down("Space");
    await pause(page, 400);
    await slowDrag(
      page,
      spacePt.screenX || spacePt.x,
      spacePt.screenY || spacePt.y,
      (spacePt.screenX || spacePt.x) + 120,
      (spacePt.screenY || spacePt.y) + 70,
    );
    await page.keyboard.up("Space");
    await pause(page, 700);
    const afterSpace = await getStageTransform(page);
    const spacePan =
      Math.hypot(afterSpace.x - beforeSpace.x, afterSpace.y - beforeSpace.y) >
      40;
    record(
      "AC8",
      "Existing Space-hold-to-pan still works",
      spacePan,
      `delta=(${(afterSpace.x - beforeSpace.x).toFixed(1)}, ${(afterSpace.y - beforeSpace.y).toFixed(1)})`,
    );
    await shot(page, "09-space-pan");

    // --- AC6: calibrate mode — no pan; click-to-place works ---
    // Fresh upload path for calibrate (clears items)
    await page.getByRole("button", { name: /Clear all|Reset|New/i }).click().catch(() => {});
    // Use file upload to enter calibrate
    await page.locator("header input[type='file']").setInputFiles(FIXTURE);
    await pause(page, 1200);
    await ensureCalibrateMode(page);
    await shot(page, "10-calibrate-mode");

    const beforeCalib = await getStageTransform(page);
    const calibBox = await canvasBox(page);
    // Drag should not pan in calibrate
    await slowDrag(
      page,
      calibBox.x + calibBox.width * 0.6,
      calibBox.y + calibBox.height * 0.3,
      calibBox.x + calibBox.width * 0.6 + 100,
      calibBox.y + calibBox.height * 0.3 + 70,
    );
    const afterCalibDrag = await getStageTransform(page);
    const noPanInCalibrate =
      Math.hypot(
        afterCalibDrag.x - beforeCalib.x,
        afterCalibDrag.y - beforeCalib.y,
      ) < 1 && afterCalibDrag.draggable === false;

    // Click-to-place calibration points
    const mapped = await page.evaluate(() => {
      const stage = globalThis.Konva.stages[0];
      const rect = stage.container().getBoundingClientRect();
      const scale = stage.scaleX();
      const pos = stage.position();
      const toScreen = (wx, wy) => ({
        x: rect.left + pos.x + wx * scale,
        y: rect.top + pos.y + wy * scale,
      });
      return { a: toScreen(80, 80), b: toScreen(400, 80) };
    });
    await page.mouse.click(mapped.a.x, mapped.a.y, { delay: 40 });
    await pause(page, 800);
    await page.mouse.click(mapped.b.x, mapped.b.y, { delay: 40 });
    await pause(page, 1000);
    const lengthInput = page.locator("#calib-length");
    const modalVisible = await lengthInput
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (modalVisible) {
      await lengthInput.fill("120");
      await pause(page, 500);
      await page.getByRole("button", { name: "Apply scale" }).click();
      await pause(page, 900);
    }
    const headerText = await page.locator("header").innerText();
    const calibrated = /Scale set/i.test(headerText);
    record(
      "AC6",
      "calibrate and draw_wall modes unaffected: click-to-place works; left-drag does not pan",
      noPanInCalibrate && calibrated && modalVisible,
      `noPan=${noPanInCalibrate}; modal=${modalVisible}; calibrated=${calibrated}; draw_wall=N/A (not in ToolMode union)`,
    );
    await shot(page, "11-calibrated");

    await pause(page, 1200);
    await shot(page, "12-final");
  } catch (err) {
    console.error("Verification crashed:", err);
    record("CRASH", "Script completed without crash", false, String(err));
    await shot(page, "99-crash").catch(() => {});
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const rawPath = await video.path();
      const webmOut = path.join(ARTIFACTS, "luc-25-e2e.webm");
      const gifOut = path.join(ARTIFACTS, "luc-25-e2e.gif");
      try {
        fs.renameSync(rawPath, webmOut);
      } catch {
        fs.copyFileSync(rawPath, webmOut);
      }
      try {
        execSync(
          `ffmpeg -y -i "${webmOut}" -vf "fps=8,scale=960:-1:flags=lanczos" -loop 0 "${gifOut}"`,
          { stdio: "inherit" },
        );
      } catch (e) {
        console.warn("GIF conversion failed:", e.message);
      }
    }

    try {
      for (const f of fs.readdirSync(VIDEO_RAW)) {
        fs.unlinkSync(path.join(VIDEO_RAW, f));
      }
      fs.rmdirSync(VIDEO_RAW);
    } catch {
      /* ignore */
    }

    const acResults = results.filter((r) => r.id.startsWith("AC"));
    const summary = {
      issue: "LUC-25",
      pr: 5,
      prd: "https://linear.app/lucaskamakura/issue/LUC-25/add-left-mouse-drag-to-pan-for-the-blueprint-canvas",
      commit: "3d50ec9ac47293a74435a826e04abd65e1d3a0d0",
      changeType: "frontend-only",
      results,
      passed: acResults.filter((r) => r.pass).length,
      failed: acResults.filter((r) => !r.pass).length,
      verdict: acResults.length && acResults.every((r) => r.pass) ? "APPROVE" : "REJECT",
    };
    fs.writeFileSync(
      path.join(ARTIFACTS, "results.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.verdict === "APPROVE" ? 0 : 1);
  }
}

main();
