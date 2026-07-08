import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const ARTIFACTS = path.join(ROOT, "qa/e2e-luc-24/artifacts");
const FIXTURE = path.join(ROOT, "qa/e2e-luc-24/fixtures/floorplan.png");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";

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

async function ensureCalibrateMode(page) {
  const hint = page.getByText(/Click two points on a wall/i);
  if (await hint.isVisible().catch(() => false)) return;
  // Upload already enters calibrate mode; only click if not active.
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
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not found");

  let x1 = box.x + box.width * 0.3;
  let y1 = box.y + box.height * 0.7;
  let x2 = x1 + 150;
  let y2 = y1;

  const mapped = await page.evaluate(() => {
    const canvasEl = document.querySelector("canvas");
    const stage = globalThis.Konva?.stages?.[0];
    if (!canvasEl || !stage) return null;
    const scale = stage.scaleX();
    const pos = stage.position();
    const rect = canvasEl.getBoundingClientRect();
    const toScreen = (wx, wy) => ({
      x: rect.left + pos.x + wx * scale,
      y: rect.top + pos.y + wy * scale,
    });
    return { a: toScreen(100, 520), b: toScreen(360, 520) };
  });
  if (mapped?.a && mapped?.b) {
    x1 = mapped.a.x;
    y1 = mapped.a.y;
    x2 = mapped.b.x;
    y2 = mapped.b.y;
  }

  await page.mouse.click(x1, y1, { delay: 50 });
  await pause(page, 900);
  await page.mouse.click(x2, y2, { delay: 50 });
  await pause(page, 1200);

  const lengthInput = page.locator("#calib-length");
  await lengthInput.waitFor({ state: "visible", timeout: 8000 });
  await lengthInput.fill("10");
  await pause(page, 600);
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1000);
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
    await page
      .locator("header input[type='file']")
      .setInputFiles(FIXTURE);
    await pause(page, 1500);
    await shot(page, "02-uploaded");

    // Calibrate
    await calibrate(page);
    const scaleText = await page.locator(".TopBar_scalePill__*, [class*='scalePill']").first().textContent().catch(() => null);
    // fallback: look for "Scale set"
    const bodyText = await page.locator("header").innerText();
    const calibrated = /Scale set/i.test(bodyText);
    if (!calibrated) {
      // retry calibration once with different points
      await calibrate(page);
    }
    await shot(page, "03-calibrated");

    // Place furniture (catalog buttons include dimension text in accessible name)
    async function placeFurniture(label) {
      await page.locator("aside").getByRole("button", { name: new RegExp(`^${label}\\b`) }).click();
      await pause(page, 1000);
    }
    await placeFurniture("Sofa");
    await placeFurniture("Desk");
    await shot(page, "04-furniture-placed");

    // AC1: Save as under a name
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 1000);
    await page.getByLabel("Plan name").fill("Living Room A");
    await pause(page, 800);
    await shot(page, "05-save-as-modal");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await pause(page, 1200);
    const headerAfterSave = await page.locator("header").innerText();
    const savedNamed = /Living Room A/.test(headerAfterSave) && !/\*/.test(headerAfterSave.split("Living Room A")[1]?.slice(0, 3) || "");
    // dirty star should be gone after save
    const dirtyGone = !/Living Room A \*/.test(headerAfterSave);
    record(
      "AC1",
      "User can save the current plan including furniture additions under a name",
      /Living Room A/.test(headerAfterSave) && dirtyGone,
      `Header shows: ${headerAfterSave.replace(/\n/g, " | ")}`,
    );
    await shot(page, "06-saved-named");

    // Inspect library storage for furniture persistence
    const libraryState = await page.evaluate(() => {
      const index = JSON.parse(localStorage.getItem("dimensional.library.index.v2") || '{"plans":[]}');
      const plans = [];
      for (const meta of index.plans || []) {
        const entry = JSON.parse(localStorage.getItem(`dimensional.library.plan.${meta.id}.v2`) || "null");
        plans.push({
          id: meta.id,
          name: meta.name,
          itemCount: entry?.state?.items?.length ?? 0,
          hasImage: Boolean(entry?.state?.imageDataUrl),
          pixelsPerInch: entry?.state?.pixelsPerInch,
          unitSystem: entry?.state?.unitSystem,
        });
      }
      return plans;
    });
    console.log("library after first save:", JSON.stringify(libraryState, null, 2));

    // Make a change → dirty indicator
    await page.getByRole("button", { name: /Clear furniture/i }).click();
    await pause(page, 800);
    await placeFurniture("Sofa");
    const dirtyHeader = await page.locator("header").innerText();
    const isDirty = /Living Room A \*/.test(dirtyHeader);
    await shot(page, "07-dirty-indicator");

    // Save updates named plan
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await pause(page, 1000);
    const afterResave = await page.locator("header").innerText();
    const resavedClean = /Living Room A/.test(afterResave) && !/Living Room A \*/.test(afterResave);
    record(
      "AC1b",
      "Save updates the active named plan (dirty cleared)",
      isDirty && resavedClean,
      `dirty=${isDirty}; afterSave=${afterResave.replace(/\n/g, " | ")}`,
    );

    // AC3: Second named save via Save as while already named
    // (PRD requires multiple named saves coexist without overwriting)
    const beforeSecondSave = await page.evaluate(() => {
      const index = JSON.parse(
        localStorage.getItem("dimensional.library.index.v2") || '{"plans":[]}',
      );
      return (index.plans || []).map((p) => ({ id: p.id, name: p.name }));
    });
    await placeFurniture("Sofa");
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 800);
    await page.getByLabel("Plan name").fill("Office Layout B");
    await pause(page, 700);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await pause(page, 1200);
    await shot(page, "08-second-save");

    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 1200);
    const openList = await page.getByRole("dialog").innerText();
    const afterSecondSave = await page.evaluate(() => {
      const index = JSON.parse(
        localStorage.getItem("dimensional.library.index.v2") || '{"plans":[]}',
      );
      return (index.plans || []).map((p) => ({ id: p.id, name: p.name }));
    });
    const bothPresent =
      /Living Room A/.test(openList) && /Office Layout B/.test(openList);
    const sameIdOverwrite =
      beforeSecondSave.length === 1 &&
      afterSecondSave.length === 1 &&
      beforeSecondSave[0].id === afterSecondSave[0].id &&
      afterSecondSave[0].name === "Office Layout B";
    record(
      "AC3",
      "Multiple named saves can coexist without overwriting each other",
      bothPresent && !sameIdOverwrite,
      sameIdOverwrite
        ? `FAIL: Save as reused activePlanId and renamed/overwrote the only library entry. before=${JSON.stringify(beforeSecondSave)} after=${JSON.stringify(afterSecondSave)}. Open list: ${openList.replace(/\n/g, " | ")}`
        : openList.replace(/\n/g, " | "),
    );
    await shot(page, "09-open-list-after-save-as");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await pause(page, 600);

    // Workaround path: Reset clears activePlanId so a new Save as can create a 2nd entry.
    // Used to continue verifying AC2/AC4/AC5 even when Save-as-from-named overwrites.
    await page.getByRole("button", { name: "Reset" }).click();
    await pause(page, 1000);
    await page.locator("header input[type='file']").setInputFiles(FIXTURE);
    await pause(page, 1200);
    await calibrate(page);
    await placeFurniture("Sofa");
    await placeFurniture("Desk");
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 700);
    await page.getByLabel("Plan name").fill("Living Room A");
    await pause(page, 500);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await pause(page, 1000);
    const coexistenceViaReset = await page.evaluate(() => {
      const index = JSON.parse(
        localStorage.getItem("dimensional.library.index.v2") || '{"plans":[]}',
      );
      return (index.plans || []).map((p) => p.name);
    });
    record(
      "AC3b",
      "Multiple named saves via Reset + Save as (secondary path)",
      coexistenceViaReset.includes("Living Room A") &&
        coexistenceViaReset.includes("Office Layout B"),
      `names=${JSON.stringify(coexistenceViaReset)}`,
    );
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 1000);
    await shot(page, "09b-open-list-after-reset-path");

    // AC2: Open previously saved plan restores state
    async function openNamedPlan(name) {
      await page
        .getByRole("dialog")
        .locator("li")
        .filter({ hasText: name })
        .locator("button")
        .first()
        .click();
      await pause(page, 1500);
    }
    await openNamedPlan("Office Layout B");
    const restoredHeader = await page.locator("header").innerText();
    const restoredLib = await page.evaluate(() => {
      const index = JSON.parse(
        localStorage.getItem("dimensional.library.index.v2") || '{"plans":[]}',
      );
      const a = (index.plans || []).find((p) => p.name === "Office Layout B");
      if (!a) return null;
      const entry = JSON.parse(
        localStorage.getItem(`dimensional.library.plan.${a.id}.v2`) || "null",
      );
      const session = JSON.parse(
        localStorage.getItem("dimensional.session.v2") || "null",
      );
      return {
        name: entry?.name,
        itemCount: entry?.state?.items?.length ?? 0,
        hasImage: Boolean(entry?.state?.imageDataUrl),
        pixelsPerInch: entry?.state?.pixelsPerInch,
        unitSystem: entry?.state?.unitSystem,
        sessionItems: session?.plan?.items?.length ?? 0,
        sessionPpi: session?.plan?.pixelsPerInch,
        sessionName: session?.activePlanName,
      };
    });
    const uiRestored =
      /Office Layout B/.test(restoredHeader) && /Scale set/i.test(restoredHeader);
    const furnitureRestored =
      restoredLib &&
      restoredLib.hasImage &&
      typeof restoredLib.pixelsPerInch === "number" &&
      restoredLib.itemCount >= 1 &&
      restoredLib.sessionItems >= 1;
    record(
      "AC2",
      "User can open a previously saved plan and restore image/drawing, scale, units, and furniture",
      Boolean(uiRestored && furnitureRestored),
      `header=${restoredHeader.replace(/\n/g, " | ")}; stored=${JSON.stringify(restoredLib)}`,
    );
    await shot(page, "10-restored-office");

    // AC4: Unsaved changes prompt
    await page.getByRole("button", { name: /Clear furniture/i }).click();
    await pause(page, 800);
    const dirtyBeforeOpen = /Office Layout B \*/.test(
      await page.locator("header").innerText(),
    );
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 1200);
    const unsavedDialog = page.getByRole("dialog");
    const unsavedText = await unsavedDialog.innerText();
    const hasUnsavedPrompt =
      /Unsaved changes/i.test(unsavedText) &&
      /Save & continue|Discard|Cancel/i.test(unsavedText);
    await shot(page, "11-unsaved-prompt");
    await unsavedDialog.getByRole("button", { name: "Cancel" }).click();
    await pause(page, 800);
    const stillOffice = /Office Layout B/.test(
      await page.locator("header").innerText(),
    );
    await page.getByRole("button", { name: "Open" }).click();
    await pause(page, 900);
    await page.getByRole("dialog").getByRole("button", { name: "Discard" }).click();
    await pause(page, 1000);
    const openAfterDiscard = page.getByRole("dialog");
    await openAfterDiscard.waitFor({ state: "visible" });
    await openAfterDiscard
      .locator("li")
      .filter({ hasText: "Living Room A" })
      .locator("button")
      .first()
      .click();
    await pause(page, 1200);
    const switched = /Living Room A/.test(await page.locator("header").innerText());
    record(
      "AC4",
      "Switching plans prompts or safely handles unsaved changes",
      dirtyBeforeOpen && hasUnsavedPrompt && stillOffice && switched,
      `dirty=${dirtyBeforeOpen}; prompt=${unsavedText.replace(/\n/g, " | ").slice(0, 200)}; cancelKept=${stillOffice}; switched=${switched}`,
    );
    await shot(page, "12-switched-after-discard");

    // AC5: Storage quota failures surface clear error
    await page.evaluate(() => {
      const original = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        if (
          String(key).includes("dimensional.library") ||
          String(key).includes("dimensional.session")
        ) {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }
        return original(key, value);
      };
    });
    await placeFurniture("Sofa");
    await page.getByRole("button", { name: "Save as" }).click();
    await pause(page, 700);
    await page.getByLabel("Plan name").fill("Quota Fail Plan");
    await pause(page, 500);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await pause(page, 1200);
    const alert = page.getByRole("alert");
    const alertVisible = await alert.isVisible().catch(() => false);
    const alertText = alertVisible ? await alert.innerText() : "";
    const quotaOk =
      alertVisible && /Storage is full|Could not save|storage/i.test(alertText);
    record(
      "AC5",
      "Storage failures (quota) surface a clear error instead of silent data loss",
      quotaOk,
      alertVisible
        ? alertText.replace(/\n/g, " | ")
        : "No alert banner visible",
    );
    await shot(page, "13-quota-error");

    // Write results JSON
    const summary = {
      issue: "LUC-24",
      pr: "https://github.com/lkamak/dimensional/pull/3",
      commit: "73b159b500972cb10869084d719881470ac55aa1",
      timestamp: new Date().toISOString(),
      results,
      // PRD gate: only the five Linear acceptance criteria (AC1–AC5) count
      prdCriteria: results.filter((r) => /^AC[1-5]$/.test(r.id)),
      allPassed: results
        .filter((r) => /^AC[1-5]$/.test(r.id))
        .every((r) => r.pass),
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
      const dest = path.join(ARTIFACTS, "luc-24-e2e.webm");
      fs.renameSync(videoPath, dest);
      console.log("video:", dest);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
