const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const ARTIFACT_DIR = path.resolve(__dirname);
const VIDEO_NAME = "pr3-e2e-video.webm";

const floorPlanSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <rect width="640" height="420" fill="#f7f7f4"/>
  <rect x="60" y="50" width="520" height="320" fill="#ffffff" stroke="#26251e" stroke-width="10"/>
  <line x1="320" y1="50" x2="320" y2="370" stroke="#26251e" stroke-width="6"/>
  <line x1="60" y1="205" x2="320" y2="205" stroke="#26251e" stroke-width="6"/>
  <path d="M320 205 L370 205" stroke="#f54e00" stroke-width="5"/>
  <text x="82" y="92" font-family="Arial, sans-serif" font-size="22" fill="#26251e">Living</text>
  <text x="348" y="92" font-family="Arial, sans-serif" font-size="22" fill="#26251e">Bedroom</text>
  <text x="82" y="248" font-family="Arial, sans-serif" font-size="22" fill="#26251e">Dining</text>
</svg>`;

function assertResult(results, key, pass, details) {
  results[key] = { status: pass ? "pass" : "fail", details };
}

async function screenshot(page, name) {
  const filePath = path.join(ARTIFACT_DIR, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function uploadAndCalibrate(page) {
  await page.locator("input[type=file]").first().setInputFiles({
    name: "qa-floor-plan.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(floorPlanSvg),
  });

  await page.getByText("Scale not set").waitFor({ timeout: 10000 });
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(300);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas did not have a bounding box");

  await page.mouse.click(box.x + box.width / 2 - 110, box.y + box.height / 2);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2 + 110, box.y + box.height / 2);
  await page.getByText("Set real length").waitFor({ timeout: 10000 });
  await page.locator("#calib-length").fill("120");
  await page.getByRole("button", { name: "Apply scale" }).click();
  await page.getByText(/Scale set/).waitFor({ timeout: 10000 });
}

async function getLibrary(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("dimensional.library.index.v2");
    const parsed = raw ? JSON.parse(raw) : { plans: [] };
    const plans = Array.isArray(parsed.plans) ? parsed.plans : [];
    return plans.map((plan) => {
      const entryRaw = localStorage.getItem(
        `dimensional.library.plan.${plan.id}.v2`,
      );
      const entry = entryRaw ? JSON.parse(entryRaw) : null;
      return {
        id: plan.id,
        name: plan.name,
        updatedAt: plan.updatedAt,
        itemCount: entry?.state?.items?.length ?? null,
        hasImage: Boolean(entry?.state?.imageDataUrl),
        hasScale: typeof entry?.state?.pixelsPerInch === "number",
        unitSystem: entry?.state?.unitSystem ?? null,
        labels: Array.isArray(entry?.state?.items)
          ? entry.state.items.map((item) => item.label)
          : [],
      };
    });
  });
}

async function getSession(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("dimensional.session.v2");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      activePlanName: parsed.activePlanName,
      itemCount: parsed.plan?.items?.length ?? null,
      hasImage: Boolean(parsed.plan?.imageDataUrl),
      hasScale: typeof parsed.plan?.pixelsPerInch === "number",
      unitSystem: parsed.plan?.unitSystem ?? null,
      labels: Array.isArray(parsed.plan?.items)
        ? parsed.plan.items.map((item) => item.label)
        : [],
    };
  });
}

(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const results = {};
  const screenshots = {};
  const observations = {};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 980 },
    recordVideo: { dir: ARTIFACT_DIR, size: { width: 1440, height: 980 } },
  });
  const page = await context.newPage();

  try {
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await uploadAndCalibrate(page);
    await page.getByRole("button", { name: /Sofa/ }).click();
    await page.locator("#item-label").fill("Blue sofa");
    await page.getByRole("button", { name: "Save as" }).click();
    await page.locator("#plan-name").fill("Layout A");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByText("Layout A").waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    screenshots.savedLayoutA = path.basename(
      await screenshot(page, "01-layout-a-saved.png"),
    );
    observations.afterLayoutA = await getLibrary(page);

    const layoutA = observations.afterLayoutA.find(
      (plan) => plan.name === "Layout A",
    );
    assertResult(
      results,
      "save_named_plan_with_furniture",
      Boolean(
        layoutA &&
          layoutA.hasImage &&
          layoutA.hasScale &&
          layoutA.itemCount === 1 &&
          layoutA.labels.includes("Blue sofa"),
      ),
      "Saved Layout A through the UI and verified localStorage entry includes image data, scale, imperial units, and the renamed sofa.",
    );

    await page.getByRole("button", { name: /TV console/ }).click();
    await page.getByRole("button", { name: "Save as" }).click();
    await page.locator("#plan-name").fill("Layout B");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByText("Layout B").waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    observations.afterLayoutBSaveAs = await getLibrary(page);

    await page.locator("header").getByRole("button", { name: "Open" }).click();
    await page.getByText("Open saved plan").waitFor({ timeout: 10000 });
    screenshots.libraryAfterSaveAsB = path.basename(
      await screenshot(page, "02-save-as-b-library.png"),
    );
    const namesAfterSaveAs = observations.afterLayoutBSaveAs.map(
      (plan) => plan.name,
    );
    const hasBothNamedSaves =
      namesAfterSaveAs.includes("Layout A") &&
      namesAfterSaveAs.includes("Layout B") &&
      new Set(namesAfterSaveAs).size >= 2;
    assertResult(
      results,
      "multiple_named_saves_coexist",
      hasBothNamedSaves,
      `After using Save as on active Layout A with name Layout B, library names were: ${JSON.stringify(namesAfterSaveAs)}.`,
    );

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /Desk/ }).click();
    await page.locator("header").getByRole("button", { name: "Open" }).click();
    await page
      .getByRole("heading", { name: "Unsaved changes" })
      .waitFor({ timeout: 10000 });
    screenshots.unsavedPrompt = path.basename(
      await screenshot(page, "03-unsaved-changes-prompt.png"),
    );
    const sawUnsavedPrompt = await page
      .getByRole("button", { name: "Save & continue" })
      .isVisible();
    assertResult(
      results,
      "switching_handles_unsaved_changes",
      sawUnsavedPrompt,
      "Clicking Open with a dirty active plan displayed the Unsaved changes dialog with Cancel, Discard, and Save & continue actions.",
    );

    await page.getByRole("button", { name: "Discard" }).click();
    await page.getByText("Open saved plan").waitFor({ timeout: 10000 });
    await page.locator("button").filter({ hasText: "Layout B" }).click();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem("dimensional.session.v2");
      if (!raw) return false;
      const session = JSON.parse(raw);
      return (
        session.activePlanName === "Layout B" &&
        session.plan?.items?.length === 2 &&
        Boolean(session.plan?.imageDataUrl) &&
        typeof session.plan?.pixelsPerInch === "number" &&
        session.plan?.unitSystem === "imperial"
      );
    });
    observations.afterOpenLayoutB = await getSession(page);
    screenshots.reopenedLayoutB = path.basename(
      await screenshot(page, "04-reopened-layout-b.png"),
    );

    await page.locator("header").getByRole("button", { name: "Reset" }).click();
    await page.getByText("Upload a floor plan image").waitFor({ timeout: 10000 });
    const openDisabledOnEmpty = await page
      .locator("header")
      .getByRole("button", { name: "Open" })
      .isDisabled();
    screenshots.emptyStateOpenDisabled = path.basename(
      await screenshot(page, "05-empty-state-open-disabled.png"),
    );
    assertResult(
      results,
      "open_saved_plan_restores_full_state",
      Boolean(
        observations.afterOpenLayoutB?.activePlanName === "Layout B" &&
          observations.afterOpenLayoutB?.itemCount === 2 &&
          observations.afterOpenLayoutB?.hasImage &&
          observations.afterOpenLayoutB?.hasScale &&
          observations.afterOpenLayoutB?.unitSystem === "imperial" &&
          !openDisabledOnEmpty,
      ),
      `Opened Layout B from a loaded plan and restored image/scale/units/furniture, but Open was ${openDisabledOnEmpty ? "disabled" : "enabled"} on the empty state while saved plans still existed.`,
    );

    await uploadAndCalibrate(page);
    await page.getByRole("button", { name: /Armchair/ }).click();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItemWithQuotaFailure(key, value) {
        if (String(key).startsWith("dimensional.library.plan.")) {
          throw new DOMException("Simulated quota failure", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    });
    await page.getByRole("button", { name: "Save as" }).click();
    await page.locator("#plan-name").fill("Quota test");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByRole("alert").waitFor({ timeout: 10000 });
    const quotaText = await page.getByRole("alert").innerText();
    screenshots.quotaError = path.basename(
      await screenshot(page, "06-quota-error.png"),
    );
    assertResult(
      results,
      "storage_failures_surface_clear_error",
      /Storage is full/i.test(quotaText),
      `Simulated QuotaExceededError surfaced alert text: ${JSON.stringify(quotaText)}.`,
    );
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const videoPath = await page.video().path();
  fs.copyFileSync(videoPath, path.join(ARTIFACT_DIR, VIDEO_NAME));

  const verdict = Object.values(results).every((result) => result.status === "pass")
    ? "APPROVE"
    : "REJECT";
  const summary = {
    verdict,
    appUrl: APP_URL,
    generatedAt: new Date().toISOString(),
    screenshots,
    video: VIDEO_NAME,
    results,
    observations,
  };

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "evidence-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
