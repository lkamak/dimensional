import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ARTIFACTS = path.join(__dirname, "artifacts");
const FIXTURE = path.join(ROOT, "qa/fixtures/simple-floorplan.png");
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

async function pause(page, ms = 1400) {
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
  if (!pt) throw new Error("Could not map world coords");
  await page.mouse.click(pt.x, pt.y, { delay: 40 });
  return pt;
}

async function ensureCalibrateMode(page) {
  const hint = page.getByText(/Click two points on a wall/i);
  if (await hint.isVisible().catch(() => false)) return;
  const calibrateBtn = page.getByRole("button", { name: "Calibrate" });
  const cls = (await calibrateBtn.getAttribute("class")) || "";
  if (!/btn-active/.test(cls)) {
    await calibrateBtn.click();
    await pause(page, 700);
  }
  await hint.waitFor({ state: "visible", timeout: 5000 });
}

async function calibrate(page) {
  await ensureCalibrateMode(page);
  await clickWorld(page, 80, 180);
  await pause(page, 900);
  await clickWorld(page, 400, 180);
  await pause(page, 1200);
  const lengthInput = page.locator("#calib-length");
  await lengthInput.waitFor({ state: "visible", timeout: 8000 });
  await lengthInput.fill("120");
  await pause(page, 600);
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1200);
}

function sessionPlan(page) {
  return page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("dimensional.session.v2") || "null",
    );
    const plan = session?.plan ?? null;
    const walls = (plan?.elements || []).filter((e) => e.kind === "wall");
    return {
      hasImage: Boolean(plan?.imageDataUrl),
      pixelsPerInch: plan?.pixelsPerInch ?? null,
      itemCount: plan?.items?.length ?? 0,
      itemLabels: (plan?.items || []).map((i) => i.label),
      elementCount: plan?.elements?.length ?? 0,
      wallCount: walls.length,
      walls,
      imageUnderlayVisible: plan?.imageUnderlayVisible,
      imageUnderlayOpacity: plan?.imageUnderlayOpacity,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: ARTIFACTS, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  let videoPath = null;

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1500);
    await shot(page, "01-empty");

    // Upload high-contrast blueprint fixture
    await page.locator('header input[type="file"]').setInputFiles(FIXTURE);
    await pause(page, 1600);
    await shot(page, "02-uploaded");

    // Calibrate scale
    await calibrate(page);
    let header = await page.locator("header").innerText();
    if (!/Scale set/i.test(header)) {
      await calibrate(page);
      header = await page.locator("header").innerText();
    }
    await shot(page, "03-calibrated");
    const scaleBefore = await sessionPlan(page);

    // Place furniture before conversion (AC5: must not destroy furniture)
    await page
      .locator("aside")
      .getByRole("button", { name: /^Sofa\b/ })
      .click();
    await pause(page, 1400);
    await shot(page, "04-furniture-placed");
    const beforeConvert = await sessionPlan(page);

    // Convert → cancel (non-destructive)
    await page.getByRole("button", { name: "Convert to drawing" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 20000 });
    await pause(page, 1600);
    await shot(page, "05-conversion-preview-cancel");

    const modalCancel = page.getByRole("dialog");
    const modalCancelText = await modalCancel.innerText();
    const detectedMatch = modalCancelText.match(/Detected (\d+) wall/);
    const detectedWalls = detectedMatch ? Number(detectedMatch[1]) : 0;

    await modalCancel.getByRole("button", { name: "Cancel" }).click();
    await pause(page, 1200);
    const afterCancel = await sessionPlan(page);
    await shot(page, "06-after-cancel");

    const cancelSafe =
      afterCancel.hasImage &&
      afterCancel.itemCount === beforeConvert.itemCount &&
      afterCancel.pixelsPerInch === beforeConvert.pixelsPerInch &&
      afterCancel.wallCount === beforeConvert.wallCount;

    // Convert → accept
    await page.getByRole("button", { name: "Convert to drawing" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 20000 });
    await pause(page, 1600);
    await shot(page, "07-conversion-preview-accept");

    const modalAccept = page.getByRole("dialog");
    const modalAcceptText = await modalAccept.innerText();
    const acceptBtn = modalAccept.getByRole("button", {
      name: /Accept \d+ walls/,
    });
    const canAccept = (await acceptBtn.count()) > 0;
    if (canAccept) {
      await acceptBtn.click();
      await pause(page, 1800);
    } else {
      await modalAccept.getByRole("button", { name: "Cancel" }).click();
      await pause(page, 800);
    }
    await shot(page, "08-walls-accepted");

    const afterAccept = await sessionPlan(page);
    header = await page.locator("header").innerText();

    record(
      "AC1",
      "User can convert an uploaded plan image into editable vector geometry",
      canAccept && afterAccept.wallCount > 0 && detectedWalls > 0,
      `detected=${detectedWalls}; acceptedWalls=${afterAccept.wallCount}; modal=${modalAcceptText.replace(/\n/g, " | ").slice(0, 220)}`,
    );

    // AC2: same DrawElement model / Wall tool as hand-drawn
    const wallBtnVisible = await page
      .getByRole("button", { name: /^Wall$/i })
      .isVisible();
    const wallsAreDrawElements =
      afterAccept.walls.length > 0 &&
      afterAccept.walls.every(
        (w) =>
          w.kind === "wall" &&
          typeof w.id === "string" &&
          typeof w.x1 === "number" &&
          typeof w.y1 === "number" &&
          typeof w.x2 === "number" &&
          typeof w.y2 === "number",
      );

    // Draw a hand wall with the same tool
    const wallCountBeforeDraw = afterAccept.wallCount;
    await page.getByRole("button", { name: /^Wall$/i }).click();
    await pause(page, 800);
    await clickWorld(page, 100, 60);
    await pause(page, 900);
    await clickWorld(page, 380, 60);
    await pause(page, 1200);
    await page.getByRole("button", { name: /^Select$/i }).click();
    await pause(page, 800);
    await shot(page, "09-hand-drawn-wall");
    const afterHandDraw = await sessionPlan(page);

    record(
      "AC2",
      "Converted geometry uses the same data model/tools as hand-drawn plans",
      wallsAreDrawElements &&
        wallBtnVisible &&
        afterHandDraw.wallCount === wallCountBeforeDraw + 1 &&
        /walls editable/i.test(header),
      `drawElements=${wallsAreDrawElements}; wallTool=${wallBtnVisible}; wallsAfterHandDraw=${afterHandDraw.wallCount}; header=${header.replace(/\n/g, " | ")}`,
    );

    // AC4: underlay toggle (do before delete so canvas still has context)
    const hideBtn = page.getByRole("button", { name: "Hide underlay" });
    const hideVisible = await hideBtn.isVisible();
    if (hideVisible) {
      await hideBtn.click();
      await pause(page, 1200);
    }
    await shot(page, "10-underlay-hidden");
    const underlayHidden = await sessionPlan(page);
    const showBtn = page.getByRole("button", { name: "Show underlay" });
    if (await showBtn.isVisible()) {
      await showBtn.click();
      await pause(page, 1000);
    }
    const underlayShown = await sessionPlan(page);
    await shot(page, "11-underlay-shown");

    record(
      "AC4",
      "Original image remains available as underlay or can be hidden after conversion",
      underlayHidden.hasImage &&
        underlayHidden.imageUnderlayVisible === false &&
        underlayShown.imageUnderlayVisible === true &&
        typeof underlayShown.imageUnderlayOpacity === "number" &&
        underlayShown.imageUnderlayOpacity < 1,
      `hasImage=${underlayHidden.hasImage}; hiddenVisible=${underlayHidden.imageUnderlayVisible}; shownVisible=${underlayShown.imageUnderlayVisible}; opacity=${underlayShown.imageUnderlayOpacity}`,
    );

    // AC3: select + delete a converted wall (avoid furniture layer hit-testing)
    await page.getByRole("button", { name: /^Select$/i }).click();
    await pause(page, 600);
    // Deselect sofa by clicking empty canvas outside the plan image
    await clickWorld(page, 10, 10);
    await pause(page, 800);

    // Prefer outer converted walls away from sofa (fixture rect edges / far from center)
    const convertedWalls = afterHandDraw.walls.filter((w) => {
      const midY = (w.y1 + w.y2) / 2;
      // Exclude the hand-drawn wall near y=60 spanning ~100–380
      const midX = (w.x1 + w.x2) / 2;
      const isHandDrawn =
        Math.abs(w.y1 - 60) < 8 &&
        Math.abs(w.y2 - 60) < 8 &&
        midX > 150 &&
        midX < 300;
      return !isHandDrawn && (midY < 70 || midY > 290 || midX < 60 || midX > 400);
    });
    const candidates =
      convertedWalls.length > 0 ? convertedWalls : afterHandDraw.walls;

    let inspectorVisible = false;
    let selectedWall = null;
    for (const wall of candidates) {
      // Click near an endpoint (less likely to hit furniture center)
      const tx = wall.x1;
      const ty = wall.y1;
      await clickWorld(page, tx, ty);
      await pause(page, 1000);
      const inspector = page
        .locator("aside")
        .filter({ hasText: /Wall segment/i });
      if (await inspector.isVisible().catch(() => false)) {
        inspectorVisible = true;
        selectedWall = wall;
        break;
      }
      // Retry midpoint if endpoint missed
      const midX = (wall.x1 + wall.x2) / 2;
      const midY = (wall.y1 + wall.y2) / 2;
      await clickWorld(page, midX, midY);
      await pause(page, 1000);
      if (await inspector.isVisible().catch(() => false)) {
        inspectorVisible = true;
        selectedWall = wall;
        break;
      }
    }
    await shot(page, "12-wall-selected");

    const deleteBtn = page.getByRole("button", { name: /^Delete$/i });
    const deleteVisible = await deleteBtn.isVisible().catch(() => false);
    const wallsBeforeDelete = (await sessionPlan(page)).wallCount;

    // Drag-edit proof: nudge selected wall if we have one, then delete
    let editMoved = false;
    if (inspectorVisible && selectedWall) {
      const midX = (selectedWall.x1 + selectedWall.x2) / 2;
      const midY = (selectedWall.y1 + selectedWall.y2) / 2;
      const start = await worldToScreen(page, midX, midY);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 20, start.y + 14, { steps: 10 });
      await page.mouse.up();
      await pause(page, 900);
      const afterDrag = await sessionPlan(page);
      const moved = afterDrag.walls.find((w) => w.id === selectedWall.id);
      editMoved = Boolean(
        moved &&
          (Math.abs(moved.x1 - selectedWall.x1) > 0.5 ||
            Math.abs(moved.y1 - selectedWall.y1) > 0.5),
      );
      // Ensure wall still selected for delete
      const stillSelected = await page
        .locator("aside")
        .filter({ hasText: /Wall segment/i })
        .isVisible()
        .catch(() => false);
      if (!stillSelected && moved) {
        await clickWorld(
          page,
          (moved.x1 + moved.x2) / 2,
          (moved.y1 + moved.y2) / 2,
        );
        await pause(page, 800);
      }
    }

    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
    } else {
      await page.keyboard.press("Delete");
    }
    await pause(page, 1200);
    await shot(page, "13-wall-deleted");
    const afterDelete = await sessionPlan(page);

    record(
      "AC3",
      "User can edit/delete converted elements after conversion",
      inspectorVisible &&
        afterDelete.wallCount === wallsBeforeDelete - 1,
      `inspector=${inspectorVisible}; deleteBtn=${deleteVisible}; editMoved=${editMoved}; before=${wallsBeforeDelete}; after=${afterDelete.wallCount}; selected=${selectedWall ? `${selectedWall.x1},${selectedWall.y1}->${selectedWall.x2},${selectedWall.y2}` : "none"}`,
    );

    // AC5: cancel path + accept keeps image & furniture
    record(
      "AC5",
      "Failed/poor conversion does not destroy the uploaded image or existing furniture without confirmation",
      cancelSafe &&
        afterAccept.hasImage &&
        afterAccept.itemCount === beforeConvert.itemCount &&
        afterAccept.itemLabels.includes("Sofa"),
      `cancelSafe=${cancelSafe}; afterAccept.items=${JSON.stringify(afterAccept.itemLabels)}; hasImage=${afterAccept.hasImage}; previewModal=${modalCancelText.replace(/\n/g, " | ").slice(0, 180)}`,
    );

    // AC6: scale remains valid
    record(
      "AC6",
      "Scale (pixelsPerInch) remains valid after conversion",
      typeof afterAccept.pixelsPerInch === "number" &&
        afterAccept.pixelsPerInch === scaleBefore.pixelsPerInch &&
        /Scale set/i.test(header),
      `before=${scaleBefore.pixelsPerInch}; afterAccept=${afterAccept.pixelsPerInch}; afterDelete=${afterDelete.pixelsPerInch}; header=${header.replace(/\n/g, " | ")}`,
    );

    await pause(page, 1500);
    await shot(page, "14-final");
  } finally {
    videoPath = await page.video()?.path();
    await page.close();
    await context.close();
    await browser.close();
  }

  // Rename video
  const webmDest = path.join(ARTIFACTS, "luc-22-e2e-demo.webm");
  if (videoPath && fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, webmDest);
  }

  // Build GIF from key screenshots (slow enough for reviewers)
  const gifFrames = [
    "02-uploaded.png",
    "03-calibrated.png",
    "04-furniture-placed.png",
    "05-conversion-preview-cancel.png",
    "08-walls-accepted.png",
    "09-hand-drawn-wall.png",
    "10-underlay-hidden.png",
    "12-wall-selected.png",
    "13-wall-deleted.png",
    "14-final.png",
  ]
    .map((f) => path.join(ARTIFACTS, f))
    .filter((f) => fs.existsSync(f));

  const gifDest = path.join(ARTIFACTS, "luc-22-e2e-demo.gif");
  try {
    const listFile = path.join(ARTIFACTS, "gif-frames.txt");
    fs.writeFileSync(
      listFile,
      gifFrames.map((f) => `file '${f}'\nduration 1.4`).join("\n") +
        `\nfile '${gifFrames[gifFrames.length - 1]}'\n`,
    );
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -vf "fps=2,scale=960:-1:flags=lanczos" -loop 0 "${gifDest}"`,
      { stdio: "pipe" },
    );
  } catch (err) {
    console.warn("GIF generation failed:", err.message);
  }

  const summary = {
    commit: COMMIT,
    prd: "LUC-22",
    changeType: "frontend-only",
    passed: results.every((r) => r.pass),
    results,
    artifacts: fs.readdirSync(ARTIFACTS).filter((f) => !f.endsWith(".txt")),
  };
  fs.writeFileSync(
    path.join(ARTIFACTS, "results.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
