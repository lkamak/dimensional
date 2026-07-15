import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const ARTIFACTS = path.join(ROOT, "qa/e2e-luc-23/artifacts");
const FIXTURE = path.join(ROOT, "qa/e2e-luc-23/fixtures/floorplan.png");
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

async function calibrate(page) {
  await ensureCalibrateMode(page);
  const canvas = page.locator(".canvas-area canvas").first();
  await canvas.waitFor({ state: "visible" });

  let a = await worldToScreen(page, 100, 400);
  let b = await worldToScreen(page, 360, 400);
  if (!a || !b) {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas not found");
    a = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.7 };
    b = { x: a.x + 150, y: a.y };
  }

  await page.mouse.click(a.x, a.y, { delay: 50 });
  await pause(page, 900);
  await page.mouse.click(b.x, b.y, { delay: 50 });
  await pause(page, 1200);

  const lengthInput = page.locator("#calib-length");
  await lengthInput.waitFor({ state: "visible", timeout: 8000 });
  await lengthInput.fill("10");
  await pause(page, 600);
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1000);
}

async function placeFurniture(page, label) {
  await page
    .locator("aside")
    .getByRole("button", { name: new RegExp(`^${label}\\b`) })
    .click();
  await pause(page, 1000);
}

async function drawWall(page) {
  await page.getByRole("button", { name: /^Wall$/i }).click();
  await pause(page, 700);
  const p1 = await worldToScreen(page, 80, 80);
  const p2 = await worldToScreen(page, 280, 80);
  if (!p1 || !p2) throw new Error("Could not map wall points");
  await page.mouse.click(p1.x, p1.y, { delay: 40 });
  await pause(page, 700);
  await page.mouse.click(p2.x, p2.y, { delay: 40 });
  await pause(page, 1000);
  await page.getByRole("button", { name: /^Select$/i }).click();
  await pause(page, 600);
}

async function openNamedPlan(page, name) {
  await page
    .getByRole("dialog")
    .locator("li")
    .filter({ hasText: name })
    .locator("button")
    .first()
    .click();
  await pause(page, 1500);
}

function listLibrary(page) {
  return page.evaluate(() => {
    const index = JSON.parse(
      localStorage.getItem("dimensional.library.index.v2") || '{"plans":[]}',
    );
    return (index.plans || []).map((p) => {
      const entry = JSON.parse(
        localStorage.getItem(`dimensional.library.plan.${p.id}.v2`) || "null",
      );
      return {
        id: p.id,
        name: p.name,
        kind: p.kind ?? entry?.kind ?? null,
        itemCount: entry?.state?.items?.length ?? 0,
        hasImage: Boolean(entry?.state?.imageDataUrl),
        pixelsPerInch: entry?.state?.pixelsPerInch,
        unitSystem: entry?.state?.unitSystem,
        elementCount: entry?.state?.elements?.length ?? 0,
      };
    });
  });
}

function sessionSnapshot(page) {
  return page.evaluate(() => {
    const session = JSON.parse(
      localStorage.getItem("dimensional.session.v2") || "null",
    );
    return {
      name: session?.activePlanName ?? null,
      itemCount: session?.plan?.items?.length ?? 0,
      hasImage: Boolean(session?.plan?.imageDataUrl),
      pixelsPerInch: session?.plan?.pixelsPerInch,
      unitSystem: session?.plan?.unitSystem,
      elementCount: session?.plan?.elements?.length ?? 0,
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

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1500);
    await shot(page, "01-empty");

    // Upload floor plan
    await page.locator("header input[type='file']").setInputFiles(FIXTURE);
    await pause(page, 1500);
    await shot(page, "02-uploaded");

    // Calibrate
    await calibrate(page);
    let bodyText = await page.locator("header").innerText();
    if (!/Scale set/i.test(bodyText)) {
      await calibrate(page);
      bodyText = await page.locator("header").innerText();
    }
    await shot(page, "03-calibrated");

    // Draw geometry so clean base can preserve drawing
    await drawWall(page);
    await shot(page, "04-wall-drawn");

    await placeFurniture(page, "Sofa");
    await placeFurniture(page, "Desk");
    await shot(page, "05-furniture-placed");

    // Save full layout
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 1000);
    await page.getByLabel("Plan name").fill("Living Room Full");
    await pause(page, 800);
    await shot(page, "06-save-full-modal");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await pause(page, 1200);

    // AC1: Save clean copy without furniture
    await page.getByRole("button", { name: "Save clean copy" }).click();
    await pause(page, 1000);
    const cleanModal = page.getByRole("dialog");
    const cleanModalText = await cleanModal.innerText();
    await page.getByLabel("Plan name").fill("Living Room Clean Base");
    await pause(page, 800);
    await shot(page, "07-save-clean-modal");
    await cleanModal.getByRole("button", { name: "Save clean copy" }).click();
    await pause(page, 1400);

    let library = await listLibrary(page);
    console.log("library after clean save:", JSON.stringify(library, null, 2));
    const cleanEntry = library.find((p) => p.name === "Living Room Clean Base");
    const fullEntry = library.find((p) => p.name === "Living Room Full");
    const ac1Pass =
      Boolean(cleanEntry) &&
      cleanEntry.kind === "clean" &&
      cleanEntry.itemCount === 0 &&
      cleanEntry.hasImage &&
      typeof cleanEntry.pixelsPerInch === "number" &&
      cleanEntry.elementCount >= 1 &&
      /Save clean copy|clean/i.test(cleanModalText);
    record(
      "AC1",
      "User can save or duplicate the current floor plan without furniture items",
      ac1Pass,
      `modal=${cleanModalText.replace(/\n/g, " | ").slice(0, 180)}; clean=${JSON.stringify(cleanEntry)}; fullItems=${fullEntry?.itemCount}`,
    );

    // AC4: Distinguishable in plan list
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 1200);
    const openListText = await page.getByRole("dialog").innerText();
    await shot(page, "08-open-list-kinds");
    const distinguishable =
      /Clean base/i.test(openListText) &&
      /Full layout/i.test(openListText) &&
      /Living Room Clean Base/i.test(openListText) &&
      /Living Room Full/i.test(openListText);
    record(
      "AC4",
      "Full saves (with furniture) and clean-base saves are distinguishable in the plan list",
      distinguishable,
      openListText.replace(/\n/g, " | ").slice(0, 300),
    );

    // AC2: Opening clean base restores plan+scale+drawing, empty furniture
    await openNamedPlan(page, "Living Room Clean Base");
    await pause(page, 1500);
    const headerClean = await page.locator("header").innerText();
    const sessionClean = await sessionSnapshot(page);
    await shot(page, "09-opened-clean-base");
    const ac2Pass =
      /Living Room Clean Base/i.test(headerClean) &&
      /Scale set/i.test(headerClean) &&
      sessionClean.itemCount === 0 &&
      sessionClean.hasImage &&
      typeof sessionClean.pixelsPerInch === "number" &&
      sessionClean.elementCount >= 1;
    record(
      "AC2",
      "Opening a clean-base save restores plan + scale (and drawing if present) with an empty furniture list",
      ac2Pass,
      `header=${headerClean.replace(/\n/g, " | ")}; session=${JSON.stringify(sessionClean)}`,
    );

    // AC3: Multiple layout experiments from same clean base without overwriting base
    await placeFurniture(page, "Sofa");
    await pause(page, 800);
    // Save on a clean base should route to Save as (protect base)
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await pause(page, 1000);
    const protectDialog = page.getByRole("dialog");
    const protectVisible = await protectDialog.isVisible().catch(() => false);
    const protectText = protectVisible ? await protectDialog.innerText() : "";
    const routedToSaveAs =
      protectVisible && /Save plan as/i.test(protectText);
    await shot(page, "10-save-protects-clean-base");
    await page.getByLabel("Plan name").fill("Layout Experiment A");
    await pause(page, 700);
    await protectDialog
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await pause(page, 1200);

    // Open clean base again and create second experiment
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 1000);
    // May get unsaved prompt if dirty — discard if so
    const maybeUnsaved = page.getByRole("dialog");
    const maybeText = await maybeUnsaved.innerText();
    if (/Unsaved changes/i.test(maybeText)) {
      await maybeUnsaved.getByRole("button", { name: "Discard" }).click();
      await pause(page, 1000);
    }
    await openNamedPlan(page, "Living Room Clean Base");
    await pause(page, 1200);
    await placeFurniture(page, "Desk");
    await placeFurniture(page, "Bed");
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 900);
    await page.getByLabel("Plan name").fill("Layout Experiment B");
    await pause(page, 700);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await pause(page, 1200);

    library = await listLibrary(page);
    console.log("library after experiments:", JSON.stringify(library, null, 2));
    const baseAfter = library.find((p) => p.name === "Living Room Clean Base");
    const expA = library.find((p) => p.name === "Layout Experiment A");
    const expB = library.find((p) => p.name === "Layout Experiment B");
    const ac3Pass =
      routedToSaveAs &&
      Boolean(baseAfter) &&
      baseAfter.kind === "clean" &&
      baseAfter.itemCount === 0 &&
      Boolean(expA) &&
      expA.itemCount >= 1 &&
      Boolean(expB) &&
      expB.itemCount >= 2 &&
      library.filter((p) => p.name === "Living Room Clean Base").length === 1;
    record(
      "AC3",
      "User can create multiple layout experiments from the same clean base without overwriting the base",
      ac3Pass,
      `routedToSaveAs=${routedToSaveAs}; base=${JSON.stringify(baseAfter)}; expA=${JSON.stringify(expA)}; expB=${JSON.stringify(expB)}`,
    );
    await shot(page, "11-two-experiments-saved");

    // Confirm base still opens clean
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 900);
    const openAgain = page.getByRole("dialog");
    const openAgainText = await openAgain.innerText();
    if (/Unsaved changes/i.test(openAgainText)) {
      await openAgain.getByRole("button", { name: "Discard" }).click();
      await pause(page, 900);
    }
    await openNamedPlan(page, "Living Room Clean Base");
    const baseStillClean = await sessionSnapshot(page);
    await shot(page, "12-base-still-clean");
    if (baseStillClean.itemCount !== 0) {
      record(
        "AC3",
        "User can create multiple layout experiments from the same clean base without overwriting the base",
        false,
        `Base polluted after experiments: ${JSON.stringify(baseStillClean)}`,
      );
    }

    // AC5: Clear furniture / Reset remain distinct
    await placeFurniture(page, "Sofa");
    await pause(page, 700);
    const beforeClear = await sessionSnapshot(page);
    await page.getByRole("button", { name: /Clear furniture/i }).click();
    await pause(page, 1000);
    const afterClear = await sessionSnapshot(page);
    await shot(page, "13-after-clear-furniture");
    const clearOk =
      beforeClear.itemCount >= 1 &&
      afterClear.itemCount === 0 &&
      afterClear.hasImage &&
      typeof afterClear.pixelsPerInch === "number";

    await placeFurniture(page, "Desk");
    await pause(page, 700);
    await page.getByRole("button", { name: /^Reset$/i }).click();
    await pause(page, 1200);
    const afterReset = await sessionSnapshot(page);
    const emptyVisible = await page
      .getByRole("heading", { name: /dimensional/i })
      .isVisible()
      .catch(() => false);
    await shot(page, "14-after-reset");
    const resetOk =
      !afterReset.hasImage &&
      afterReset.itemCount === 0 &&
      (emptyVisible || afterReset.pixelsPerInch == null);
    const buttonsStillLabeled =
      (await page.getByRole("button", { name: /Clear furniture/i }).count()) >=
        0 &&
      (await page.getByRole("button", { name: /^Reset$/i }).count()) >= 0;
    // After reset, plan is gone so buttons may be disabled but should exist when we re-upload
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    await pause(page, 1200);
    const clearBtn = page.getByRole("button", { name: /Clear furniture/i });
    const resetBtn = page.getByRole("button", { name: /^Reset$/i });
    const clearVisible = await clearBtn.isVisible();
    const resetVisible = await resetBtn.isVisible();
    await shot(page, "15-clear-reset-still-present");
    record(
      "AC5",
      'Existing "Clear furniture" / "Reset" behaviors remain available and clearly distinct',
      clearOk && resetOk && clearVisible && resetVisible,
      `clearOk=${clearOk} (${beforeClear.itemCount}->${afterClear.itemCount}, imageKept=${afterClear.hasImage}); resetOk=${resetOk} (empty=${emptyVisible}); buttons=${clearVisible}/${resetVisible}; buttonsStillLabeled=${buttonsStillLabeled}`,
    );

    const byId = new Map();
    for (const r of results.filter((x) => /^AC[1-5]$/.test(x.id))) {
      byId.set(r.id, r);
    }
    const gated = ["AC1", "AC2", "AC3", "AC4", "AC5"]
      .map((id) => byId.get(id))
      .filter(Boolean);
    const summary = {
      issue: "LUC-23",
      prTitleAlias: "DIM-4",
      pr: "https://github.com/lkamak/dimensional/pull/7",
      issueUrl:
        "https://linear.app/lucaskamakura/issue/LUC-23/duplicate-or-save-original-floor-plans-without-additions",
      commit: COMMIT,
      timestamp: new Date().toISOString(),
      changeType: "frontend",
      results,
      prdCriteria: gated,
      allPassed: gated.length === 5 && gated.every((r) => r.pass),
    };
    fs.writeFileSync(
      path.join(ARTIFACTS, "results.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log("\nPRD ALL PASSED:", summary.allPassed);
  } finally {
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();
    if (videoPath && fs.existsSync(videoPath)) {
      const dest = path.join(ARTIFACTS, "luc-23-e2e.webm");
      fs.renameSync(videoPath, dest);
      console.log("video:", dest);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
