// Zrzut ekranu strony przez Playwright (Chromium headless z WebGL przez SwiftShader).
// Użycie: node scripts/shot.mjs <url> <out.png> [--w=1480] [--h=924] [--wait=2500] [--touch] [--eval="js"] [--log]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node scripts/shot.mjs <url> <out.png> [--w=] [--h=] [--wait=] [--touch] [--eval=] [--log]'); process.exit(2); }
const opt = Object.fromEntries(rest.map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const w = Number(opt.w ?? 1480), h = Number(opt.h ?? 924), wait = Number(opt.wait ?? 2500);
const browser = await pw.chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: !!opt.touch, isMobile: false });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
if (opt.eval) { const r = await page.evaluate(String(opt.eval)); if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`); await page.waitForTimeout(800); }
await page.screenshot({ path: out });
if (opt.log || logs.some(l => l.startsWith('[error]') || l.startsWith('[pageerror]'))) console.log(logs.join('\n'));
await browser.close();
console.log(`saved ${out}`);
