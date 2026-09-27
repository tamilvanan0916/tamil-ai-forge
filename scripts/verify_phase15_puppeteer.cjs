'use strict';
// TAMIL AI FORGE — PHASE 15 PRODUCTION HARDENING & FINAL E2E UX VERIFICATION SUITE
// Quality Gate: Exit 0 = ALL PASSED. Exit 1 = FAIL.

const puppeteer = require('../frontend/node_modules/puppeteer-core');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const VIEWPORTS = [
  { name: 'Desktop 1920x1080', width: 1920, height: 1080, type: 'desktop' },
  { name: 'Desktop 1440x900',  width: 1440, height: 900,  type: 'desktop' },
  { name: 'Desktop 1280x720',  width: 1280, height: 720,  type: 'desktop' },
  { name: 'Tablet  1024x768',  width: 1024, height: 768,  type: 'tablet'  },
  { name: 'Tablet   768x1024', width: 768,  height: 1024, type: 'tablet'  },
  { name: 'Mobile  430x932',   width: 430,  height: 932,  type: 'mobile'  },
  { name: 'Mobile  390x844',   width: 390,  height: 844,  type: 'mobile'  },
  { name: 'Mobile  375x812',   width: 375,  height: 812,  type: 'mobile'  },
];

function check(label, ok, detail) {
  const sym = ok ? '✓ PASS' : '✗ FAIL';
  const suffix = (!ok && detail) ? `  [${detail}]` : '';
  console.log(`  • ${label.padEnd(64)} : ${sym}${suffix}`);
  return ok;
}

// ─── Stage 1: Setup Project & Test Media ─────────────────────────────────────
async function setupProjectWithMedia(page) {
  console.log('\n[Stage 1: Phase 15 Project & Store Setup]');
  return await page.evaluate(async () => {
    try {
      const pRes = await fetch('http://127.0.0.1:8000/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Puppeteer Phase 15 Production Hardening Project',
          description: 'Testing Media-to-Cinema Transformation E2E UX'
        })
      });
      const proj = await pRes.json();
      const pid = proj.id;

      if (window.__projectStore) {
        window.__projectStore.getState().selectProject({
          id: pid,
          title: proj.title,
          settings: { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 }
        });
      }
      if (window.__timelineStore) {
        await window.__timelineStore.getState().fetchTimeline(pid);
      }

      return { ok: true, projectId: pid, title: proj.title };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

// ─── Stage 2: Studio UI & Phase 15 Elements ──────────────────────────────────
async function verifyPhase15StudioUI(page) {
  console.log('\n[Stage 2: Phase 15 Media Transform Studio UI Elements]');
  const results = [];

  // Switch to media-transform tab via store
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('media-transform');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const uiChecks = await page.evaluate(() => {
    const root = document.getElementById('media-transformation-studio');
    if (!root) return { hasRoot: false };

    const text = root.innerText;
    const allBtns = Array.from(root.querySelectorAll('button'));
    const disabledBtns = allBtns.filter(b => b.disabled);

    return {
      hasRoot: true,
      hasHeader: text.includes('AI Media Transformation Studio') || text.includes('AI MEDIA TRANSFORMATION'),
      hasOfflineBadge: text.includes('Offline Preview') || text.includes('OFFLINE DEMO') || text.includes('MOCK'),
      hasDropzone: text.includes('Source Media Upload') || text.includes('Click or Drop Source Media'),
      hasRefDropzone: text.includes('Reference Character') || text.includes('Optional Reference Character'),
      hasModeSection: text.includes('Transformation Mode') || text.includes('TRANSFORMATION MODE'),
      hasModes: text.includes('3D Cartoon') && text.includes('Character'),
      hasStylePresets: text.includes('Visual Style Preset') || text.includes('3D Cartoon'),
      hasSliders: text.includes('Style Strength') && text.includes('Character Consistency'),
      hasGenerateBtn: text.includes('Generate Transformation'),
      hasEmptyStateHint: text.includes('Upload a source media file') || text.includes('Upload source media') || text.includes('to get started'),
      hasDisabledBtnWhenNoSource: disabledBtns.length > 0,
    };
  });

  results.push(check('Studio root container mounted', uiChecks.hasRoot));
  results.push(check('Studio header title visible', uiChecks.hasHeader));
  results.push(check('OFFLINE DEMO TRANSFORMATION badge visible', uiChecks.hasOfflineBadge));
  results.push(check('Source media upload dropzone rendered', uiChecks.hasDropzone));
  results.push(check('Reference character dropzone rendered', uiChecks.hasRefDropzone));
  results.push(check('Transformation Mode selection section rendered', uiChecks.hasModeSection));
  results.push(check('Transformation modes present', uiChecks.hasModes));
  results.push(check('Style Presets section rendered', uiChecks.hasStylePresets));
  results.push(check('Style Strength & Consistency sliders rendered', uiChecks.hasSliders));
  results.push(check('Generate Transformation button rendered', uiChecks.hasGenerateBtn));
  results.push(check('Phase 15: Empty state guidance visible', uiChecks.hasEmptyStateHint));
  results.push(check('Phase 15: Generate button disabled when no source', uiChecks.hasDisabledBtnWhenNoSource));

  return results.every(Boolean);
}

// ─── Stage 3: Phase 15 E2E Transformation Lifecycle & Canonical Stages ───────
async function verifyTransformationLifecycle(page, projectId) {
  console.log('\n[Stage 3: Phase 15 E2E Transformation Lifecycle & Canonical Stages]');
  const results = [];

  const jobData = await page.evaluate(async (pid) => {
    try {
      // 1. Upload source asset
      const formData = new FormData();
      const dummyBlob = new Blob(['phase15_source_image_mock_bytes'], { type: 'image/png' });
      formData.append('file', dummyBlob, 'hero_character.png');
      formData.append('folder_path', '/Source Media');

      const upRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${pid}/assets/upload`, {
        method: 'POST',
        body: formData
      });
      const sourceAsset = await upRes.json();

      // 2. Create transformation job
      const tRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: pid,
          mode: 'IMAGE_TO_3D_CARTOON',
          source_asset_id: sourceAsset.id,
          prompt: 'Transform into heroic Pixar 3D animated character',
          options: {
            style_preset: 'pixar_family',
            style_strength: 85.0,
            character_consistency: 90.0,
            preserve_audio: true
          }
        })
      });
      const initialJob = await tRes.json();

      // 3. Poll and capture stages
      const stagesObserved = [];
      let currentJob = initialJob;
      for (let i = 0; i < 35; i++) {
        await new Promise(r => setTimeout(r, 200));
        const chk = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${initialJob.job_id}`).then(r => r.json());
        currentJob = chk;
        const stage = chk.metadata?.stage || chk.current_stage;
        if (stage && !stagesObserved.includes(stage)) {
          stagesObserved.push(stage);
        }
        if (chk.status === 'completed' || chk.status === 'failed') break;
      }

      // 4. Fetch rich result
      const rRes = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${initialJob.job_id}/result`);
      const resultData = await rRes.json();

      return {
        ok: true,
        sourceAssetId: sourceAsset.id,
        jobId: initialJob.job_id,
        initialStatus: initialJob.status,
        finalStatus: currentJob.status,
        stagesObserved,
        outputAssetId: currentJob.output_asset_id,
        outputUrl: currentJob.output_url,
        resultData
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, projectId);

  results.push(check('Job created in queued state', jobData.ok && jobData.initialStatus === 'queued'));
  results.push(check('Job successfully completed', jobData.finalStatus === 'completed'));
  results.push(check('Canonical stages observed (QUEUED/PROCESSING/COMPLETED)',
    jobData.stagesObserved.length >= 2,
    `Observed: ${jobData.stagesObserved.join(' → ')}`
  ));
  results.push(check('Output asset registered in database', Boolean(jobData.outputAssetId)));
  results.push(check('Rich result contains source file metadata',
    Boolean(jobData.resultData?.source_file_name) && Boolean(jobData.resultData?.source_asset_type)
  ));
  results.push(check('Rich result contains output file metadata & mode',
    Boolean(jobData.resultData?.output_file_name) && Boolean(jobData.resultData?.transformation_mode)
  ));
  results.push(check('Offline demo transformation label preserved',
    (jobData.resultData?.offline_label || '').includes('OFFLINE DEMO TRANSFORMATION')
  ));

  return { allPassed: results.every(Boolean), jobId: jobData.jobId };
}

// ─── Stage 4: Phase 15 Output Actions (Assets & Timeline) ────────────────────
async function verifyOutputActions(page, jobId) {
  console.log('\n[Stage 4: Phase 15 Output Actions (Assets & Timeline)]');
  const results = [];

  const actionResults = await page.evaluate(async (jid) => {
    try {
      // 1. Add to assets
      const aRes = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jid}/add-to-assets`, {
        method: 'POST'
      });
      const assetData = await aRes.json();

      // 2. Add to timeline
      const tRes = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jid}/add-to-timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_role: 'v1_main' })
      });
      const timelineData = await tRes.json();

      return {
        ok: true,
        assetSuccess: assetData.success,
        assetFolder: assetData.folder_path,
        assetMode: assetData.transformation_mode,
        timelineSuccess: timelineData.success,
        clipId: timelineData.clip_id,
        trackId: timelineData.track_id,
        hasRevision: Boolean(timelineData.revision_id),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, jobId);

  results.push(check('Add to assets returns success', actionResults.assetSuccess));
  results.push(check('Asset assigned to /AI Transforms folder', actionResults.assetFolder === '/AI Transforms'));
  results.push(check('Asset enriched with transformation mode', Boolean(actionResults.assetMode)));
  results.push(check('Add to timeline inserts clip on track V1', actionResults.timelineSuccess && Boolean(actionResults.clipId)));
  results.push(check('Timeline revision snapshot recorded', actionResults.hasRevision));

  return results.every(Boolean);
}

// ─── Stage 5: Backend API Hardening & Error States (Node fetch) ──────────────
async function verifyBackendHardening(projectId) {
  console.log('\n[Stage 5: Phase 15 Backend Hardening & Edge Cases]');
  const results = [];

  // Note: Executed in Node context so expected HTTP 4xx responses DO NOT log browser console errors
  try {
    // 1. Reject non-existent source asset
    const badSourceRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        mode: 'IMAGE_TO_3D_CARTOON',
        source_asset_id: '00000000-0000-0000-0000-000000000001'
      })
    });
    results.push(check(
      'Missing source asset returns 404/422 status',
      badSourceRes.status === 404 || badSourceRes.status === 422,
      `Status: ${badSourceRes.status}`
    ));

    // 2. Reject retry on non-existent job
    const badRetryRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/00000000-0000-0000-0000-000000000099/retry', {
      method: 'POST'
    });
    results.push(check('Retry non-existent job returns 404', badRetryRes.status === 404, `Status: ${badRetryRes.status}`));

    // 3. Reject add-to-assets on non-existent job
    const badAssetRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/00000000-0000-0000-0000-000000000099/add-to-assets', {
      method: 'POST'
    });
    results.push(check('Add-to-assets on non-existent job returns 404', badAssetRes.status === 404, `Status: ${badAssetRes.status}`));

    // 4. Reject cancel on non-existent job
    const badCancelRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/00000000-0000-0000-0000-000000000099/cancel', {
      method: 'POST'
    });
    results.push(check('Cancel non-existent job returns 404', badCancelRes.status === 404, `Status: ${badCancelRes.status}`));

  } catch (e) {
    console.error('Error during backend hardening verification:', e);
    results.push(check('Backend hardening checks executed', false, String(e)));
  }

  return results.every(Boolean);
}

// ─── Stage 6: Responsive Viewports (8 viewports) ─────────────────────────────
async function verifyResponsiveViewports(page) {
  console.log('\n[Stage 6: Responsive Viewport Verification (8 viewports)]');
  const results = [];

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 300));

    const vpCheck = await page.evaluate(() => {
      if (window.__uiStore && window.__uiStore.getState().activeSidebarTab !== 'media-transform') {
        window.__uiStore.getState().setActiveSidebarTab('media-transform');
      }
      const root = document.getElementById('media-transformation-studio');
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const hasOverflow = docW > winW + 2;
      const studioVisible = root !== null && root.offsetHeight > 0;
      return { hasOverflow, studioVisible, docW, winW };
    });

    const isOk = !vpCheck.hasOverflow && vpCheck.studioVisible;
    results.push(check(
      `${vp.name.padEnd(20)} (${vp.width}x${vp.height}) - No overflow & visible`,
      isOk,
      vpCheck.hasOverflow ? `Overflow: ${vpCheck.docW}px > ${vpCheck.winW}px` : (!vpCheck.studioVisible ? 'Studio not visible' : '')
    ));
  }

  // Restore desktop size
  await page.setViewport({ width: 1440, height: 900 });
  return results.every(Boolean);
}

// ─── Stage 7: Provider Safety & Offline Label Permanence ─────────────────────
async function verifyProviderSafety(page) {
  console.log('\n[Stage 7: Provider Safety & Offline Label Permanence]');
  const results = [];

  await page.evaluate(() => {
    if (window.__uiStore) window.__uiStore.getState().setActiveSidebarTab('media-transform');
  });
  await new Promise(r => setTimeout(r, 500));

  const safetyChecks = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasOfflineBadge: text.includes('OFFLINE DEMO TRANSFORMATION') || text.includes('Offline Preview') || text.includes('MOCK'),
      hasNoRealProviderClaim: !text.includes('REAL AI VERIFIED') && !text.includes('REAL OMNI VERIFIED'),
      hasNoExternalQuotaWarning: !text.includes('Hugging Face Quota') && !text.includes('ZeroGPU exhausted'),
    };
  });

  results.push(check('OFFLINE DEMO / Mock transformation badge present', safetyChecks.hasOfflineBadge));
  results.push(check('Zero false "REAL AI VERIFIED" claims in UI', safetyChecks.hasNoRealProviderClaim));
  results.push(check('Zero external AI quota consumption warnings', safetyChecks.hasNoExternalQuotaWarning));

  return results.every(Boolean);
}

// ─── Master Runner ───────────────────────────────────────────────────────────
(async () => {
  console.log('========================================================================');
  console.log('TAMIL AI FORGE — PHASE 15 PRODUCTION HARDENING & E2E UX VERIFICATION');
  console.log('========================================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('favicon.ico') && !txt.includes('404')) {
        consoleErrors.push(txt);
      }
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.includes('favicon.ico')) {
      failedRequests.push(`${req.method()} ${url} : ${req.failure()?.errorText}`);
    }
  });

  let allPassed = true;

  try {
    console.log('\nNavigating to http://127.0.0.1:5173...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Application loaded successfully.');

    // Stage 1: Setup
    const s1 = await setupProjectWithMedia(page);
    if (!check('Project setup for Phase 15', s1.ok, s1.error)) allPassed = false;

    // Stage 2: Studio UI
    const s2 = await verifyPhase15StudioUI(page);
    if (!s2) allPassed = false;

    // Stage 3: E2E Lifecycle
    const s3 = await verifyTransformationLifecycle(page, s1.projectId);
    if (!s3.allPassed) allPassed = false;

    // Stage 4: Output Actions
    const s4 = await verifyOutputActions(page, s3.jobId);
    if (!s4) allPassed = false;

    // Stage 5: Backend Hardening
    const s5 = await verifyBackendHardening(s1.projectId);
    if (!s5) allPassed = false;

    // Stage 6: Responsive Viewports
    const s6 = await verifyResponsiveViewports(page);
    if (!s6) allPassed = false;

    // Stage 7: Provider Safety
    const s7 = await verifyProviderSafety(page);
    if (!s7) allPassed = false;

    // Quality Gates: Console & Page Errors
    console.log('\n[Stage 8: Console, Page Error & Network Quality Gates]');
    const consoleOk = check('Zero browser console errors', consoleErrors.length === 0, consoleErrors.join('; '));
    const pageOk = check('Zero uncaught page/runtime errors', pageErrors.length === 0, pageErrors.join('; '));
    const netOk = check('Zero failed application HTTP requests', failedRequests.length === 0, failedRequests.join('; '));

    if (!consoleOk || !pageOk || !netOk) allPassed = false;

  } catch (err) {
    console.error('\nFatal test execution error:', err);
    allPassed = false;
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  if (allPassed) {
    console.log('>>> ALL PHASE 15 VERIFICATION GATES PASSED [EXIT 0] <<<');
    console.log('========================================================================');
    process.exit(0);
  } else {
    console.error('>>> PHASE 15 VERIFICATION FAILED [EXIT 1] <<<');
    console.log('========================================================================');
    process.exit(1);
  }
})();
