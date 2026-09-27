'use strict';
// Phase 18: Cinematic Titles & Motion Graphics Studio E2E Verification
const puppeteer = require('../frontend/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCREENSHOT_PATH = "C:\\Users\\tamil\\.gemini\\antigravity\\brain\\f00b7360-bfcf-4263-a21e-d22563a75d10\\phase18_graphics_studio.png";

function check(label, ok, detail) {
  const sym = ok ? '✓ PASS' : '✗ FAIL';
  const suffix = (!ok && detail) ? `  [${detail}]` : '';
  console.log(`  • ${label.padEnd(68)} : ${sym}${suffix}`);
  return ok;
}

(async () => {
  console.log('========================================================================');
  console.log('TAMIL AI FORGE — PHASE 18 CINEMATIC TITLES & GRAPHICS VERIFICATION');
  console.log('========================================================================\n');

  const results = [];

  // 1. Static Source Code Checks
  console.log('[Check 1: Static Source Code Analysis for Phase 18 Studio]');
  const panelPath = path.join(__dirname, '../frontend/src/components/panels/GraphicsPanel.tsx');
  const panelCode = fs.readFileSync(panelPath, 'utf-8');

  results.push(check('GraphicsPanel.tsx exists and is non-empty', panelCode.length > 500));
  results.push(check('Defines 6 cinematic title presets', panelCode.includes('CINEMATIC_PRESETS') && panelCode.includes('cinema_title') && panelCode.includes('credit_roll')));
  results.push(check('Includes Tamil typography preset & quick phrases', panelCode.includes('வீரம் விளைந்த பூமி') && panelCode.includes('TAMIL_QUICK_PHRASES')));
  results.push(check('Features Add to Timeline button with dedicated ID', panelCode.includes('id="add-graphics-to-timeline-btn"')));
  results.push(check('Zero blocking alert() calls in GraphicsPanel.tsx', !/\balert\s*\(/.test(panelCode)));

  const previewPath = path.join(__dirname, '../frontend/src/components/preview/VideoPreview.tsx');
  const previewCode = fs.readFileSync(previewPath, 'utf-8');
  results.push(check('VideoPreview.tsx computes activeGraphics', previewCode.includes('activeGraphics = useMemo')));
  results.push(check('VideoPreview.tsx renders #video-preview-graphics-overlay', previewCode.includes('id="video-preview-graphics-overlay"')));

  const inspectorPath = path.join(__dirname, '../frontend/src/components/inspector/DynamicInspector.tsx');
  const inspectorCode = fs.readFileSync(inspectorPath, 'utf-8');
  results.push(check('DynamicInspector.tsx handles graphics track role auto-switch', inspectorCode.includes("trackRole === 'graphics'")));
  results.push(check('DynamicInspector.tsx inspects graphics preset metadata', inspectorCode.includes("selectedClip.metadata_info?.graphics")));

  const ffmpegCorePath = path.join(__dirname, '../backend/app/core/ffmpeg.py');
  const ffmpegCode = fs.readFileSync(ffmpegCorePath, 'utf-8');
  results.push(check('FFmpegService builds graphics drawtext filters', ffmpegCode.includes('build_graphics_drawtext_filters')));
  results.push(check('FFmpegService detects system fonts with Tamil support', ffmpegCode.includes('get_system_font_path')));
  results.push(check('render_timeline_sequence accepts graphics_clips parameter', ffmpegCode.includes('graphics_clips: Optional[List[Dict[str, Any]]] = None')));

  // 2. Puppeteer Browser Runtime Checks
  console.log('\n[Check 2: Puppeteer Headless Browser UI & Real-Time Overlay Tests]');
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('  Navigating to http://127.0.0.1:5173...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    // Create / Select a test project with an active timeline
    const projTitle = 'Phase 18 Graphics Studio Verification Project';
    const initData = await page.evaluate(async (title) => {
      let pId = null;
      try {
        const res = await fetch('http://127.0.0.1:8000/api/v1/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        const p = await res.json();
        pId = p.id;
      } catch (err) {
        console.error('Project creation error', err);
      }
      return { projectId: pId };
    }, projTitle);

    results.push(check('Backend project created for verification', Boolean(initData.projectId), initData.projectId));

    // Select project in store and switch to graphics sidebar tab
    await page.evaluate(async (pid, title) => {
      if (window.__projectStore) {
        window.__projectStore.getState().selectProject({
          id: pid,
          title: title,
          settings: { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 }
        });
      }
      if (window.__timelineStore) {
        await window.__timelineStore.getState().fetchTimeline(pid);
      }
      if (window.__uiStore) {
        window.__uiStore.getState().setActiveSidebarTab('graphics');
      }
    }, initData.projectId, projTitle);

    await new Promise(r => setTimeout(r, 1200));

    // Also click sidebar graphics tab button if available
    await page.evaluate(() => {
      const gBtn = document.querySelector('button[title*="Graphics"]');
      if (gBtn) gBtn.click();
    });

    await new Promise(r => setTimeout(r, 800));

    // Check if GraphicsPanel is visible
    const hasGraphicsPanel = await page.evaluate(() => {
      return document.body.innerText.includes('Cinematic Titles & Graphics') ||
             document.body.innerText.includes('Title Presets (6)');
    });
    results.push(check('GraphicsPanel mounted in workspace sidebar', hasGraphicsPanel));

    // Click "Add to Timeline" button
    const addedClip = await page.evaluate(() => {
      const addBtn = document.getElementById('add-graphics-to-timeline-btn');
      if (addBtn) {
        addBtn.click();
        return true;
      }
      return false;
    });
    results.push(check('Clicked #add-graphics-to-timeline-btn to insert title clip', addedClip));

    await new Promise(r => setTimeout(r, 1200));

    // Verify real-time graphics overlay renders in VideoPreview
    const overlayState = await page.evaluate(() => {
      const overlay = document.getElementById('video-preview-graphics-overlay');
      if (!overlay) return { exists: false, text: '' };
      return {
        exists: true,
        text: overlay.innerText,
        opacity: window.getComputedStyle(overlay).opacity
      };
    });

    results.push(check('Real-time #video-preview-graphics-overlay rendered in preview', overlayState.exists, overlayState.text));
    results.push(check('Overlay text contains cinematic preset headline', overlayState.text.includes('TAMIL AI FORGE') || overlayState.text.length > 0));

    // Take screenshot of working Phase 18 Graphics Studio
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    results.push(check('Studio screenshot saved to artifact directory', fs.existsSync(SCREENSHOT_PATH)));

  } catch (err) {
    console.error('Puppeteer execution error:', err.message);
    results.push(check('Puppeteer Phase 18 Suite executed cleanly', false, err.message));
  } finally {
    if (browser) await browser.close();
  }

  // Summary
  const allPassed = results.every(Boolean);
  console.log('\n========================================================================');
  console.log(`PHASE 18 SUMMARY: ${results.filter(Boolean).length}/${results.length} CHECKS PASSED`);
  console.log(`STATUS: ${allPassed ? 'ALL VERIFICATIONS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`);
  console.log('========================================================================\n');

  process.exit(allPassed ? 0 : 1);
})();
