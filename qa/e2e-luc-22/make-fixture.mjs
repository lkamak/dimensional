import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../fixtures');
fs.mkdirSync(fixtureDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no ctx');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 480, 360);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.strokeRect(40, 40, 400, 280);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(240, 40);
  ctx.lineTo(240, 320);
  ctx.moveTo(40, 180);
  ctx.lineTo(440, 180);
  ctx.stroke();
  return c.toDataURL('image/png');
});
const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(path.join(fixtureDir, 'simple-floorplan.png'), Buffer.from(b64, 'base64'));
console.log('fixture written');
await browser.close();
