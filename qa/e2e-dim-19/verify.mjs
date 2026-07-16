import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ARTIFACTS = path.join(__dirname, "artifacts");
const VIDEO_DIR = path.join(ARTIFACTS, "video-raw");
const FIXTURE = path.join(ROOT, "qa/fixtures/simple-floorplan.png");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const PR_COMMIT =
  process.env.GIT_COMMIT || "c784d6b57f089217b9f9ea5a444a441afcd02f00";
const SESSION_KEY = "dimensional.session.v2";
const IMAGE_W = 480;
const IMAGE_H = 360;

fs.mkdirSync(ARTIFACTS, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const results = [];
function record(id, criterion, pass, detail) {
  results.push({ id, criterion, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${criterion} — ${detail}`);
}

async function pause(page, ms = 1400) {
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(ARTIFACTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function bindStage(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".canvas-area");
    if (!root) return false;
    const fiberKey = Object.keys(root).find((k) =>
      k.startsWith("__reactFiber"),
    );
    if (!fiberKey) return false;
    let found = null;
    function walk(n, depth) {
      if (!n || depth > 50 || found) return;
      let s = n.memoizedState;
      let hookIdx = 0;
      while (s && hookIdx < 50) {
        const memo = s.memoizedState;
        if (
          memo &&
          typeof memo === "object" &&
          memo.current &&
          typeof memo.current.x === "function" &&
          typeof memo.current.scaleX === "function" &&
          typeof memo.current.container === "function" &&
          typeof memo.current.find === "function"
        ) {
          found = memo.current;
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
    return Boolean(found);
  });
}

async function getStageMeta(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return null;
    return {
      x: stage.x(),
      y: stage.y(),
      scale: stage.scaleX(),
      cursor: stage.container()?.style?.cursor || "",
    };
  });
}

/** Find the rotation handle Circle (white fill, teal stroke, above furniture). */
async function findRotateHandle(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return null;
    const circles = stage.find("Circle");
    for (const c of circles) {
      const fill = c.fill();
      const stroke = c.stroke();
      if (fill === "#f7f7f4" && stroke === "#3d5a5b") {
        const abs = c.getAbsolutePosition();
        const transform = c.getAbsoluteTransform().copy();
        // Approximate on-screen radius from world radius * stage scale
        const parent = c.getParent();
        return {
          absX: abs.x,
          absY: abs.y,
          radius: c.radius(),
          hitStrokeWidth: c.hitStrokeWidth?.() ?? null,
          visible: c.visible() && c.getLayer() != null,
          parentRotation: parent?.rotation?.() ?? null,
          listening: c.listening(),
        };
      }
    }
    return null;
  });
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".canvas-area canvas");
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

async function handleScreenPos(page) {
  const handle = await findRotateHandle(page);
  const stage = await getStageMeta(page);
  const rect = await canvasRect(page);
  if (!handle || !stage || !rect) return null;
  // abs position from Konva is in stage/container pixel space (already scaled)
  return {
    x: rect.left + handle.absX,
    y: rect.top + handle.absY,
    radius: handle.radius,
    handle,
    stage,
  };
}

async function itemScreenCenter(page, kind = "couch") {
  await bindStage(page);
  const rect = await canvasRect(page);
  const stage = await getStageMeta(page);
  const plan = await readPlan(page);
  const item =
    plan?.plan?.items?.find((i) => i.kind === kind) || plan?.plan?.items?.[0];
  if (!item || !rect || !stage) return null;
  return {
    x: rect.left + stage.x + item.x * stage.scale,
    y: rect.top + stage.y + item.y * stage.scale,
    item,
    stage,
  };
}

async function selectItem(page, kind = "couch") {
  await page.getByRole("button", { name: /^Select$/i }).click();
  await pause(page, 300);
  const c = await itemScreenCenter(page, kind);
  if (!c) throw new Error(`selectItem: no ${kind}`);
  // Click slightly inside the body, offset from center toward bottom-right
  // so we avoid the top-edge rotation handle.
  await page.mouse.click(c.x + 8, c.y + 12);
  await pause(page, 700);
  return c;
}

async function deleteSelected(page) {
  const btn = page.getByRole("button", { name: /^Delete$/i });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await pause(page, 600);
  }
}

async function worldToScreen(page, worldX, worldY) {
  const stage = await getStageMeta(page);
  const rect = await canvasRect(page);
  if (!stage || !rect) return null;
  return {
    x: rect.left + stage.x + worldX * stage.scale,
    y: rect.top + stage.y + worldY * stage.scale,
    scale: stage.scale,
  };
}

async function slowDrag(page, x1, y1, x2, y2, steps = 20, stepDelay = 70) {
  await page.mouse.move(x1, y1);
  await pause(page, 400);
  await page.mouse.down();
  await pause(page, 450);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      x1 + ((x2 - x1) * i) / steps,
      y1 + ((y2 - y1) * i) / steps,
    );
    await page.waitForTimeout(stepDelay);
  }
  await pause(page, 350);
  await page.mouse.up();
  await pause(page, 700);
}

async function readPlan(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SESSION_KEY);
}

async function getInspectorRotation(page) {
  const input = page.locator("#item-rotation");
  if (!(await input.isVisible().catch(() => false))) return null;
  return Number(await input.inputValue());
}

async function getSelectedId(page) {
  // Infer selection from inspector visibility + plan item
  const visible = await page.locator("#item-rotation").isVisible().catch(() => false);
  if (!visible) return null;
  const plan = await readPlan(page);
  return plan?.plan?.items?.[0]?.id ?? null;
}

async function clickWorld(page, worldX, worldY) {
  const p = await worldToScreen(page, worldX, worldY);
  if (!p) throw new Error("worldToScreen failed");
  await page.mouse.click(p.x, p.y);
  return p;
}

async function calibrate(page) {
  const hint = page.locator("text=Click two points");
  if (!(await hint.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 500);
  }
  await clickWorld(page, 80, 180);
  await pause(page, 700);
  await clickWorld(page, 400, 180);
  await pause(page, 700);
  await page.waitForSelector("text=Set real length", { timeout: 10000 });
  await page.locator("#calib-length").fill("120");
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1200);
}

async function setStageScale(page, targetScale) {
  await bindStage(page);
  return page.evaluate((target) => {
    const stage = window.__qaStage;
    if (!stage) return null;
    const oldScale = stage.scaleX();
    const pointer = { x: stage.width() / 2, y: stage.height() / 2 };
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: target, y: target });
    stage.position({
      x: pointer.x - mousePointTo.x * target,
      y: pointer.y - mousePointTo.y * target,
    });
    stage.batchDraw();
    // Also try to sync React state by dispatching a synthetic wheel won't work;
    // mutate via fiber is hard — use internal if exposed. For visual checks we
    // need React scale state. Return and use wheel instead when possible.
    return { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
  }, targetScale);
}

/** Drive zoom with wheel events until close to target. */
async function zoomToward(page, targetScale, maxSteps = 40) {
  const rect = await canvasRect(page);
  if (!rect) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < maxSteps; i++) {
    const meta = await getStageMeta(page);
    if (!meta) return null;
    if (Math.abs(meta.scale - targetScale) / targetScale < 0.08) return meta;
    const direction = meta.scale < targetScale ? -1 : 1; // negative deltaY zooms in
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, direction * 120);
    await page.waitForTimeout(80);
  }
  return getStageMeta(page);
}

async function countRotateHandles(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return 0;
    return stage
      .find("Circle")
      .filter((c) => c.fill() === "#f7f7f4" && c.stroke() === "#3d5a5b").length;
  });
}

async function getFurnitureGroupRotation(page) {
  await bindStage(page);
  return page.evaluate(() => {
    const stage = window.__qaStage;
    if (!stage) return null;
    // Furniture groups have a Rect child + Text and optionally the rotate handle
    const groups = stage.find("Group");
    for (const g of groups) {
      const circles = g.find("Circle");
      const hasHandle = circles.some(
        (c) => c.fill() === "#f7f7f4" && c.stroke() === "#3d5a5b",
      );
      const rects = g.find("Rect");
      if (rects.length && (hasHandle || g.rotation() !== 0 || true)) {
        // Prefer group that looks like furniture (has Text label)
        const texts = g.find("Text");
        if (texts.length) {
          return {
            rotation: g.rotation(),
            x: g.x(),
            y: g.y(),
            hasHandle,
          };
        }
      }
    }
    return null;
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: true,
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  let videoPath = null;

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((key) => localStorage.clear(), SESSION_KEY);
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1600);
    await shot(page, "01-empty");

    // Upload + calibrate
    await page.locator('header input[type="file"]').setInputFiles(FIXTURE);
    await pause(page, 1600);
    await page.waitForSelector(".canvas-area canvas", { timeout: 15000 });
    await bindStage(page);
    await shot(page, "02-uploaded");
    await calibrate(page);
    await shot(page, "03-calibrated");

    // Place sofa (auto-selects)
    await page.getByRole("button", { name: "Sofa" }).click();
    await pause(page, 1400);
    await shot(page, "04-furniture-selected");

    let plan = await readPlan(page);
    let sofa = plan?.plan?.items?.[0];
    if (!sofa) throw new Error("Sofa was not placed");

    // AC1: handle visible when selected in Select mode
    await page.getByRole("button", { name: /^Select$/i }).click();
    await pause(page, 800);
    let handleCount = await countRotateHandles(page);
    let handlePos = await handleScreenPos(page);
    const ac1 =
      handleCount === 1 &&
      handlePos != null &&
      (await page.locator("#item-rotation").isVisible());
    record(
      "AC1",
      "Selecting furniture in Select mode displays a small rotation handle adjacent to the item.",
      ac1,
      `handles=${handleCount}, screen=(${handlePos?.x?.toFixed?.(1)}, ${handlePos?.y?.toFixed?.(1)}), radiusWorld=${handlePos?.radius}`,
    );
    await shot(page, "05-handle-visible");
    await pause(page, 1200);

    // Capture pre-drag state
    const before = {
      x: sofa.x,
      y: sofa.y,
      rotation: sofa.rotation,
      id: sofa.id,
    };
    const center = await itemScreenCenter(page);
    handlePos = await handleScreenPos(page);
    if (!handlePos || !center) throw new Error("Could not locate handle/center");

    // AC2 + AC3 + AC4: drag handle to ~90° (to the right of center)
    // Handle starts above item; drag to right of center for ~90°
    const dragTargetX = center.x + 160;
    const dragTargetY = center.y;
    // Capture mid-drag preview
    await page.mouse.move(handlePos.x, handlePos.y);
    await pause(page, 500);
    await page.mouse.down();
    await pause(page, 400);
    const midSteps = 12;
    for (let i = 1; i <= midSteps; i++) {
      await page.mouse.move(
        handlePos.x + ((dragTargetX - handlePos.x) * i) / midSteps,
        handlePos.y + ((dragTargetY - handlePos.y) * i) / midSteps,
      );
      await page.waitForTimeout(80);
    }
    await pause(page, 600);
    const midGroup = await getFurnitureGroupRotation(page);
    const midPlan = await readPlan(page);
    const midStored = midPlan?.plan?.items?.[0]?.rotation;
    await shot(page, "06-drag-preview");
    await page.mouse.up();
    await pause(page, 1000);
    await shot(page, "07-after-release");

    plan = await readPlan(page);
    sofa = plan.plan.items[0];
    const inspectorRot = await getInspectorRotation(page);

    const previewedDuringDrag =
      midGroup != null &&
      Math.abs(midGroup.rotation - before.rotation) > 5 &&
      midStored === before.rotation; // not committed until release
    record(
      "AC2",
      "Dragging the handle rotates the furniture smoothly around its center and previews the result during the drag.",
      previewedDuringDrag &&
        Math.abs(sofa.x - before.x) < 0.5 &&
        Math.abs(sofa.y - before.y) < 0.5,
      `midGroupRot=${midGroup?.rotation}, midStored=${midStored}, posDelta=(${(sofa.x - before.x).toFixed(2)}, ${(sofa.y - before.y).toFixed(2)})`,
    );

    const snapped =
      sofa.rotation % 15 === 0 &&
      sofa.rotation >= 0 &&
      sofa.rotation < 360 &&
      sofa.rotation !== before.rotation;
    record(
      "AC3",
      "The resulting angle snaps to 15° increments and remains normalized to 0–359°.",
      snapped,
      `rotation=${sofa.rotation}`,
    );

    const committed =
      inspectorRot === sofa.rotation && sofa.rotation !== before.rotation;
    // Place a second overlapping item to check overlap styling after rotation
    await page.getByRole("button", { name: "Armchair" }).click();
    await pause(page, 900);
    plan = await readPlan(page);
    const chair = plan.plan.items.find((i) => i.kind === "chair");
    if (chair) {
      await page.evaluate(
        ({ key, chairId, sx, sy }) => {
          const raw = JSON.parse(localStorage.getItem(key));
          raw.plan.items = raw.plan.items.map((it) => {
            if (it.id === chairId) return { ...it, x: sx + 20, y: sy + 10 };
            return it;
          });
          localStorage.setItem(key, JSON.stringify(raw));
        },
        { key: SESSION_KEY, chairId: chair.id, sx: sofa.x, sy: sofa.y },
      );
      await page.reload({ waitUntil: "networkidle" });
      await pause(page, 1400);
      await bindStage(page);
      await selectItem(page, "couch");
    }
    await shot(page, "08-overlap-after-rotation");
    const overlapStroke = await page.evaluate(() => {
      const stage = window.__qaStage;
      if (!stage) return [];
      return stage
        .find("Rect")
        .map((r) => ({ stroke: r.stroke(), fill: r.fill() }))
        .filter((r) => r.stroke === "#8b4a42");
    });
    record(
      "AC4",
      "Releasing the handle commits the final rotation; the Inspector value and rotation-aware overlap styling reflect the new angle.",
      committed && overlapStroke.length >= 1,
      `inspector=${inspectorRot}, stored=${sofa.rotation}, overlapRects=${overlapStroke.length}`,
    );

    // Remove chair so body-drag tests are unambiguous, then reselect sofa
    await selectItem(page, "chair");
    await deleteSelected(page);
    await selectItem(page, "couch");
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const posBeforeHandleDrag = { x: sofa.x, y: sofa.y, rotation: sofa.rotation };
    handlePos = await handleScreenPos(page);
    const center2 = await itemScreenCenter(page, "couch");
    if (handlePos && center2) {
      await slowDrag(
        page,
        handlePos.x,
        handlePos.y,
        center2.x - 140,
        center2.y,
        16,
        60,
      );
    }
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const stillSelected = await page.locator("#item-rotation").isVisible();
    const selectedLabel = await page
      .locator(".inspector, aside")
      .filter({ has: page.locator("#item-rotation") })
      .locator("input")
      .first()
      .inputValue()
      .catch(() => "");
    const noMove =
      Math.abs(sofa.x - posBeforeHandleDrag.x) < 0.5 &&
      Math.abs(sofa.y - posBeforeHandleDrag.y) < 0.5;
    await shot(page, "09-after-handle-drag-no-move");

    // Body drag should still move (click offset avoids handle)
    const beforeBody = { x: sofa.x, y: sofa.y };
    const body = await itemScreenCenter(page, "couch");
    if (body) {
      await slowDrag(
        page,
        body.x + 10,
        body.y + 16,
        body.x + 90,
        body.y + 50,
        14,
        55,
      );
    }
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const bodyMoved =
      Math.hypot(sofa.x - beforeBody.x, sofa.y - beforeBody.y) > 10;
    await shot(page, "10-after-body-drag");
    record(
      "AC5",
      "Dragging the handle neither moves nor deselects the furniture, while dragging the furniture body still moves it normally.",
      noMove && stillSelected && bodyMoved,
      `handleNoMove=${noMove}, stillSelected=${stillSelected}, label=${selectedLabel}, bodyMoved=${bodyMoved}, dPos=${Math.hypot(sofa.x - beforeBody.x, sofa.y - beforeBody.y).toFixed(1)}`,
    );

    // AC6: hidden during Space-pan / calibrate / draw (no dedicated Pan tool)
    await selectItem(page, "couch");
    const selectHandles = await countRotateHandles(page);
    await page.keyboard.down("Space");
    await pause(page, 500);
    const spaceHandles = await countRotateHandles(page);
    await shot(page, "11-space-pan-no-handle");
    await page.keyboard.up("Space");
    await pause(page, 400);
    await page.getByRole("button", { name: /^Calibrate$/i }).click();
    await pause(page, 800);
    const calibHandles = await countRotateHandles(page);
    await shot(page, "12-calibrate-mode-no-handle");
    await page.getByRole("button", { name: /^Wall$/i }).click();
    await pause(page, 800);
    const drawHandles = await countRotateHandles(page);
    await shot(page, "13-draw-mode-no-handle");
    record(
      "AC6",
      "The handle is hidden/inactive during pan, calibration, and draw modes.",
      selectHandles === 1 &&
        spaceHandles === 0 &&
        calibHandles === 0 &&
        drawHandles === 0,
      `select=${selectHandles}, spacePan=${spaceHandles}, calib=${calibHandles}, draw=${drawHandles}`,
    );

    // AC7: touch + cleanup (mouse already proven in AC2–AC5)
    await selectItem(page, "couch");
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const touchBefore = sofa.rotation;
    handlePos = await handleScreenPos(page);
    const touchCenter = await itemScreenCenter(page, "couch");
    let touchOk = false;
    let cancelOk = false;
    if (handlePos && touchCenter) {
      // Drive Konva touch handlers via CDP touch events on the handle
      const client = await context.newCDPSession(page);
      const toTouch = (x, y) => [{ x: Math.round(x), y: Math.round(y) }];
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: toTouch(handlePos.x, handlePos.y),
      });
      await pause(page, 300);
      const tSteps = 12;
      for (let i = 1; i <= tSteps; i++) {
        const x = handlePos.x + ((touchCenter.x - handlePos.x) * i) / tSteps;
        const y =
          handlePos.y + ((touchCenter.y + 160 - handlePos.y) * i) / tSteps;
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: toTouch(x, y),
        });
        await page.waitForTimeout(60);
      }
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await pause(page, 1000);
      plan = await readPlan(page);
      sofa = plan.plan.items.find((i) => i.kind === "couch");
      touchOk = sofa.rotation !== touchBefore && sofa.rotation % 15 === 0;

      // Cancel cleanup: start rotate then pointercancel on window
      handlePos = await handleScreenPos(page);
      if (handlePos) {
        await page.mouse.move(handlePos.x, handlePos.y);
        await page.mouse.down();
        await pause(page, 200);
        await page.evaluate(() => {
          window.dispatchEvent(
            new PointerEvent("pointercancel", {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
              pointerType: "mouse",
              buttons: 0,
            }),
          );
        });
        await page.mouse.up().catch(() => {});
        await pause(page, 700);
        const meta = await getStageMeta(page);
        const handlesAfterCancel = await countRotateHandles(page);
        cancelOk = meta?.cursor !== "grabbing" && handlesAfterCancel === 1;
      }
      await client.detach().catch(() => {});
    }
    await shot(page, "14-touch-and-cancel");
    record(
      "AC7",
      "Mouse and touch interactions work, including cleanup when the interaction is cancelled or released.",
      touchOk && cancelOk,
      `touchOk=${touchOk}, cancelOk=${cancelOk}, rotation=${sofa?.rotation}`,
    );

    // AC8: zoom-invariant handle size (screen radius ≈ constant)
    await selectItem(page, "couch");
    const midZoom = await getStageMeta(page);
    const midHandle = await findRotateHandle(page);
    // Screen radius ≈ worldRadius * stageScale; code uses radius = 5/scale so screen ≈ 5
    const midScreenR =
      midHandle && midZoom ? midHandle.radius * midZoom.scale : null;

    const minMeta = await zoomToward(page, 0.2);
    await pause(page, 700);
    await selectItem(page, "couch");
    const minHandle = await findRotateHandle(page);
    const minScreenR =
      minHandle && minMeta ? minHandle.radius * minMeta.scale : null;
    await shot(page, "15-zoom-min");

    const maxMeta = await zoomToward(page, 3.5);
    await pause(page, 700);
    await selectItem(page, "couch");
    const maxHandle = await findRotateHandle(page);
    const maxScreenR =
      maxHandle && maxMeta ? maxHandle.radius * maxMeta.scale : null;
    await shot(page, "16-zoom-max");

    const sizeOk =
      midScreenR != null &&
      minScreenR != null &&
      maxScreenR != null &&
      Math.abs(midScreenR - 5) < 0.6 &&
      Math.abs(minScreenR - 5) < 0.6 &&
      Math.abs(maxScreenR - 5) < 0.6;
    record(
      "AC8",
      "The handle remains a usable, visually consistent size at minimum and maximum supported zoom.",
      sizeOk,
      `screenR mid/min/max=${midScreenR?.toFixed?.(2)}/${minScreenR?.toFixed?.(2)}/${maxScreenR?.toFixed?.(2)} (target≈5)`,
    );

    // Reset zoom toward fit
    await zoomToward(page, midZoom?.scale ?? 1);
    await pause(page, 500);

    // AC9: persistence after reload
    await selectItem(page, "couch");
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const persistedRotation = sofa.rotation;
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1500);
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const afterReload = sofa?.rotation;
    await shot(page, "17-after-reload");
    record(
      "AC9",
      "Rotation persists after reload through the existing saved session and saved-plan flows.",
      afterReload === persistedRotation && persistedRotation != null,
      `beforeReload=${persistedRotation}, afterReload=${afterReload}`,
    );

    // AC10: Inspector controls still work
    await selectItem(page, "couch");
    const beforeInsp = await getInspectorRotation(page);
    await page.getByRole("button", { name: /Rotate \+15/i }).click();
    await pause(page, 700);
    const afterPlus = await getInspectorRotation(page);
    await page.getByRole("button", { name: /Rotate −15|Rotate -15/i }).click();
    await pause(page, 700);
    const afterMinus = await getInspectorRotation(page);
    await page.locator("#item-rotation").fill("45");
    await page.locator("#item-rotation").blur();
    await pause(page, 700);
    plan = await readPlan(page);
    sofa = plan.plan.items.find((i) => i.kind === "couch");
    const inputSet =
      sofa.rotation === 45 || (await getInspectorRotation(page)) === 45;
    await shot(page, "18-inspector-controls");
    const plusOk =
      beforeInsp != null &&
      afterPlus != null &&
      (afterPlus - beforeInsp + 360) % 360 === 15;
    const minusOk =
      afterPlus != null &&
      afterMinus != null &&
      (afterPlus - afterMinus + 360) % 360 === 15;
    record(
      "AC10",
      "Existing Inspector rotation input and ±15° buttons continue to work.",
      plusOk && minusOk && inputSet,
      `before=${beforeInsp}, +15→${afterPlus}, -15→${afterMinus}, input45=${sofa.rotation}`,
    );

    await pause(page, 1600);
    await shot(page, "19-final");
  } catch (err) {
    console.error("Harness error:", err);
    await shot(page, "99-error").catch(() => {});
    record("HARNESS", "Harness completed without uncaught errors", false, String(err));
  } finally {
    videoPath = await page.video()?.path();
    await context.close();
    await browser.close();
  }

  // Move video
  if (videoPath && fs.existsSync(videoPath)) {
    const dest = path.join(ARTIFACTS, "dim-19-e2e-demo.webm");
    fs.renameSync(videoPath, dest);
    videoPath = dest;
    console.log("Video:", dest);
  }

  // GIF via ffmpeg (sampled, slower playback feel)
  const gifPath = path.join(ARTIFACTS, "dim-19-e2e-demo.gif");
  const previewGif = path.join(ARTIFACTS, "dim-19-e2e-preview.gif");
  if (videoPath && fs.existsSync(videoPath)) {
    try {
      execSync(
        `ffmpeg -y -i "${videoPath}" -vf "fps=8,scale=960:-1:flags=lanczos" -loop 0 "${gifPath}"`,
        { stdio: "pipe" },
      );
      execSync(
        `ffmpeg -y -i "${videoPath}" -vf "fps=5,scale=640:-1:flags=lanczos" -loop 0 "${previewGif}"`,
        { stdio: "pipe" },
      );
      console.log("GIF:", gifPath);
    } catch (e) {
      console.warn("GIF conversion failed:", e.message);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const summary = {
    pr: "https://github.com/lkamak/dimensional/pull/15",
    jira: "https://3p-agents.atlassian.net/browse/DIM-19",
    commit: PR_COMMIT,
    changeType: "frontend-only",
    passed,
    failed,
    verdict: failed === 0 && passed >= 10 ? "APPROVE" : "REJECT",
    results,
    artifacts: fs.readdirSync(ARTIFACTS).filter((f) => !f.includes("video-raw")),
  };
  fs.writeFileSync(
    path.join(ARTIFACTS, "results.json"),
    JSON.stringify(summary, null, 2),
  );

  const report = [
    `# DIM-19 E2E Verification Report`,
    ``,
    `- **PR:** #15`,
    `- **Jira:** [DIM-19](https://3p-agents.atlassian.net/browse/DIM-19)`,
    `- **Commit:** \`${PR_COMMIT}\``,
    `- **Change type:** frontend-only`,
    `- **Verdict:** ${summary.verdict}`,
    `- **Score:** ${passed}/${passed + failed}`,
    ``,
    `## Acceptance criteria`,
    ``,
    ...results.map(
      (r) =>
        `- ${r.pass ? "✅ PASS" : "❌ FAIL"} **${r.id}** — ${r.criterion}  \n  ${r.detail}`,
    ),
    ``,
    `## Artifacts`,
    ``,
    `- \`qa/e2e-dim-19/artifacts/dim-19-e2e-demo.webm\``,
    `- \`qa/e2e-dim-19/artifacts/dim-19-e2e-demo.gif\``,
    `- screenshots \`01\`–\`19\``,
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "REPORT.md"), report);

  console.log("\n" + report);
  console.log(`\nVERDICT=${summary.verdict}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
