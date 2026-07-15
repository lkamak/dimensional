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
const COMMIT = (
  process.env.GIT_COMMIT ||
  execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
).slice(0, 7);

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
    await pause(page, 700);
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

  await page.mouse.click(a.x, a.y, { delay: 60 });
  await pause(page, 1000);
  await page.mouse.click(b.x, b.y, { delay: 60 });
  await pause(page, 1300);

  const lengthInput = page.locator("#calib-length");
  await lengthInput.waitFor({ state: "visible", timeout: 8000 });
  await lengthInput.fill("10");
  await pause(page, 700);
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1200);
}

async function placeFurniture(page, label) {
  await page
    .locator("aside")
    .getByRole("button", { name: new RegExp(`^${label}\\b`) })
    .click();
  await pause(page, 1100);
}

async function openNamedPlan(page, name) {
  await page
    .getByRole("dialog")
    .locator("li")
    .filter({ hasText: name })
    .locator("button")
    .first()
    .click();
  await pause(page, 1600);
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

function sessionPlan(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("dimensional.session.v2");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      activePlanId: parsed.activePlanId,
      activePlanName: parsed.activePlanName,
      itemCount: parsed.plan?.items?.length ?? 0,
      hasImage: Boolean(parsed.plan?.imageDataUrl),
      pixelsPerInch: parsed.plan?.pixelsPerInch,
      elementCount: parsed.plan?.elements?.length ?? 0,
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
    await pause(page, 1600);
    await shot(page, "01-empty");

    // Upload + calibrate + furniture
    await page.locator("header input[type='file']").setInputFiles(FIXTURE);
    await pause(page, 1600);
    await shot(page, "02-uploaded");

    await calibrate(page);
    let headerText = await page.locator("header").innerText();
    if (!/Scale set/i.test(headerText)) {
      await calibrate(page);
      headerText = await page.locator("header").innerText();
    }
    await shot(page, "03-calibrated");

    await placeFurniture(page, "Sofa");
    await placeFurniture(page, "Desk");
    await shot(page, "04-furniture-placed");

    // Also draw a wall so clean base can include drawing geometry
    await page.getByRole("button", { name: "Wall", exact: true }).click();
    await pause(page, 800);
    const wallA = await worldToScreen(page, 120, 180);
    const wallB = await worldToScreen(page, 320, 180);
    if (wallA && wallB) {
      await page.mouse.click(wallA.x, wallA.y, { delay: 50 });
      await pause(page, 900);
      await page.mouse.click(wallB.x, wallB.y, { delay: 50 });
      await pause(page, 1200);
    }
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await pause(page, 800);
    await shot(page, "05-with-drawing");

    // Save full layout
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 1100);
    await page.getByLabel("Plan name").fill("Full Living Room");
    await pause(page, 900);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await pause(page, 1400);
    await shot(page, "06-full-saved");

    // AC1: Save clean copy (without furniture)
    await page.getByRole("button", { name: "Save clean copy" }).click();
    await pause(page, 1200);
    const cleanModal = page.getByRole("dialog");
    await cleanModal.getByText("Save clean copy").first().waitFor();
    await page.getByLabel("Plan name").fill("Living Room Clean Base");
    await pause(page, 1000);
    await shot(page, "07-save-clean-modal");
    await cleanModal.getByRole("button", { name: "Save clean copy" }).click();
    await pause(page, 1500);

    let library = await listLibrary(page);
    console.log("library after clean save:", JSON.stringify(library, null, 2));
    const cleanEntry = library.find((p) => p.name === "Living Room Clean Base");
    const fullEntry = library.find((p) => p.name === "Full Living Room");
    const ac1Pass =
      Boolean(cleanEntry) &&
      cleanEntry.kind === "clean" &&
      cleanEntry.itemCount === 0 &&
      cleanEntry.hasImage &&
      typeof cleanEntry.pixelsPerInch === "number" &&
      Boolean(fullEntry) &&
      fullEntry.itemCount >= 2;
    record(
      "AC1",
      "User can save or duplicate the current floor plan without furniture items",
      ac1Pass,
      `clean=${JSON.stringify(cleanEntry)}; fullItems=${fullEntry?.itemCount}`,
    );
    await shot(page, "08-after-clean-save");

    // AC4: distinguishable in plan list (Open modal labels)
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 1400);
    const openDialog = page.getByRole("dialog");
    const openText = await openDialog.innerText();
    const ac4Pass =
      /Full Living Room/.test(openText) &&
      /Living Room Clean Base/.test(openText) &&
      /Full layout/.test(openText) &&
      /Clean base/.test(openText);
    await shot(page, "09-open-list-labels");
    record(
      "AC4",
      "Full saves (with furniture) and clean-base saves are distinguishable in the plan list",
      ac4Pass,
      openText.replace(/\n+/g, " | ").slice(0, 400),
    );

    // AC2: Opening clean base restores plan+scale+drawing, empty furniture
    await openNamedPlan(page, "Living Room Clean Base");
    await pause(page, 1500);
    await shot(page, "10-opened-clean-base");
    const afterOpenClean = await sessionPlan(page);
    const headerClean = await page.locator("header").innerText();
    const ac2Pass =
      afterOpenClean?.itemCount === 0 &&
      afterOpenClean?.hasImage === true &&
      typeof afterOpenClean?.pixelsPerInch === "number" &&
      /Living Room Clean Base/.test(headerClean) &&
      (afterOpenClean?.elementCount ?? 0) >= 0;
    record(
      "AC2",
      "Opening a clean-base save restores plan + scale (and drawing if present) with an empty furniture list",
      ac2Pass,
      `session=${JSON.stringify(afterOpenClean)}; header=${headerClean.replace(/\n/g, " | ")}`,
    );

    // Confirm drawing retained when we had drawn a wall
    if ((cleanEntry?.elementCount ?? 0) > 0) {
      if ((afterOpenClean?.elementCount ?? 0) < 1) {
        record(
          "AC2",
          "Opening a clean-base save restores plan + scale (and drawing if present) with an empty furniture list",
          false,
          `Drawing lost: cleanEntry.elements=${cleanEntry.elementCount}, session.elements=${afterOpenClean?.elementCount}`,
        );
      }
    }

    // AC3: multiple layout experiments from same clean base without overwriting
    const cleanIdBefore = cleanEntry.id;
    await placeFurniture(page, "Sofa");
    await pause(page, 900);
    // Save on clean base should route to Save as (protect overwrite)
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await pause(page, 1200);
    const saveAsDialog = page.getByRole("dialog");
    const saveAsTitle = await saveAsDialog.locator("h2, h3, .modal-title").first().innerText().catch(() => "");
    const dialogText = await saveAsDialog.innerText();
    const routedToSaveAs =
      /Save plan as/i.test(dialogText) || /Save plan as/i.test(saveAsTitle);
    await shot(page, "11-save-on-clean-routes-to-save-as");
    await page.getByLabel("Plan name").fill("Layout Experiment 1");
    await pause(page, 900);
    await saveAsDialog.getByRole("button", { name: "Save" }).click();
    await pause(page, 1400);
    await shot(page, "12-layout-1-saved");

    // Open clean base again for second experiment
    async function openLibraryDiscardingIfNeeded() {
      await page.getByRole("button", { name: "Open" }).click();
      await pause(page, 1300);
      const dlg = page.getByRole("dialog");
      const text = await dlg.innerText();
      if (/Unsaved changes/i.test(text)) {
        await shot(page, "12b-unsaved-prompt");
        await dlg.getByRole("button", { name: "Discard" }).click();
        await pause(page, 1400);
      }
    }

    await openLibraryDiscardingIfNeeded();
    await openNamedPlan(page, "Living Room Clean Base");
    await pause(page, 1400);
    const reopened = await sessionPlan(page);
    await placeFurniture(page, "Desk");
    await placeFurniture(page, "Queen bed");
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 1100);
    await page.getByLabel("Plan name").fill("Layout Experiment 2");
    await pause(page, 900);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await pause(page, 1400);
    await shot(page, "13-layout-2-saved");

    library = await listLibrary(page);
    console.log("library after experiments:", JSON.stringify(library, null, 2));
    const baseStill = library.find((p) => p.id === cleanIdBefore);
    const layout1 = library.find((p) => p.name === "Layout Experiment 1");
    const layout2 = library.find((p) => p.name === "Layout Experiment 2");
    const ac3Pass =
      routedToSaveAs &&
      baseStill?.kind === "clean" &&
      baseStill?.itemCount === 0 &&
      Boolean(layout1) &&
      layout1.itemCount >= 1 &&
      Boolean(layout2) &&
      layout2.itemCount >= 2 &&
      reopened?.itemCount === 0;
    record(
      "AC3",
      "User can create multiple layout experiments from the same clean base without overwriting the base",
      ac3Pass,
      `routedToSaveAs=${routedToSaveAs}; base=${JSON.stringify(baseStill)}; L1=${layout1?.itemCount}; L2=${layout2?.itemCount}; reopenedItems=${reopened?.itemCount}`,
    );

    // AC5: Clear furniture / Reset still available and distinct
    await placeFurniture(page, "Sofa");
    await pause(page, 800);
    const clearBtn = page.getByRole("button", { name: "Clear furniture" });
    const resetBtn = page.getByRole("button", { name: "Reset" });
    const clearVisible = await clearBtn.isVisible();
    const resetVisible = await resetBtn.isVisible();
    const beforeClear = await sessionPlan(page);
    await clearBtn.click();
    await pause(page, 1200);
    const afterClear = await sessionPlan(page);
    await shot(page, "14-after-clear-furniture");
    const clearWorked =
      (beforeClear?.itemCount ?? 0) >= 1 &&
      afterClear?.itemCount === 0 &&
      afterClear?.hasImage === true;

    await resetBtn.click();
    await pause(page, 1400);
    await shot(page, "15-after-reset");
    const afterReset = await sessionPlan(page);
    const emptyVisible = await page.getByText(/Upload a floor plan|draw one from scratch/i).isVisible().catch(() => false);
    const resetWorked =
      emptyVisible ||
      (afterReset?.hasImage === false && (afterReset?.itemCount ?? 0) === 0);

    // Confirm clean base still intact after clear/reset on working copy
    library = await listLibrary(page);
    const baseAfter = library.find((p) => p.id === cleanIdBefore);
    const ac5Pass =
      clearVisible &&
      resetVisible &&
      clearWorked &&
      resetWorked &&
      baseAfter?.itemCount === 0 &&
      baseAfter?.kind === "clean";
    record(
      "AC5",
      'Existing "Clear furniture" / "Reset" behaviors remain available and clearly distinct',
      ac5Pass,
      `clearVisible=${clearVisible}; resetVisible=${resetVisible}; clearWorked=${clearWorked}; resetWorked=${resetWorked}; baseAfter=${JSON.stringify(baseAfter)}`,
    );

    // Final open list screenshot for evidence
    // Need a plan again — reopen full from library via... empty state has no Open enabled?
    // Open may be disabled without a plan - check TopBar
  } catch (err) {
    console.error("Verification error:", err);
    await shot(page, "zz-error").catch(() => {});
    record("ERROR", "Unhandled verification exception", false, String(err));
  } finally {
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();

    // Rename video
    if (videoPath && fs.existsSync(videoPath)) {
      const dest = path.join(ARTIFACTS, `luc-23-e2e-${COMMIT}.webm`);
      fs.renameSync(videoPath, dest);
      console.log("VIDEO", dest);
    }

    const allPass = results.length > 0 && results.every((r) => r.pass);
    const report = [
      `# LUC-23 E2E Verification Report`,
      ``,
      `- Commit under test: \`${COMMIT}\``,
      `- PRD: [LUC-23](https://linear.app/lucaskamakura/issue/LUC-23/duplicate-or-save-original-floor-plans-without-additions)`,
      `- Change type: **frontend-only** (localStorage plan library)`,
      `- Verdict: **${allPass ? "APPROVE" : "REJECT"}**`,
      ``,
      `## Acceptance criteria`,
      ``,
      `| ID | Criterion | Result | Detail |`,
      `|----|-----------|--------|--------|`,
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.criterion} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/").slice(0, 220)} |`,
      ),
      ``,
    ].join("\n");
    fs.writeFileSync(path.join(ARTIFACTS, "REPORT.md"), report);
    fs.writeFileSync(
      path.join(ARTIFACTS, "results.json"),
      JSON.stringify({ commit: COMMIT, allPass, results }, null, 2),
    );
    console.log(report);
    process.exit(allPass ? 0 : 1);
  }
}

main();
