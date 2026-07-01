/**
 * 自动化采集 [白屏诊断] 日志 — node scripts/run-atlas-diag.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DIAG_URL ?? 'http://localhost:5173/#/atlas';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[白屏诊断') || text.includes('[版块/中央诊断]')) {
    logs.push(text);
  }
});

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);

  const diag = await page.evaluate(() => window.__ATLAS_DIAG__ ?? null);

  console.log('=== CONSOLE 诊断日志 ===');
  logs.forEach((l) => console.log(l));

  console.log('\n=== window.__ATLAS_DIAG__.latest ===');
  console.log(JSON.stringify(diag?.latest ?? diag, null, 2));

  console.log('\n=== 各阶段快照 ===');
  if (diag) {
    for (const [k, v] of Object.entries(diag)) {
      if (k === 'latest') continue;
      console.log(`-- ${k}: loop=${v.scene?.loopRunning} renders=${v.scene?.renderCount} buffer=${v.canvas?.bufferWidth}×${v.canvas?.bufferHeight}`);
    }
  }
  if (diag?.latest) {
    const r = diag.latest;
    console.log('\n=== 摘要 ===');
    console.log('容器 #atlas-viewport:', r.containers?.atlasViewport?.offsetWidth, '×', r.containers?.atlasViewport?.offsetHeight);
    console.log('容器 background:', r.containers?.atlasViewport?.backgroundColor);
    console.log('canvas buffer:', r.canvas?.bufferWidth, '×', r.canvas?.bufferHeight);
    console.log('canvas client:', r.canvas?.clientWidth, '×', r.canvas?.clientHeight);
    console.log('尺寸一致:', r.sizeConsistency?.clientMatchesViewport);
    console.log('渲染循环:', r.scene?.loopRunning, '已渲染帧:', r.scene?.renderCount);
    console.log('模型存在:', r.scene?.model?.exists);
    console.log('相机:', JSON.stringify(r.scene?.camera));
    console.log('clap-flash:', r.containers?.clapFlash?.classList, 'opacity:', r.containers?.clapFlash?.opacity);
  }
} catch (err) {
  console.error('诊断脚本失败:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
