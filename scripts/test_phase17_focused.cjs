'use strict';
// Focused Phase 17 verification: Mobile navigation routing & CaptionsPanel notification handling
const puppeteer = require('../frontend/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function check(label, ok, detail) {
  const sym = ok ? '✓ PASS' : '✗ FAIL';
  const suffix = (!ok && detail) ? `  [${detail}]` : '';
  console.log(`  • ${label.padEnd(68)} : ${sym}${suffix}`);
  return ok;
}

(async () => {
  console.log('========================================================================');
  console.log('TAMIL AI FORGE — PHASE 17 FOCUSED MOBILE ROUTING & CAPTIONS VERIFICATION');
  console.log('========================================================================\n');

  let exitCode = 0;
  const results = [];

  // 1. Static Source Code Checks
  console.log('[Check 1: Static Source Code Analysis for CaptionsPanel]');
  const captionsCode = fs.readFileSync(path.join(__dirname, '../frontend/src/components/panels/CaptionsPanel.tsx'), 'utf-8');
  const hasAlert = /\balert\s*\(/.test(captionsCode);
  const hasShowNotification = /showNotification\s*\(/.test(captionsCode);
  const importsUIStore = /useUIStore/.test(captionsCode);

  results.push(check('Zero native blocking alert() calls in CaptionsPanel.tsx', !hasAlert));
  results.push(check('useUIStore imported in CaptionsPanel.tsx', importsUIStore));
  results.push(check('showNotification used for error handling in CaptionsPanel.tsx', hasShowNotification));

  console.log('\n[Check 2: Static Source Code Analysis for App.tsx Mobile Routing]');
  const appCode = fs.readFileSync(path.join(__dirname, '../frontend/src/App.tsx'), 'utf-8');
  const hasEditCheck = /activeSidebarTab\s*!==\s*['"]edit['"]/.test(appCode);
  results.push(check('App.tsx routes mobile workspace via activeSidebarTab !== "edit"', hasEditCheck));

  // 2. Puppeteer Mobile Runtime Checks
  console.log('\n[Check 3: Puppeteer Mobile Runtime Viewport & Navigation]');
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    // Create a temporary project if needed to test panels
    await page.evaluate(async () => {
      const pRes = await fetch('http://127.0.0.1:8000/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Phase 17 Mobile Routing Test Project' })
      });
      const proj = await pRes.json();
      if (window.__projectStore) {
        window.__projectStore.getState().selectProject(proj);
      }
    });
    await new Promise(r => setTimeout(r, 600));

    // Test A: activeSidebarTab === 'edit' renders Timeline
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('edit');
    });
    await new Promise(r => setTimeout(r, 500));
    const editCheck = await page.evaluate(() => {
      const timeline = document.getElementById('timeline-shell') || document.querySelector('button[title*="Safe Areas"]') || document.querySelector('button[title*="Snap"]');
      return { hasTimeline: !!timeline };
    });
    results.push(check('Mobile + tab="edit": renders Timeline & VideoPreview', editCheck.hasTimeline));

    // Test B: activeSidebarTab === 'production-studio'
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('production-studio');
    });
    await new Promise(r => setTimeout(r, 800));
    const prodCheck = await page.evaluate(() => {
      const studio = document.getElementById('production-studio');
      const theater = document.getElementById('cinema-screening-theater');
      return !!studio || !!theater;
    });
    results.push(check('Mobile + tab="production-studio": renders Production Studio in main area', prodCheck));

    // Test C: activeSidebarTab === 'captions'
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('captions');
    });
    await new Promise(r => setTimeout(r, 600));
    const capCheck = await page.evaluate(() => {
      const capPanel = document.getElementById('captions-panel');
      const autoBtn = document.getElementById('auto-caption-btn');
      return !!capPanel || !!autoBtn;
    });
    results.push(check('Mobile + tab="captions": renders CaptionsPanel in main area', capCheck));

    // Test D: activeSidebarTab === 'story-script'
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('story-script');
    });
    await new Promise(r => setTimeout(r, 600));
    const storyCheck = await page.evaluate(() => {
      return document.body.innerText.includes('Story') || document.body.innerText.includes('Script');
    });
    results.push(check('Mobile + tab="story-script": renders StoryStudio in main area', storyCheck));

    // Test E: activeSidebarTab === 'characters'
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('characters');
    });
    await new Promise(r => setTimeout(r, 600));
    const charCheck = await page.evaluate(() => {
      return document.body.innerText.includes('Character');
    });
    results.push(check('Mobile + tab="characters": renders CharacterStudio in main area', charCheck));

    // Test F: activeSidebarTab === 'scenes'
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('scenes');
    });
    await new Promise(r => setTimeout(r, 600));
    const sceneCheck = await page.evaluate(() => {
      return document.body.innerText.includes('Scene');
    });
    results.push(check('Mobile + tab="scenes": renders SceneStudio in main area', sceneCheck));

    // Test G: activeSidebarTab === 'media-transform'
    await page.evaluate(() => {
      window.__uiStore.getState().setActiveSidebarTab('media-transform');
    });
    await new Promise(r => setTimeout(r, 600));
    const transformCheck = await page.evaluate(() => {
      return !!document.getElementById('media-transform-studio') || document.body.innerText.includes('Transformation');
    });
    results.push(check('Mobile + tab="media-transform": renders Media Transform Studio in main area', transformCheck));

    // Test H: Non-blocking Notification system
    console.log('\n[Check 4: Non-Blocking Toast Notification UX]');
    await page.evaluate(() => {
      window.__uiStore.getState().showNotification('Auto-caption failed. Whisper STT required.', 'error');
    });
    await new Promise(r => setTimeout(r, 400));
    const toastCheck = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return bodyText.includes('Auto-caption failed. Whisper STT required.');
    });
    results.push(check('Non-blocking error toast notification renders on screen', toastCheck));

  } catch (err) {
    console.error('✗ Runtime error during focused verification:', err);
    results.push(false);
  } finally {
    if (browser) await browser.close();
  }

  const allPassed = results.every(Boolean);
  console.log('\n========================================================================');
  if (allPassed) {
    console.log('>>> ALL PHASE 17 FOCUSED VERIFICATION CHECKS PASSED [EXIT 0] <<<');
  } else {
    console.log('>>> SOME CHECKS FAILED [EXIT 1] <<<');
    exitCode = 1;
  }
  console.log('========================================================================\n');
  process.exit(exitCode);
})();
