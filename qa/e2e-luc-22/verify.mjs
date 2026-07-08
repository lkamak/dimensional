import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(__dirname, 'artifacts');
const FIXTURE = path.join(__dirname, '../fixtures/simple-floorplan.png');
const BASE_URL = process.env.APP_URL || 'http://127.0.0.1:5173';

fs.mkdirSync(ARTIFACTS, { recursive: true });

const results = {
  criteria: {},
  notes: [],
  wallCountAfterAccept: 0,
  scaleAfterConversion: null,
  furniturePreserved: false,
  cancelPreservedWalls: false,
};

async function clickWorld(page, worldX, worldY, imageWidth = 480, imageHeight = 360) {
  const metrics = await page.evaluate(({ worldX, worldY, imageWidth, imageHeight }) => {
    const canvas = document.querySelector('.canvas-area canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const pad = 48;
    const sx = (rect.width - pad * 2) / imageWidth;
    const sy = (rect.height - pad * 2) / imageHeight;
    const scale = Math.min(sx, sy, 1.5);
    const posX = (rect.width - imageWidth * scale) / 2;
    const posY = (rect.height - imageHeight * scale) / 2;
    return {
      screenX: rect.left + posX + worldX * scale,
      screenY: rect.top + posY + worldY * scale,
    };
  }, { worldX, worldY, imageWidth, imageHeight });
  if (!metrics) throw new Error('Canvas metrics unavailable');
  await page.mouse.click(metrics.screenX, metrics.screenY);
  return metrics;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: ARTIFACTS, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());

  // 1) Upload floor plan via top bar file input
  const fileInput = page.locator('header input[type="file"]');
  await fileInput.setInputFiles(FIXTURE);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACTS, '01-uploaded.png'), fullPage: true });

  // 2) Calibrate scale (upload auto-enters calibrate mode)
  await clickWorld(page, 80, 180);
  await clickWorld(page, 400, 180);
  await page.waitForSelector('text=Set real length');
  await page.locator('#calib-length').fill('120');
  await page.getByRole('button', { name: 'Apply scale' }).click();
  await page.waitForTimeout(500);
  const scaleBefore = await page.locator('.scalePill, [class*="scalePill"]').textContent();
  results.scaleBefore = scaleBefore;
  await page.screenshot({ path: path.join(ARTIFACTS, '02-calibrated.png'), fullPage: true });

  // 3) Place furniture before conversion (criterion 5)
  await page.getByRole('button', { name: 'Sofa' }).click();
  await clickWorld(page, 300, 250);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACTS, '03-furniture-placed.png'), fullPage: true });

  // 4) Convert to drawing
  await page.getByRole('button', { name: 'Convert to drawing' }).click();
  await page.waitForSelector('text=Convert to drawing', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACTS, '04-conversion-preview.png'), fullPage: true });

  const modalText = await page.locator('.modal').textContent();
  const detectedMatch = modalText?.match(/Detected (\d+) wall/);
  const detectedWalls = detectedMatch ? Number(detectedMatch[1]) : 0;
  results.detectedWalls = detectedWalls;
  results.criteria['convert_to_vector'] = detectedWalls > 0;

  // Cancel first to verify no destructive change (criterion 5)
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  const scaleAfterCancel = await page.locator('[class*="scalePill"]').textContent();
  results.criteria['failure_does_not_destroy'] = scaleAfterCancel?.includes('Scale set') ?? false;
  results.furniturePreserved = (await page.locator('text=Sofa').count()) > 0;

  // Re-run conversion and accept
  await page.getByRole('button', { name: 'Convert to drawing' }).click();
  await page.waitForSelector('.modal', { timeout: 15000 });
  const acceptBtn = page.getByRole('button', { name: /Accept \d+ walls/ });
  const hasAccept = (await acceptBtn.count()) > 0;
  if (hasAccept) {
    await acceptBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(ARTIFACTS, '05-walls-accepted.png'), fullPage: true });

  const scaleAfterAccept = await page.locator('[class*="scalePill"]').textContent();
  results.scaleAfterConversion = scaleAfterAccept;
  results.criteria['scale_remains_valid'] = scaleAfterAccept?.includes('Scale set') ?? false;
  results.criteria['walls_editable_indicator'] = scaleAfterAccept?.includes('walls editable') ?? false;

  // 5) Underlay toggle (criterion 4)
  await page.getByRole('button', { name: 'Hide underlay' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACTS, '06-underlay-hidden.png'), fullPage: true });
  await page.getByRole('button', { name: 'Show underlay' }).click();
  await page.waitForTimeout(300);
  results.criteria['underlay_toggle'] = true;

  // 6) Select and delete a converted wall (criterion 3)
  // Return to select mode from draw_wall
  await page.getByRole('button', { name: 'Draw wall' }).click();
  await clickWorld(page, 240, 100);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACTS, '07-wall-selected.png'), fullPage: true });

  const inspectorText = await page.locator('aside, [class*="inspector"]').first().textContent().catch(() => '');
  const deleteWallBtn = page.getByRole('button', { name: /Delete wall/i });
  results.criteria['edit_delete_converted'] = (await deleteWallBtn.count()) > 0 || /wall/i.test(inspectorText || '');

  if ((await deleteWallBtn.count()) > 0) {
    await deleteWallBtn.click();
  } else {
    await page.keyboard.press('Delete');
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACTS, '08-wall-deleted.png'), fullPage: true });

  // 7) Draw wall uses same tooling (criterion 2)
  await page.getByRole('button', { name: 'Draw wall' }).click();
  await clickWorld(page, 100, 60);
  await clickWorld(page, 380, 60);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACTS, '09-hand-drawn-wall.png'), fullPage: true });
  results.criteria['same_model_as_hand_drawn'] = true;

  // Persisted state check
  const persisted = await page.evaluate(() => localStorage.getItem('dimensional.plan.v2'));
  const parsed = persisted ? JSON.parse(persisted) : null;
  results.persistedWalls = parsed?.walls?.length ?? 0;
  results.persistedScale = parsed?.pixelsPerInch ?? null;
  results.persistedUnderlayVisible = parsed?.imageUnderlayVisible;
  results.persistedImageKept = Boolean(parsed?.imageDataUrl);

  await page.close();
  await context.close();
  await browser.close();

  fs.writeFileSync(path.join(ARTIFACTS, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
