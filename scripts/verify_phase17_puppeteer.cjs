'use strict';
// TAMIL AI FORGE — PHASE 17 FINAL PRODUCT POLISH & RELEASE READINESS SUITE
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
  console.log('\n[Stage 1: Phase 17 Project & Store Setup]');
  return await page.evaluate(async () => {
    try {
      const pRes = await fetch('http://127.0.0.1:8000/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Phase 17 Cinema Theatrical Release Master',
          description: 'Final release readiness, production polish, and end-to-end filmmaking verification'
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

// ─── Stage 2: Deep Duplication & FK Safe Delete ──────────────────────────────
async function verifyLifecycleHardening(projectId) {
  console.log('\n[Stage 2: Project Lifecycle Hardening (Duplicate & FK Delete)]');
  const results = [];

  try {
    // 1. Test deep duplication
    const dupRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/duplicate`, {
      method: 'POST'
    });
    results.push(check('POST /projects/{id}/duplicate succeeds (201 Created)', dupRes.status === 201));
    const dupProj = await dupRes.json();
    const dupId = dupProj.id;
    results.push(check('Duplicated project receives distinct ID', dupId !== projectId));
    results.push(check('Duplicated project title has "(Copy)" suffix', dupProj.title.includes('(Copy)')));

    // 2. Test FK-safe deletion on the duplicated project
    const delRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${dupId}`, {
      method: 'DELETE'
    });
    results.push(check('DELETE /projects/{dup_id} succeeds cleanly (204 No Content)', delRes.status === 204));

    // Confirm deletion
    const chkRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${dupId}`);
    results.push(check('Deleted project returns 404 Not Found', chkRes.status === 404));

    return results.every(Boolean);
  } catch (e) {
    results.push(check('Lifecycle hardening verification threw exception', false, String(e)));
    return false;
  }
}

// ─── Stage 3: Media Transformation & Idempotent Timeline Integration ─────────
async function verifyMediaTransformAndTimeline(projectId) {
  console.log('\n[Stage 3: Media Transformation & Idempotent Timeline]');
  const results = [];

  try {
    // 1. Upload test source image
    const formData = new FormData();
    const blob = new Blob(['phase17_source_asset_data'], { type: 'image/png' });
    formData.append('file', blob, 'phase17_hero.png');
    formData.append('folder_path', '/Source Media');

    const upRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/assets/upload`, {
      method: 'POST',
      body: formData
    });
    results.push(check('Upload source asset succeeds (201 Created)', [200, 201].includes(upRes.status)));
    const sourceAsset = await upRes.json();

    // 2. Create Media Transform Job
    const tRes = await fetch('http://127.0.0.1:8000/api/v1/ai/media-transform/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        mode: 'IMAGE_TO_3D_CARTOON',
        source_asset_id: sourceAsset.id,
        options: { style_preset: '3d_cartoon', style_strength: 0.85 }
      })
    });
    results.push(check('Create transform job succeeds (202 Accepted)', [200, 202].includes(tRes.status)));
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
    results.push(check('Transform job completes in background', completed));

    // 4. Add to timeline
    const add1 = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jobId}/add-to-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_role: 'v1_main' })
    });
    results.push(check('First add-to-timeline succeeds (200 OK)', add1.status === 200));
    const add1Data = await add1.json();

    // 5. Idempotent second add
    const add2 = await fetch(`http://127.0.0.1:8000/api/v1/ai/media-transform/${jobId}/add-to-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_role: 'v1_main' })
    });
    results.push(check('Duplicate add-to-timeline succeeds (200 OK)', add2.status === 200));
    const add2Data = await add2.json();
    results.push(check('Duplicate returns identical clip ID (no duplicate created)', add2Data.clip_id === add1Data.clip_id));
    results.push(check('Duplicate returns is_existing: true flag', add2Data.is_existing === true));

    return results.every(Boolean);
  } catch (e) {
    results.push(check('Media transform and timeline threw exception', false, String(e)));
    return false;
  }
}

// ─── Stage 4: Production Studio, Cinema Screening & Deliverables UI ──────────
async function verifyProductionCinemaDeliverablesUI(page) {
  console.log('\n[Stage 4: Production Studio, Cinema Screening Theater & Deliverables UI]');
  const results = [];

  // Switch to Production Studio tab
  await page.evaluate(() => {
    if (window.__uiStore) window.__uiStore.getState().setActiveSidebarTab('production-studio');
  });
  await new Promise(r => setTimeout(r, 1000));

  const uiChecks = await page.evaluate(() => {
    return {
      hasStudio: !!document.getElementById('production-studio'),
      hasProduceFullFilmBtn: !!document.getElementById('produce-full-film-btn'),
      hasGenerateScenesBtn: !!document.getElementById('generate-all-scenes-btn'),
      hasGenerateVoiceBtn: !!document.getElementById('generate-voice-btn'),
      hasGenerateMusicBtn: !!document.getElementById('generate-music-btn'),
      hasGenerateCaptionsBtn: !!document.getElementById('generate-captions-btn'),
      hasAssembleTimelineBtn: !!document.getElementById('assemble-timeline-btn'),
      hasRenderFilmBtn: !!document.getElementById('render-film-btn'),
      hasCinemaTheater: !!document.getElementById('cinema-screening-theater'),
      hasCinemaSpecs: !!document.getElementById('cinema-media-specs'),
      hasDeliverablesPanel: !!document.getElementById('film-deliverables-panel'),
      hasRefreshDeliverablesBtn: !!document.getElementById('refresh-deliverables-btn'),
      hasPipelineStatusBtn: !!document.getElementById('production-unified-status-btn'),
    };
  });

  results.push(check('Production Studio mounted (#production-studio)', uiChecks.hasStudio));
  results.push(check('Produce Full Film action button rendered', uiChecks.hasProduceFullFilmBtn));
  results.push(check('Generate All Scenes button rendered', uiChecks.hasGenerateScenesBtn));
  results.push(check('Generate Voice button rendered', uiChecks.hasGenerateVoiceBtn));
  results.push(check('Generate Music button rendered', uiChecks.hasGenerateMusicBtn));
  results.push(check('Generate Captions button rendered', uiChecks.hasGenerateCaptionsBtn));
  results.push(check('Assemble Timeline button rendered', uiChecks.hasAssembleTimelineBtn));
  results.push(check('Render Film action button rendered', uiChecks.hasRenderFilmBtn));
  results.push(check('Cinema Screening Theater container rendered', uiChecks.hasCinemaTheater));
  results.push(check('Cinema Media Specs probed pill rendered', uiChecks.hasCinemaSpecs));
  results.push(check('Film Deliverables Package panel rendered', uiChecks.hasDeliverablesPanel));
  results.push(check('Deliverables Refresh button rendered', uiChecks.hasRefreshDeliverablesBtn));
  results.push(check('Pipeline Status header button rendered', uiChecks.hasPipelineStatusBtn));

  return results.every(Boolean);
}

// ─── Stage 5: Unified Status Modal & Error Recovery Action ───────────────────
async function verifyUnifiedStatusModalAndRecovery(page) {
  console.log('\n[Stage 5: Unified Status Modal & Error Recovery Action]');
  const results = [];

  // Open modal
  await page.click('#production-unified-status-btn');
  await new Promise(r => setTimeout(r, 600));

  const modalChecks = await page.evaluate(() => {
    const modal = document.getElementById('unified-project-status-modal');
    if (!modal) return { hasModal: false };
    const text = modal.innerText;
    const stages = Array.from(modal.querySelectorAll('[id^="pipeline-stage-"]'));

    return {
      hasModal: true,
      stageCount: stages.length,
      hasHonestBadge: text.includes('OFFLINE DEMO MODE') && text.includes('NOT REAL-PROVIDER-VERIFIED'),
      hasTimelineStage: !!document.getElementById('pipeline-stage-timeline'),
      hasDeliverablesStage: !!document.getElementById('pipeline-stage-deliverables'),
    };
  });

  results.push(check('Unified Project Status Modal opened', modalChecks.hasModal));
  results.push(check('All 10 pipeline stages rendered in modal', modalChecks.stageCount === 10));
  results.push(check('Honest offline demo mode environment badge present', modalChecks.hasHonestBadge));
  results.push(check('Stage 7 (Timeline) rendered in grid', modalChecks.hasTimelineStage));
  results.push(check('Stage 10 (Deliverables) rendered in grid', modalChecks.hasDeliverablesStage));

  // Jump to Deliverables / Production Studio
  await page.click('#pipeline-stage-timeline');
  await new Promise(r => setTimeout(r, 600));

  const afterJump = await page.evaluate(() => {
    const modal = document.getElementById('unified-project-status-modal');
    const activeTab = window.__uiStore ? window.__uiStore.getState().activeSidebarTab : null;
    return { modalClosed: !modal, activeTab };
  });

  results.push(check('Stage click closed modal and switched to timeline tab', afterJump.modalClosed && (afterJump.activeTab === 'edit' || afterJump.activeTab === 'timeline')));

  return results.every(Boolean);
}

// ─── Stage 6: Project Persistence Across Page Reload ─────────────────────────
async function verifyPersistenceAcrossReload(page, projectId) {
  console.log('\n[Stage 6: Project & Workspace Reload Persistence]');
  const results = [];

  // Set active project & sidebar tab in localStorage
  await page.evaluate((pid) => {
    localStorage.setItem('tamil_ai_forge_active_project_id', pid);
    localStorage.setItem('tamil_ai_forge_active_sidebar_tab', 'production-studio');
  }, projectId);

  console.log('  • Reloading page to test store restoration…');
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  const restored = await page.evaluate((pid) => {
    const activeProj = window.__projectStore ? window.__projectStore.getState().activeProject : null;
    const activeTab = window.__uiStore ? window.__uiStore.getState().activeSidebarTab : null;
    return {
      activeId: activeProj ? activeProj.id : null,
      activeTab: activeTab,
      isRestored: activeProj && activeProj.id === pid,
    };
  }, projectId);

  results.push(check('Active Project restored from localStorage', restored.isRestored, `id=${restored.activeId}`));
  results.push(check('Active Sidebar Tab restored as "production-studio"', restored.activeTab === 'production-studio', `tab=${restored.activeTab}`));

  return results.every(Boolean);
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
      const innerWidth = window.innerWidth;
      const hasOverflow = scrollWidth > innerWidth + 2;

      return { hasOverflow, scrollWidth, innerWidth };
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
  console.log(' TAMIL AI FORGE — PHASE 17 RELEASE READINESS VERIFICATION SUITE');
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

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon.ico')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(String(err));
    });

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

    // STAGE 2: Lifecycle Hardening
    const stage2Ok = await verifyLifecycleHardening(projectId);
    if (!stage2Ok) exitCode = 1;

    // STAGE 3: Transform & Idempotent Timeline
    const stage3Ok = await verifyMediaTransformAndTimeline(projectId);
    if (!stage3Ok) exitCode = 1;

    // STAGE 4: Production Studio, Cinema Screening & Deliverables UI
    const stage4Ok = await verifyProductionCinemaDeliverablesUI(page);
    if (!stage4Ok) exitCode = 1;

    // STAGE 5: Status Modal & Recovery
    const stage5Ok = await verifyUnifiedStatusModalAndRecovery(page);
    if (!stage5Ok) exitCode = 1;

    // STAGE 6: Persistence across reload
    const stage6Ok = await verifyPersistenceAcrossReload(page, projectId);
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
    console.error('\n✗ FATAL ERROR in Phase 17 Verification Suite:');
    console.error(err);
    exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n================================================================');
    if (exitCode === 0) {
      console.log(' 🎉 PHASE 17 FINAL PRODUCT POLISH & RELEASE READINESS: 100% PASSED');
    } else {
      console.log(' ❌ PHASE 17 FINAL PRODUCT POLISH & RELEASE READINESS: FAILED');
    }
    console.log('================================================================\n');
    process.exit(exitCode);
  }
})();
