import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://127.0.0.1:5173";
const FIXTURE = "/workspace/qa/e2e-luc-23/fixtures/floorplan.png";

async function pause(page, ms=800){ await page.waitForTimeout(ms); }

async function bindStage(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".canvas-area");
    if (!root) return false;
    const fiberKey = Object.keys(root).find((k) => k.startsWith("__reactFiber"));
    if (!fiberKey) return false;
    function walk(n, depth) {
      if (!n || depth > 40) return false;
      let s = n.memoizedState; let i=0;
      while (s && i < 40) {
        const memo = s.memoizedState;
        if (memo?.current && typeof memo.current.x === "function" && typeof memo.current.scaleX === "function") {
          window.__qaStage = memo.current; return true;
        }
        s = s.next; i++;
      }
      return walk(n.child, depth+1) || walk(n.sibling, depth+1);
    }
    return walk(root[fiberKey], 0);
  });
}

async function worldToScreen(page, wx, wy) {
  await bindStage(page);
  return page.evaluate(({wx,wy}) => {
    const canvas = document.querySelector(".canvas-area canvas");
    const rect = canvas.getBoundingClientRect();
    const stage = window.__qaStage;
    if (!stage) return {x: rect.left+wx, y: rect.top+wy};
    const scale = stage.scaleX(); const pos = stage.position();
    return {x: rect.left + pos.x + wx*scale, y: rect.top + pos.y + wy*scale};
  }, {wx,wy});
}

async function calibrate(page) {
  const hint = page.getByText(/Click two points/i);
  if (!(await hint.isVisible().catch(()=>false))) {
    await page.getByRole("button", {name:"Calibrate"}).click();
    await pause(page,500);
  }
  const a = await worldToScreen(page, 100, 400);
  const b = await worldToScreen(page, 360, 400);
  await page.mouse.click(a.x,a.y,{delay:40}); await pause(page,700);
  await page.mouse.click(b.x,b.y,{delay:40}); await pause(page,900);
  await page.locator("#calib-length").fill("10");
  await page.getByRole("button", {name:"Apply scale"}).click();
  await pause(page,800);
}

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
await page.goto(BASE,{waitUntil:"networkidle"});
await page.evaluate(()=>localStorage.clear());
await page.reload({waitUntil:"networkidle"});
await pause(page,1000);
await page.locator("header input[type='file']").setInputFiles(FIXTURE);
await pause(page,1200);
await calibrate(page);
await page.locator("aside").getByRole("button",{name:/^Sofa\b/}).click();
await pause(page,800);
// Save clean copy
await page.getByRole("button",{name:"Save clean copy"}).click();
await pause(page,700);
await page.getByLabel("Plan name").fill("Protect Base");
await page.getByRole("dialog").getByRole("button",{name:"Save clean copy"}).click();
await pause(page,1000);
// Open clean base (need open - currently still on full working plan; open the clean)
await page.getByRole("button",{name:"Open"}).click();
await pause(page,800);
const dlg = page.getByRole("dialog");
if (/Unsaved/i.test(await dlg.innerText())) {
  await dlg.getByRole("button",{name:"Discard"}).click();
  await pause(page,800);
}
await page.getByRole("dialog").locator("li").filter({hasText:"Protect Base"}).locator("button").first().click();
await pause(page,1200);
// Dirty the clean base
await page.locator("aside").getByRole("button",{name:/^Desk\b/}).click();
await pause(page,800);
// Trigger unsaved flow via Open
await page.getByRole("button",{name:"Open"}).click();
await pause(page,1000);
const unsaved = page.getByRole("dialog");
const unsavedText = await unsaved.innerText();
console.log("unsaved dialog:", unsavedText.replace(/\n/g," | ").slice(0,200));
await unsaved.getByRole("button",{name:"Save & continue"}).click();
await pause(page,1200);
const next = page.getByRole("dialog");
const nextText = await next.innerText();
console.log("after save&continue:", nextText.replace(/\n/g," | ").slice(0,250));
const routed = /Save plan as/i.test(nextText);
const library = await page.evaluate(()=>{
  const index=JSON.parse(localStorage.getItem("dimensional.library.index.v2")||'{"plans":[]}');
  return index.plans.map(p=>{
    const e=JSON.parse(localStorage.getItem(`dimensional.library.plan.${p.id}.v2`)||"null");
    return {name:p.name,kind:p.kind,items:e?.state?.items?.length??0};
  });
});
console.log("library:", JSON.stringify(library,null,2));
const base = library.find(p=>p.name==="Protect Base");
const baseIntact = base && base.kind==="clean" && base.items===0;
console.log("SAVE_CONTINUE_PROTECT:", routed && baseIntact ? "PASS" : "FAIL", {routed, base});
await page.screenshot({path:"/workspace/qa/e2e-luc-23/artifacts/16-save-continue-protects.png", fullPage:true});
await browser.close();
process.exit(routed && baseIntact ? 0 : 1);
