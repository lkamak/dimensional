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
  process.env.GIT_COMMIT || "5001153a5170ddbd03aa0afaf4152a8bb3c1885c";
const SESSION_KEY = "dimensional.session.v2";

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
    };
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

async function clickWorld(page, worldX, worldY) {
  const p = await worldToScreen(page, worldX, worldY);
  if (!p) throw new Error("worldToScreen failed");
  await page.mouse.click(p.x, p.y);
  return p;
}

async function readPlan(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SESSION_KEY);
}

async function resetSession(page, unitSystem = "imperial") {
  await page.evaluate(
    ({ key, unitSystem }) => {
      localStorage.clear();
      // Leave empty — app creates defaults; unit toggle after load if needed
      void key;
      void unitSystem;
    },
    { key: SESSION_KEY, unitSystem },
  );
  await page.reload({ waitUntil: "networkidle" });
  await pause(page, 1200);
}

async function ensureImperial(page) {
  const imperial = page.getByRole("button", { name: /ft\s*\/\s*in/i });
  await imperial.click();
  await pause(page, 500);
}

async function ensureMetric(page) {
  const metric = page.getByRole("button", { name: /^metric$/i });
  await metric.click();
  await pause(page, 500);
}

async function uploadFixture(page) {
  await page.locator('header input[type="file"]').setInputFiles(FIXTURE);
  await pause(page, 1600);
  await page.waitForSelector(".canvas-area canvas", { timeout: 15000 });
  await bindStage(page);
}

/** Draw a calibration line of exact world-pixel length along Y=180. */
async function openCalibrationModal(page, lengthPx = 120, y = 180) {
  const hint = page.locator("text=Click two points");
  if (!(await hint.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 600);
  }
  const x0 = 80;
  const x1 = x0 + lengthPx;
  await clickWorld(page, x0, y);
  await pause(page, 900);
  await clickWorld(page, x1, y);
  await pause(page, 900);
  await page.waitForSelector("text=Set real length", { timeout: 10000 });
  await pause(page, 800);
}

async function modalLabelText(page) {
  return page.locator('label[for="calib-length"]').innerText();
}

async function modalPlaceholder(page) {
  return page.locator("#calib-length").getAttribute("placeholder");
}

async function applyScale(page, value) {
  await page.locator("#calib-length").fill(String(value));
  await pause(page, 700);
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 1200);
}

async function tryApplyScale(page, value) {
  await page.locator("#calib-length").fill(String(value));
  await pause(page, 600);
  await page.getByRole("button", { name: "Apply scale" }).click();
  await pause(page, 900);
}

function nearly(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await resetSession(page);
    await shot(page, "01-empty");

    // --- Imperial calibration UI + scale ---
    await uploadFixture(page);
    await ensureImperial(page);
    await shot(page, "02-uploaded-imperial");

    await openCalibrationModal(page, 120);
    const label = await modalLabelText(page);
    const placeholder = await modalPlaceholder(page);
    await shot(page, "03-imperial-modal");

    record(
      "AC1",
      "With imperial units selected, the calibration modal labels the field Length (ft).",
      /Length\s*\(ft\)/i.test(label.trim()),
      `label="${label.trim()}"`,
    );
    record(
      "AC2",
      "The imperial placeholder/example communicates that entering 10 represents a 10-foot wall.",
      /10/.test(placeholder || "") &&
        /10\s*ft|10-foot|10 ft/i.test(placeholder || ""),
      `placeholder="${placeholder}"`,
    );

    await page.locator("#calib-length").fill("10");
    await pause(page, 900);
    await shot(page, "04-imperial-filled-10");
    await page.getByRole("button", { name: "Apply scale" }).click();
    await pause(page, 1400);

    let session = await readPlan(page);
    const ppi = session?.plan?.pixelsPerInch;
    const scaleText = await page
      .locator("text=/Scale set/")
      .innerText()
      .catch(() => "");
    await shot(page, "05-imperial-scale-1px-in");
    record(
      "AC3",
      "Entering 10 for a 120-pixel calibration line sets the scale to 1 pixel per inch (equivalent to 12 pixels per foot).",
      typeof ppi === "number" && nearly(ppi, 1, 0.02),
      `pixelsPerInch=${ppi}, scaleUI="${scaleText}"`,
    );

    // --- Decimal feet (10.5) ---
    // Re-calibrate with 126px line + 10.5 ft => 10.5*12=126 in => 1.0 px/in
    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 700);
    await openCalibrationModal(page, 126, 200);
    await page.locator("#calib-length").fill("10.5");
    await pause(page, 800);
    await shot(page, "06-decimal-feet-modal");
    await page.getByRole("button", { name: "Apply scale" }).click();
    await pause(page, 1400);
    session = await readPlan(page);
    const ppiDecimal = session?.plan?.pixelsPerInch;
    await shot(page, "07-decimal-feet-applied");
    record(
      "AC4",
      "Positive decimal feet values such as 10.5 are accepted and converted correctly.",
      typeof ppiDecimal === "number" && nearly(ppiDecimal, 1, 0.02),
      `10.5 ft on 126px line => pixelsPerInch=${ppiDecimal} (expect ~1.0)`,
    );

    // --- Invalid / zero / negative rejection ---
    await page.getByRole("button", { name: "Calibrate" }).click();
    await pause(page, 600);
    await openCalibrationModal(page, 120, 220);
    const beforeReject = (await readPlan(page))?.plan?.pixelsPerInch;

    await tryApplyScale(page, "0");
    const afterZero = await readPlan(page);
    const modalAfterZero = await page
      .locator("text=Set real length")
      .isVisible()
      .catch(() => false);
    await shot(page, "08-reject-zero");

    await tryApplyScale(page, "-5");
    const afterNeg = await readPlan(page);
    const modalAfterNeg = await page
      .locator("text=Set real length")
      .isVisible()
      .catch(() => false);
    await shot(page, "09-reject-negative");

    // type=number rejects non-numeric typing; empty / NaN / whitespace cover "invalid"
    await page.locator("#calib-length").fill("");
    await pause(page, 400);
    await page.getByRole("button", { name: "Apply scale" }).click();
    await pause(page, 800);
    const afterEmpty = await readPlan(page);
    const modalAfterEmpty = await page
      .locator("text=Set real length")
      .isVisible()
      .catch(() => false);

    // Force a non-finite value through the controlled input via native setter + React
    await page.evaluate(() => {
      const input = document.querySelector("#calib-length");
      if (!input) return;
      const proto = Object.getPrototypeOf(input);
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      desc.set.call(input, "not-a-number");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await pause(page, 400);
    await page.getByRole("button", { name: "Apply scale" }).click();
    await pause(page, 800);
    const afterInvalid = await readPlan(page);
    const modalAfterInvalid = await page
      .locator("text=Set real length")
      .isVisible()
      .catch(() => false);
    await shot(page, "10-reject-invalid");

    const rejected =
      modalAfterZero &&
      modalAfterNeg &&
      modalAfterEmpty &&
      modalAfterInvalid &&
      afterZero?.plan?.pixelsPerInch === beforeReject &&
      afterNeg?.plan?.pixelsPerInch === beforeReject &&
      afterEmpty?.plan?.pixelsPerInch === beforeReject &&
      afterInvalid?.plan?.pixelsPerInch === beforeReject;
    record(
      "AC5",
      "Invalid, zero, and negative values remain rejected.",
      rejected,
      `modalStay={zero:${modalAfterZero},neg:${modalAfterNeg},empty:${modalAfterEmpty},invalid:${modalAfterInvalid}}, ppiUnchanged=${beforeReject}`,
    );

    // Cancel modal and move on
    await page.getByRole("button", { name: "Cancel" }).click();
    await pause(page, 800);

    // --- Metric calibration unchanged ---
    await resetSession(page);
    await uploadFixture(page);
    await ensureMetric(page);
    await pause(page, 700);
    await shot(page, "11-metric-ready");
    await openCalibrationModal(page, 120, 180);
    const metricLabel = await modalLabelText(page);
    const metricPlaceholder = await modalPlaceholder(page);
    await shot(page, "12-metric-modal");

    // 304.8 cm = 120 in; 120px / 120in = 1.0 px/in
    await applyScale(page, "304.8");
    session = await readPlan(page);
    const metricPpi = session?.plan?.pixelsPerInch;
    const metricUnit = session?.plan?.unitSystem;
    await shot(page, "13-metric-applied");
    record(
      "AC6",
      "Metric calibration remains unchanged and continues to accept centimeters.",
      /Length\s*\(cm\)/i.test(metricLabel.trim()) &&
        /cm|300/i.test(metricPlaceholder || "") &&
        metricUnit === "metric" &&
        typeof metricPpi === "number" &&
        nearly(metricPpi, 1, 0.05),
      `label="${metricLabel.trim()}", placeholder="${metricPlaceholder}", unit=${metricUnit}, ppi=${metricPpi}`,
    );

    // --- Furniture inspector remains inch-based under imperial ---
    await resetSession(page);
    await uploadFixture(page);
    await ensureImperial(page);
    await openCalibrationModal(page, 120, 180);
    await applyScale(page, "10");
    await pause(page, 800);

    // Seed a known saved-plan scale and place furniture
    const seededPpi = 2.5;
    await page.evaluate(
      ({ key, seededPpi }) => {
        const raw = JSON.parse(localStorage.getItem(key));
        raw.plan.pixelsPerInch = seededPpi;
        raw.plan.unitSystem = "imperial";
        localStorage.setItem(key, JSON.stringify(raw));
      },
      { key: SESSION_KEY, seededPpi },
    );
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1400);
    await bindStage(page);

    session = await readPlan(page);
    const preservedScale = session?.plan?.pixelsPerInch;

    await page.getByRole("button", { name: "Sofa" }).click();
    await pause(page, 1400);
    await shot(page, "14-furniture-inspector");

    const widthLabel = await page
      .locator('label[for="item-width"]')
      .innerText()
      .catch(() => "");
    const depthLabel = await page
      .locator('label[for="item-depth"]')
      .innerText()
      .catch(() => "");
    const widthVal = Number(
      await page.locator("#item-width").inputValue().catch(() => "NaN"),
    );
    session = await readPlan(page);
    const sofa = session?.plan?.items?.find((i) => i.kind === "couch");
    const widthMatchesInches =
      sofa &&
      Number.isFinite(widthVal) &&
      nearly(widthVal, sofa.widthIn, 0.05);

    // unitLabel helpers must still say inches for imperial (not feet)
    const helperLabels = await page.evaluate(async () => {
      // Probe via UI only — Width (in) proves unitLabel unchanged
      return true;
    });

    await shot(page, "15-inspector-inch-labels");
    record(
      "AC7",
      "Furniture inspector values and existing saved-plan scale data remain inch-based and are not reinterpreted.",
      preservedScale === seededPpi &&
        /Width\s*\(in\)/i.test(widthLabel) &&
        /Depth\s*\(in\)/i.test(depthLabel) &&
        widthMatchesInches &&
        helperLabels,
      `preservedPpi=${preservedScale} (seeded ${seededPpi}), widthLabel="${widthLabel}", depthLabel="${depthLabel}", widthInput=${widthVal}, sofa.widthIn=${sofa?.widthIn}`,
    );

    await pause(page, 1600);
    await shot(page, "16-final");
  } catch (err) {
    console.error("Harness error:", err);
    await shot(page, "99-error").catch(() => {});
    record("HARNESS", "Playwright harness completed without crash", false, String(err));
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const raw = await video.path();
      const webmOut = path.join(ARTIFACTS, "dim-14-e2e-demo.webm");
      fs.renameSync(raw, webmOut);
      try {
        execSync(
          `ffmpeg -y -i "${webmOut}" -vf "fps=8,scale=960:-1:flags=lanczos" -loop 0 "${path.join(ARTIFACTS, "dim-14-e2e-demo.gif")}"`,
          { stdio: "inherit" },
        );
        // Smaller preview GIF for PR embedding
        execSync(
          `ffmpeg -y -i "${webmOut}" -vf "fps=5,scale=720:-1:flags=lanczos" -frames:v 80 -loop 0 "${path.join(ARTIFACTS, "dim-14-e2e-preview.gif")}"`,
          { stdio: "inherit" },
        );
      } catch (e) {
        console.warn("ffmpeg gif conversion failed:", e.message);
      }
    }

    try {
      fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    const report = {
      prd: "DIM-14",
      pr: 16,
      commit: PR_COMMIT,
      passed,
      failed,
      verdict: failed === 0 && passed > 0 ? "APPROVE" : "REJECT",
      results,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(ARTIFACTS, "results.json"),
      JSON.stringify(report, null, 2),
    );

    const md = [
      `# DIM-14 E2E verification`,
      ``,
      `- PR: #16`,
      `- Commit: \`${PR_COMMIT}\``,
      `- Verdict: **${report.verdict}** (${passed} pass / ${failed} fail)`,
      ``,
      `| ID | Result | Criterion | Detail |`,
      `|----|--------|-----------|--------|`,
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.pass ? "PASS" : "FAIL"} | ${r.criterion} | ${r.detail.replace(/\|/g, "/")} |`,
      ),
      ``,
    ].join("\n");
    fs.writeFileSync(path.join(__dirname, "REPORT.md"), md);

    console.log("\n" + md);
    console.log(`\nWrote artifacts to ${ARTIFACTS}`);
    process.exit(failed === 0 && passed > 0 ? 0 : 1);
  }
}

main();
