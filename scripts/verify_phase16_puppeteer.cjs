'use strict';
// TAMIL AI FORGE — PHASE 16 PRODUCTION POLISH, PERSISTENCE & FINAL UX INTEGRATION SUITE
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
  console.log('\n[Stage 1: Phase 16 Project & Store Setup]');
  return await page.evaluate(async () => {
    try {
      const pRes = await fetch('http://127.0.0.1:8000/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Phase 16 Cinema Integration Masterpiece',
          description: 'Production polish, persistence, and unified pipeline verification'
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

// ─── Stage 2: Unified Project Status API Verification ────────────────────────
async function verifyUnifiedStatusAPI(projectId) {
  console.log('\n[Stage 2: Unified Project Status API Verification]');
  const results = [];

  try {
    const res = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/unified-status`);
    results.push(check('GET /projects/{id}/unified-status returns 200 OK', res.status === 200, `status=${res.status}`));

    const data = await res.json();
    results.push(check('Project ID matches in unified status', data.project_id === projectId));
    results.push(check('Current stage initialized to PROJECT_SETUP', data.current_stage === 'PROJECT_SETUP'));
    results.push(check('Completion percentage is valid number >= 10%', data.completion_percent >= 10.0));
    results.push(check('Honest offline demo mode label returned', (data.offline_label || '').includes('OFFLINE DEMO MODE')));

    const stages = data.stages || {};
    const requiredStages = [
      'project_setup', 'story', 'scene_generation', 'audio', 'music',
      'captions', 'timeline', 'transformation', 'rendering', 'deliverables'
    ];
    const hasAll10 = requiredStages.every(k => k in stages);
    results.push(check('All 10 pipeline stages present in status dictionary', hasAll10));

    return results.every(Boolean);
  } catch (e) {
    results.push(check('Unified status API call threw exception', false, String(e)));
    return false;
  }
}

// ─── Stage 3: TopBar & Unified Project Status Modal UI ───────────────────────
async function verifyUnifiedStatusModal(page) {
  console.log('\n[Stage 3: TopBar & Unified Project Status Modal]');
  const results = [];

  // Check topbar status button
  const hasTopBarBtn = await page.evaluate(() => {
    const btn = document.getElementById('topbar-project-status-btn');
    return !!btn;
  });
  results.push(check('TopBar "Status" button rendered', hasTopBarBtn));

  // Click TopBar Status button
  await page.click('#topbar-project-status-btn');
  await new Promise(r => setTimeout(r, 600));

  // Check Modal mounting
  const modalInfo = await page.evaluate(() => {
    const modal = document.getElementById('unified-project-status-modal');
    if (!modal) return { hasModal: false };
    const text = modal.innerText;
    const stageItems = Array.from(modal.querySelectorAll('[id^="pipeline-stage-"]'));

    return {
      hasModal: true,
      hasTitle: text.includes('Project Pipeline Status & Health'),
      hasProgressText: (text.toUpperCase().includes('OVERALL PROGRESS') || !!document.getElementById('project-overall-progress-title')) && text.includes('Production Complete'),
      hasIntegrityPill: text.includes('OFFLINE DEMO MODE') && text.includes('NOT REAL-PROVIDER-VERIFIED'),
      stageCount: stageItems.length,
      hasStage1: !!document.getElementById('pipeline-stage-project_setup'),
      hasStage8: !!document.getElementById('pipeline-stage-transformation'),
      hasStage10: !!document.getElementById('pipeline-stage-deliverables'),
    };
  });

  results.push(check('Unified Project Status Modal mounted on click', modalInfo.hasModal));
  results.push(check('Modal title "Project Pipeline Status & Health" rendered', modalInfo.hasTitle));
  results.push(check('Overall Progress & percentage rendered', modalInfo.hasProgressText));
  results.push(check('Honest integrity badge rendered in modal', modalInfo.hasIntegrityPill));
  results.push(check('All 10 stage items rendered in modal grid', modalInfo.stageCount === 10));

  // Click Stage 8 (Transformation) to test jump navigation & modal closing
  await page.click('#pipeline-stage-transformation');
  await new Promise(r => setTimeout(r, 800));

  const afterJump = await page.evaluate(() => {
    const modal = document.getElementById('unified-project-status-modal');
    const activeTab = window.__uiStore ? window.__uiStore.getState().activeSidebarTab : null;
    return {
      modalClosed: !modal,
      activeTab: activeTab
    };
  });

  results.push(check('Clicking stage navigates tab and closes modal', afterJump.modalClosed && afterJump.activeTab === 'media-transform'));

  return results.every(Boolean);
}

// ─── Stage 4: Global Media Asset Library (AssetsPanel) ───────────────────────
async function verifyGlobalAssetsPanel(page) {
  console.log('\n[Stage 4: Global Media Asset Library & Filtering]');
  const results = [];

  // Switch to assets tab
  await page.evaluate(() => {
    if (window.__uiStore) window.__uiStore.getState().setActiveSidebarTab('assets');
  });
  await new Promise(r => setTimeout(r, 800));

  const assetsInfo = await page.evaluate(() => {
    const searchInput = document.getElementById('assets-search-input');
    const tabs = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());

    return {
      hasSearchInput: !!searchInput,
      hasAllTab: tabs.some(t => t.includes('All')),
      hasTransformedTab: tabs.some(t => t.includes('Transformed')),
      hasScenesTab: tabs.some(t => t.includes('AI Scenes')),
      hasVideoTab: tabs.some(t => t.includes('Video')),
      hasAudioTab: tabs.some(t => t.includes('Audio')),
      hasImagesTab: tabs.some(t => t.includes('Images')),
    };
  });

  results.push(check('Assets search input rendered', assetsInfo.hasSearchInput));
  results.push(check('"All" category tab rendered', assetsInfo.hasAllTab));
  results.push(check('"Transformed" category tab rendered', assetsInfo.hasTransformedTab));
  results.push(check('"AI Scenes" category tab rendered', assetsInfo.hasScenesTab));
  results.push(check('"Video" category tab rendered', assetsInfo.hasVideoTab));
  results.push(check('"Audio" category tab rendered', assetsInfo.hasAudioTab));
  results.push(check('"Images" category tab rendered', assetsInfo.hasImagesTab));

  return results.every(Boolean);
}

// ─── Stage 5: Project & Tab Persistence Across Page Reload ───────────────────
async function verifyProjectPersistence(page, projectId) {
  console.log('\n[Stage 5: Project & Tab Persistence Across Reload]');
  const results = [];

  // Set active project and tab in localStorage & stores
  await page.evaluate((pid) => {
    localStorage.setItem('tamil_ai_forge_active_project_id', pid);
    localStorage.setItem('tamil_ai_forge_active_sidebar_tab', 'production-studio');
  }, projectId);

  // Reload page
  console.log('  • Reloading page to test store restoration…');
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // Re-verify that stores restored the project and active tab
  const restoredState = await page.evaluate((pid) => {
    const activeProj = window.__projectStore ? window.__projectStore.getState().activeProject : null;
    const activeTab = window.__uiStore ? window.__uiStore.getState().activeSidebarTab : null;
    return {
      activeProjectId: activeProj ? activeProj.id : null,
      activeTab: activeTab,
      isRestored: activeProj && activeProj.id === pid,
    };
  }, projectId);

  results.push(check('Active project ID restored from localStorage', restoredState.isRestored, `id=${restoredState.activeProjectId}`));
  results.push(check('Active sidebar tab restored from localStorage', restoredState.activeTab === 'production-studio', `tab=${restoredState.activeTab}`));

  // In production studio, verify that Pipeline Status button is present in the header
  const hasProdStatusBtn = await page.evaluate(() => {
    return !!document.getElementById('production-unified-status-btn');
  });
  results.push(check('Production Studio header has "Pipeline Status" button', hasProdStatusBtn));

  return results.every(Boolean);
}

// ─── Stage 6: Idempotent Add-to-Timeline Verification ────────────────────────
async function verifyIdempotentAddToTimeline(projectId) {
  console.log('\n[Stage 6: Backend Idempotent Add-to-Timeline]');
  const results = [];

  try {
    // 1. Upload dummy asset
    const formData = new FormData();
    const blob = new Blob(['phase16_idem_test_bytes'], { type: 'image/png' });
    formData.append('file', blob, 'idem_test.png');
    formData.append('folder_path', '/Source Media');

    const upRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/assets/upload`, {
      method: 'POST',
      body: formData
    });
    const asset = await upRes.json();

    // 2. Create media transform job
    const tRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        mode: 'IMAGE_TO_3D_CARTOON',
        source_asset_id: asset.id,
        options: { style_preset: '3d_cartoon' }
      })
    });
    const job = await tRes.json();
    const jobId = job.job_id;

    // 3. Poll for completion
    let completed = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 150));
      const chk = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jobId}`);
      const chkData = await chk.json();
      if (chkData.status === 'completed') {
        completed = true;
        break;
      }
    }
    results.push(check('Transformation job reaches completed state', completed));

    // 4. First add-to-timeline call
    const add1 = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jobId}/add-to-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_role: 'v1_main' })
    });
    results.push(check('First add-to-timeline succeeds (200 OK)', add1.status === 200));
    const add1Data = await add1.json();
    const firstClipId = add1Data.clip_id;

    // 5. Second add-to-timeline call (must be idempotent!)
    const add2 = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jobId}/add-to-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_role: 'v1_main' })
    });
    results.push(check('Second add-to-timeline succeeds (200 OK)', add2.status === 200));
    const add2Data = await add2.json();

    results.push(check('Idempotent response returns identical clip_id', add2Data.clip_id === firstClipId));
    results.push(check('Idempotent response has is_existing flag = true', add2Data.is_existing === true));

    return results.every(Boolean);
  } catch (e) {
    results.push(check('Idempotent add-to-timeline threw exception', false, String(e)));
    return false;
  }
}

// ─── Stage 7: Responsive Viewport Matrix (8 Viewports) ───────────────────────
async function verifyResponsiveViewports(page) {
  console.log('\n[Stage 7: Responsive Viewport Matrix (8 Viewports)]');
  const results = [];

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 300));

    const checkResult = await page.evaluate((vpName, vpWidth) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const innerWidth = window.innerWidth;
      const hasOverflow = scrollWidth > innerWidth + 2;

      return {
        hasOverflow,
        scrollWidth,
        innerWidth,
        clientWidth
      };
    }, vp.name, vp.width);

    const ok = !checkResult.hasOverflow;
    results.push(check(
      `Viewport: ${vp.name.padEnd(20)} (0 horizontal overflow)`,
      ok,
      ok ? undefined : `scrollWidth=${checkResult.scrollWidth} > innerWidth=${checkResult.innerWidth}`
    ));
  }

  // Restore desktop viewport
  await page.setViewport({ width: 1920, height: 1080 });
  return results.every(Boolean);
}

// ─── Main Runner ─────────────────────────────────────────────────────────────
(async () => {
  console.log('================================================================');
  console.log(' TAMIL AI FORGE — PHASE 16 E2E VERIFICATION SUITE');
  console.log('================================================================');

  let browser;
  let exitCode = 0;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Track console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected favicon or non-fatal asset 404s if any
        if (!text.includes('favicon.ico')) {
          consoleErrors.push(text);
        }
      }
    });

    // Track page errors
    page.on('pageerror', err => {
      pageErrors.push(String(err));
    });

    // Track failed network requests
    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('favicon.ico')) {
        failedRequests.push(`${req.method()} ${url} -> ${req.failure()?.errorText || 'failed'}`);
      }
    });

    console.log('• Navigating to Tamil AI Forge at http://127.0.0.1:5173…');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    // STAGE 1: Setup
    const setup = await setupProjectWithMedia(page);
    if (!setup.ok) {
      throw new Error(`Failed to set up project: ${setup.error}`);
    }
    const projectId = setup.projectId;
    console.log(`  ✓ Active Project Created: "${setup.title}" (ID: ${projectId})`);

    // STAGE 2: Unified Status API
    const stage2Ok = await verifyUnifiedStatusAPI(projectId);
    if (!stage2Ok) exitCode = 1;

    // STAGE 3: Unified Status Modal
    const stage3Ok = await verifyUnifiedStatusModal(page);
    if (!stage3Ok) exitCode = 1;

    // STAGE 4: Global Assets Panel
    const stage4Ok = await verifyGlobalAssetsPanel(page);
    if (!stage4Ok) exitCode = 1;

    // STAGE 5: Project Persistence across reload
    const stage5Ok = await verifyProjectPersistence(page, projectId);
    if (!stage5Ok) exitCode = 1;

    // STAGE 6: Idempotent Add to Timeline
    const stage6Ok = await verifyIdempotentAddToTimeline(projectId);
    if (!stage6Ok) exitCode = 1;

    // STAGE 7: Responsive Viewports (8 viewports)
    const stage7Ok = await verifyResponsiveViewports(page);
    if (!stage7Ok) exitCode = 1;

    // STAGE 8: Quality Gates Summary
    console.log('\n[Stage 8: Quality Gates & Runtime Health]');
    const cOk = check('Zero browser console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
    const pOk = check('Zero unhandled page errors', pageErrors.length === 0, pageErrors.join(' | '));
    const rOk = check('Zero failed network requests', failedRequests.length === 0, failedRequests.join(' | '));

    if (!cOk || !pOk || !rOk) {
      exitCode = 1;
    }

  } catch (err) {
    console.error('\n✗ FATAL ERROR in Phase 16 Verification Suite:');
    console.error(err);
    exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n================================================================');
    if (exitCode === 0) {
      console.log(' 🎉 PHASE 16 E2E UX & PERSISTENCE VERIFICATION: 100% PASSED');
    } else {
      console.log(' ❌ PHASE 16 E2E UX & PERSISTENCE VERIFICATION: FAILED');
    }
    console.log('================================================================\n');
    process.exit(exitCode);
  }
})();
