import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const OUT = path.resolve("qa/e2e-luc-21/artifacts");
const VIDEO_DIR = path.join(OUT, "video-raw");
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

async function pause(page, ms = 1200) {
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function canvasBox(page) {
  const stage = page.locator(".konvajs-content canvas").first();
  await stage.waitFor({ state: "visible", timeout: 15000 });
  return stage.boundingBox();
}

async function clickCanvas(page, nx, ny, opts = {}) {
  const box = await canvasBox(page);
  if (!box) throw new Error("canvas not found");
  const x = box.x + box.width * nx;
  const y = box.y + box.height * ny;
  await page.mouse.click(x, y, opts);
  return { x, y, box };
}

async function dragCanvas(page, n1x, n1y, n2x, n2y) {
  const box = await canvasBox(page);
  if (!box) throw new Error("canvas not found");
  const x1 = box.x + box.width * n1x;
  const y1 = box.y + box.height * n1y;
  const x2 = box.x + box.width * n2x;
  const y2 = box.y + box.height * n2y;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await pause(page, 400);
  // slow drag for video readability
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      x1 + ((x2 - x1) * i) / steps,
      y1 + ((y2 - y1) * i) / steps,
    );
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}

async function readPlan(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("dimensional.plan.v2");
    return raw ? JSON.parse(raw) : null;
  });
}

async function main() {
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
    // Clear any prior state
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await pause(page, 1500);
    await shot(page, "01-empty-state.png");

    // AC1: start without upload
    const drawBtn = page.getByRole("button", { name: "Draw a plan" });
    const uploadBtn = page.getByRole("button", { name: "Upload floor plan" });
    if (!(await drawBtn.isVisible()) || !(await uploadBtn.isVisible())) {
      fail("AC1", "Empty state missing Draw a plan / Upload floor plan");
    } else {
      await drawBtn.click();
      await pause(page, 1800);
      const wallTool = page.getByRole("button", { name: "Wall", exact: true });
      const scalePill = page.locator("text=Scale not set");
      const hasCanvas = await page.locator(".konvajs-content canvas").count();
      if ((await wallTool.isVisible()) && (await scalePill.count()) > 0 && hasCanvas > 0) {
        pass("AC1", "Draw a plan opens blank canvas with draw tools, no image upload");
      } else {
        fail(
          "AC1",
          `Blank plan UI incomplete (wall=${await wallTool.isVisible()}, canvas=${hasCanvas})`,
        );
      }
      await shot(page, "02-blank-plan.png");
    }

    // AC2: draw walls and rooms
    await page.getByRole("button", { name: "Wall", exact: true }).click();
    await pause(page, 800);
    await clickCanvas(page, 0.25, 0.3);
    await pause(page, 700);
    await clickCanvas(page, 0.7, 0.3);
    await pause(page, 1200);

    await page.getByRole("button", { name: "Room", exact: true }).click();
    await pause(page, 800);
    await dragCanvas(page, 0.28, 0.38, 0.62, 0.72);
    await pause(page, 1500);

    let plan = await readPlan(page);
    const walls = (plan?.elements || []).filter((e) => e.kind === "wall");
    const rooms = (plan?.elements || []).filter((e) => e.kind === "room");
    if (walls.length >= 1 && rooms.length >= 1) {
      pass(
        "AC2",
        `Drew wall(s)=${walls.length} and room(s)=${rooms.length} on canvas`,
      );
    } else {
      fail(
        "AC2",
        `Expected wall+room; got elements=${JSON.stringify(plan?.elements || [])}`,
      );
    }
    await shot(page, "03-drawn-geometry.png");

    // AC3: select + delete
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await pause(page, 700);
    // click near wall midpoint
    await clickCanvas(page, 0.48, 0.3);
    await pause(page, 1000);
    plan = await readPlan(page);
    const beforeDelete = plan?.elements?.length ?? 0;
    await page.keyboard.press("Delete");
    await pause(page, 1200);
    plan = await readPlan(page);
    const afterDelete = plan?.elements?.length ?? 0;
    if (beforeDelete > 0 && afterDelete === beforeDelete - 1) {
      pass(
        "AC3",
        `Selected and deleted geometry (${beforeDelete} → ${afterDelete})`,
      );
    } else {
      // try Backspace / click room then delete
      await clickCanvas(page, 0.45, 0.55);
      await pause(page, 800);
      const mid = (await readPlan(page))?.elements?.length ?? 0;
      await page.keyboard.press("Backspace");
      await pause(page, 1000);
      const end = (await readPlan(page))?.elements?.length ?? 0;
      if (mid > 0 && end === mid - 1) {
        pass("AC3", `Selected and deleted geometry via Backspace (${mid} → ${end})`);
      } else {
        fail(
          "AC3",
          `Delete did not remove element (before=${beforeDelete}, after=${afterDelete}, mid=${mid}, end=${end})`,
        );
      }
    }
    await shot(page, "04-after-delete.png");

    // Ensure at least one wall remains for calibrate / furniture demo
    plan = await readPlan(page);
    if ((plan?.elements || []).length === 0) {
      await page.getByRole("button", { name: "Wall", exact: true }).click();
      await pause(page, 500);
      await clickCanvas(page, 0.2, 0.25);
      await pause(page, 500);
      await clickCanvas(page, 0.75, 0.25);
      await pause(page, 800);
      await page.getByRole("button", { name: "Room", exact: true }).click();
      await pause(page, 500);
      await dragCanvas(page, 0.25, 0.35, 0.65, 0.7);
      await pause(page, 800);
    }

    // AC4: calibrate then place furniture
    await page.getByRole("button", { name: "Calibrate", exact: true }).click();
    await pause(page, 900);
    await clickCanvas(page, 0.3, 0.25);
    await pause(page, 800);
    await clickCanvas(page, 0.65, 0.25);
    await pause(page, 1200);

    const modal = page.getByRole("dialog");
    await modal.waitFor({ state: "visible", timeout: 8000 });
    await page.locator("#calib-length").fill("120");
    await pause(page, 800);
    await page.getByRole("button", { name: "Apply scale" }).click();
    await pause(page, 1500);

    const scaleSet = await page.locator("text=Scale set").count();
    const chairBtn = page.getByRole("button", { name: /Chair/i }).first();
    const chairEnabled = await chairBtn.isEnabled();
    if (scaleSet > 0 && chairEnabled) {
      await chairBtn.click();
      await pause(page, 1500);
      plan = await readPlan(page);
      if ((plan?.items || []).length >= 1 && plan.pixelsPerInch) {
        pass(
          "AC4",
          `Scale set (ppi=${plan.pixelsPerInch.toFixed?.(2) ?? plan.pixelsPerInch}); furniture items=${plan.items.length}`,
        );
      } else {
        fail(
          "AC4",
          `Scale/furniture incomplete: ppi=${plan?.pixelsPerInch}, items=${plan?.items?.length}`,
        );
      }
    } else {
      fail(
        "AC4",
        `Could not place after calibrate (scaleSet=${scaleSet}, chairEnabled=${chairEnabled})`,
      );
    }
    await shot(page, "05-furniture-placed.png");

    // AC5: persistence across reload
    plan = await readPlan(page);
    const snap = {
      elements: plan?.elements?.length ?? 0,
      items: plan?.items?.length ?? 0,
      ppi: plan?.pixelsPerInch,
      canvasWidth: plan?.canvasWidth,
      imageDataUrl: plan?.imageDataUrl,
    };
    await page.reload();
    await pause(page, 2000);
    const after = await readPlan(page);
    const afterSnap = {
      elements: after?.elements?.length ?? 0,
      items: after?.items?.length ?? 0,
      ppi: after?.pixelsPerInch,
      canvasWidth: after?.canvasWidth,
      imageDataUrl: after?.imageDataUrl,
    };
    const persisted =
      afterSnap.elements === snap.elements &&
      afterSnap.items === snap.items &&
      afterSnap.ppi === snap.ppi &&
      afterSnap.canvasWidth === snap.canvasWidth &&
      afterSnap.imageDataUrl == null &&
      afterSnap.elements >= 1;
    if (persisted) {
      pass(
        "AC5",
        `Reload kept drawn-only plan: elements=${afterSnap.elements}, items=${afterSnap.items}, ppi=${afterSnap.ppi}`,
      );
    } else {
      fail("AC5", `Persistence mismatch before=${JSON.stringify(snap)} after=${JSON.stringify(afterSnap)}`);
    }
    await shot(page, "06-after-reload.png");

    // AC6: upload path still works
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await pause(page, 1200);
    await shot(page, "07-reset-empty.png");

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles("/tmp/qa-luc-21/sample-floorplan.png");
    await pause(page, 2000);
    plan = await readPlan(page);
    const uploadOk =
      typeof plan?.imageDataUrl === "string" &&
      plan.imageDataUrl.startsWith("data:image") &&
      (await page.locator(".konvajs-content canvas").count()) > 0 &&
      (await page.getByRole("button", { name: "Calibrate", exact: true }).isVisible());
    if (uploadOk) {
      pass("AC6", "Upload floor plan still loads image and shows calibrate tools");
    } else {
      fail(
        "AC6",
        `Upload path broken: hasImage=${Boolean(plan?.imageDataUrl)}, elements cleared? ${plan?.elements?.length}`,
      );
    }
    await shot(page, "08-upload-path.png");

    // Hold final frame for video readability
    await pause(page, 2000);
  } finally {
    await context.close();
    await browser.close();
  }

  // Move/rename video
  const videos = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  let videoPath = null;
  if (videos.length) {
    videoPath = path.join(OUT, "luc-21-e2e.webm");
    fs.renameSync(path.join(VIDEO_DIR, videos[0]), videoPath);
  }

  // Convert to gif (slower / readable) if ffmpeg available
  let gifPath = null;
  if (videoPath && fs.existsSync(videoPath)) {
    gifPath = path.join(OUT, "luc-21-e2e.gif");
    try {
      execSync(
        `ffmpeg -y -i "${videoPath}" -vf "fps=8,scale=900:-1:flags=lanczos" -loop 0 "${gifPath}"`,
        { stdio: "pipe" },
      );
    } catch (e) {
      console.warn("gif conversion failed", e.message);
      gifPath = null;
    }
  }

  const summary = {
    issue: "LUC-21",
    pr: "https://github.com/lkamak/dimensional/pull/2",
    commit: execSync("git rev-parse --short HEAD").toString().trim(),
    results,
    allPassed: results.every((r) => r.status === "PASS"),
    artifacts: {
      video: videoPath ? path.relative(process.cwd(), videoPath) : null,
      gif: gifPath ? path.relative(process.cwd(), gifPath) : null,
      screenshots: fs
        .readdirSync(OUT)
        .filter((f) => f.endsWith(".png"))
        .sort()
        .map((f) => path.join("qa/e2e-luc-21/artifacts", f)),
    },
  };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
