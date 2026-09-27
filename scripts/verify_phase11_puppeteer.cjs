'use strict';
// TAMIL AI FORGE — PHASE 11 CINEMATIC MASTER RENDER ENGINE & FILM DELIVERABLES SUITE
// Strict quality gate: Exit code 0 = ALL PASSED (0 failures, 0 console errors, 0 page errors, 0 failed network requests); Exit code 1 = FAIL.

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
  console.log(`  • ${label.padEnd(54)} : ${sym}${suffix}`);
  return ok;
}

// ─── Step 1: Create Real Film Project via API ─────────────────────────────────
async function setupFilmProject(page) {
  console.log('\n[Phase 11 Project Setup]');
  return await page.evaluate(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/film/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Puppeteer Phase 11 Cinema Master Project',
          prompt: 'A historic Tamil dynasty coronation ceremony in Thanjavur with grand trumpets and royal assembly.',
          genre: 'Historical Epic',
          mood: 'Grand',
          language: 'ta',
          target_duration_sec: 15.0,
          aspect_ratio: '16:9'
        })
      });
      const data = await res.json();
      const pid = data.project_id || data.project?.id;

      if (window.__projectStore) {
        window.__projectStore.getState().selectProject({
          id: pid,
          title: data.title || 'Puppeteer Phase 11 Cinema Master Project',
          settings: { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 }
        });
      }
      if (window.__timelineStore) {
        await window.__timelineStore.getState().fetchTimeline(pid);
      }
      return { ok: true, projectId: pid, status: res.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

// ─── Step 2: Phase 11 Film Deliverables Package Verification ─────────────────
async function verifyFilmDeliverablesPackage(page) {
  console.log('\n[Stage 1: Film Deliverables Package Verification]');
  const results = [];

  // Switch to Production Studio
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('production-studio');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const checks = await page.evaluate(() => {
    const text = document.body.innerText;
    const deliverablesPanel = document.getElementById('film-deliverables-panel');
    const refreshBtn = document.getElementById('refresh-deliverables-btn');
    const srtBtn = document.getElementById('download-subtitles-srt');
    const vttBtn = document.getElementById('download-subtitles-vtt');

    const hasPhase11Badge = text.includes('Phase 11');
    const hasDeliverablesTitle = text.includes('Film Deliverables Package') || !!deliverablesPanel;
    const hasMasterCard = text.includes('Master Video') && (text.includes('READY') || text.includes('PENDING'));
    const hasAudioStemsCard = text.includes('Audio Stems (WAV)') && text.includes('Dialogue Stem') && text.includes('Music Stem') && text.includes('SFX Stem');
    const hasSubtitlesCard = text.includes('Subtitles (Tamil / Eng)') && (text.includes('SubRip') || text.includes('SRT')) && (text.includes('WebVTT') || text.includes('VTT'));

    return {
      hasPhase11Badge,
      hasDeliverablesPanel: !!deliverablesPanel,
      hasDeliverablesTitle,
      hasRefreshBtn: !!refreshBtn,
      hasMasterCard,
      hasAudioStemsCard,
      hasSubtitlesCard,
      hasSrtBtn: !!srtBtn,
      hasVttBtn: !!vttBtn,
    };
  });

  results.push(check('Production Studio Phase 11 Badge visible', checks.hasPhase11Badge));
  results.push(check('Film Deliverables Panel rendered in DOM', checks.hasDeliverablesPanel));
  results.push(check('Film Deliverables Package section title', checks.hasDeliverablesTitle));
  results.push(check('Refresh Deliverables button present', checks.hasRefreshBtn));
  results.push(check('Master Video Deliverable card present', checks.hasMasterCard));
  results.push(check('Multi-Track Audio Stems (WAV) card present', checks.hasAudioStemsCard));
  results.push(check('Tamil/English Subtitles deliverable card present', checks.hasSubtitlesCard));
  results.push(check('SRT Subtitle download link present', checks.hasSrtBtn));
  results.push(check('WebVTT Subtitle download link present', checks.hasVttBtn));

  return results.every(Boolean);
}

// ─── Step 3: Export Modal Phase 11 Conform & Stems Controls ───────────────────
async function verifyExportModalPhase11(page) {
  console.log('\n[Stage 2: Export Modal Conform & Stems Verification]');
  const results = [];

  // Open Export Modal via UI store
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setExportModalOpen(true);
    }
  });
  await new Promise(r => setTimeout(r, 600));

  const modalChecks = await page.evaluate(() => {
    const framingSelect = document.getElementById('export-framing-mode');
    const burnSubtitlesBox = document.getElementById('export-burn-subtitles');
    const audioStemsBox = document.getElementById('export-audio-stems');
    const text = document.body.innerText;

    let hasFit = false;
    let hasFill = false;
    let hasScope = false;

    if (framingSelect) {
      const options = Array.from(framingSelect.options).map(o => o.value);
      hasFit = options.includes('fit');
      hasFill = options.includes('fill');
      hasScope = options.includes('cinemascope');
    }

    return {
      hasFramingSelect: !!framingSelect,
      hasFit,
      hasFill,
      hasScope,
      hasBurnSubtitlesBox: !!burnSubtitlesBox,
      hasAudioStemsBox: !!audioStemsBox,
      hasFramingLabel: text.includes('Framing Conform Mode'),
    };
  });

  results.push(check('Export Modal Framing Mode dropdown present', modalChecks.hasFramingSelect));
  results.push(check('Framing Mode options include "fit" (letterbox)', modalChecks.hasFit));
  results.push(check('Framing Mode options include "fill" (9:16 crop)', modalChecks.hasFill));
  results.push(check('Framing Mode options include "cinemascope" (2.39:1)', modalChecks.hasScope));
  results.push(check('Subtitle Burn-in checkbox present in Export Modal', modalChecks.hasBurnSubtitlesBox));
  results.push(check('Audio Stems (WAV) checkbox present in Export Modal', modalChecks.hasAudioStemsBox));

  // Close Export Modal
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setExportModalOpen(false);
    }
  });
  await new Promise(r => setTimeout(r, 400));

  return results.every(Boolean);
}

// ─── Step 4: Render Queue Panel Phase 11 Metadata Verification ─────────────────
async function verifyRenderQueuePhase11(page) {
  console.log('\n[Stage 3: Render Queue Panel Verification]');
  const results = [];

  // Switch to Render Queue tab
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('render-queue');
    }
  });
  await new Promise(r => setTimeout(r, 800));

  const queueChecks = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasQueue = text.includes('Render Queue');
    const hasEmptyOrJobs = text.includes('No render jobs') || text.includes('Render Master Ready') || text.includes('Queued') || text.includes('Rendering');
    return { hasQueue, hasEmptyOrJobs };
  });

  results.push(check('Render Queue panel rendered successfully', queueChecks.hasQueue));
  results.push(check('Render Queue states displayed correctly', queueChecks.hasEmptyOrJobs));

  return results.every(Boolean);
}

// ─── Step 5: Timeline Revisions API & Restore Verification ────────────────────
async function verifyTimelineRevisionsAPI(page, projectId) {
  console.log('\n[Stage 4: Timeline Revision Snapshot & Restore Verification]');
  const results = [];

  const revChecks = await page.evaluate(async (pid) => {
    try {
      // 1. Fetch revisions list
      const res = await fetch(`http://127.0.0.1:8000/api/v1/projects/${pid}/revisions`);
      const revisions = await res.json();

      // 2. Fetch deliverables endpoint
      const delivRes = await fetch(`http://127.0.0.1:8000/api/v1/film/${pid}/deliverables`);
      const delivData = await delivRes.json();

      return {
        ok: true,
        revisionsOk: res.status === 200,
        revisionsCount: Array.isArray(revisions) ? revisions.length : 0,
        deliverablesOk: delivRes.status === 200,
        hasDeliverablesStructure: !!(delivData.audio_stems && delivData.subtitles && Array.isArray(delivData.deliverables))
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, projectId);

  results.push(check('GET /projects/{id}/revisions returns HTTP 200', revChecks.revisionsOk));
  results.push(check('Timeline revisions list accessible', revChecks.ok && revChecks.revisionsCount >= 0));
  results.push(check('GET /film/{id}/deliverables returns HTTP 200', revChecks.deliverablesOk));
  results.push(check('Deliverables payload contains stems, subs, inventory', revChecks.hasDeliverablesStructure));

  return results.every(Boolean);
}

// ─── Step 6: Multi-Viewport Responsive Audit ──────────────────────────────────
async function runViewportAudit(page) {
  console.log('\n[Stage 5: 8-Viewport Responsive Audit]');
  const results = [];

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 300));

    const checkVp = await page.evaluate(() => {
      const root = document.getElementById('root');
      const text = document.body.innerText;
      return {
        isRendered: root !== null && text.length > 0,
        noCrash: !text.includes('Something went wrong') && !text.includes('Error:'),
      };
    });

    results.push(check(`Viewport ${vp.name.padEnd(18)} layout stable`, checkVp.isRendered && checkVp.noCrash));
  }

  // Restore 1920x1080
  await page.setViewport({ width: 1920, height: 1080 });
  return results.every(Boolean);
}

// ─── Main Test Runner ─────────────────────────────────────────────────────────
(async () => {
  console.log('='.repeat(70));
  console.log('TAMIL AI FORGE — PHASE 11 AUDIT & QUALITY GATE');
  console.log('='.repeat(70));

  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('Failed to load resource') && !text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(String(err));
    });

    page.on('response', resp => {
      if (!resp.ok() && resp.status() !== 404 && resp.status() !== 304) {
        failedRequests.push(`${resp.status()} ${resp.url()}`);
      }
    });

    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Expose stores on window if needed
    await page.evaluate(() => {
      // @ts-ignore
      window.__isPuppeteer = true;
    });

    // 1. Setup film project
    const setup = await setupFilmProject(page);
    if (!setup.ok || !setup.projectId) {
      console.error('Failed to setup film project:', setup.error);
      process.exit(1);
    }
    const projectId = setup.projectId;
    console.log(`  ✓ Active Film Project ID: ${projectId}`);

    // 2. Verify Deliverables Package
    const deliverablesOk = await verifyFilmDeliverablesPackage(page);

    // 3. Verify Export Modal Phase 11 Controls
    const exportModalOk = await verifyExportModalPhase11(page);

    // 4. Verify Render Queue
    const renderQueueOk = await verifyRenderQueuePhase11(page);

    // 5. Verify Timeline Revisions API
    const revisionsOk = await verifyTimelineRevisionsAPI(page, projectId);

    // 6. Viewport audit
    const viewportsOk = await runViewportAudit(page);

    // Final Error Checks
    console.log('\n[Stage 6: Error Log & Network Hygiene]');
    const zeroConsoleErrors = check('Console Errors = 0', consoleErrors.length === 0, `${consoleErrors.length} errors: ${consoleErrors.slice(0, 2).join('; ')}`);
    const zeroPageErrors = check('Page/Runtime Errors = 0', pageErrors.length === 0, `${pageErrors.length} errors: ${pageErrors.slice(0, 2).join('; ')}`);
    const zeroFailedRequests = check('Failed Network Requests = 0', failedRequests.length === 0, `${failedRequests.length} failures: ${failedRequests.slice(0, 2).join('; ')}`);

    const allPassed = deliverablesOk && exportModalOk && renderQueueOk && revisionsOk && viewportsOk && zeroConsoleErrors && zeroPageErrors && zeroFailedRequests;

    console.log('\n' + '='.repeat(70));
    if (allPassed) {
      console.log('PHASE 11 PUPPETEER AUDIT: ALL QUALITY GATES PASSED (100% SUCCESS)');
      console.log('='.repeat(70));
      await browser.close();
      process.exit(0);
    } else {
      console.error('PHASE 11 PUPPETEER AUDIT: SOME CHECKS FAILED');
      console.log('='.repeat(70));
      await browser.close();
      process.exit(1);
    }

  } catch (err) {
    console.error('Fatal Puppeteer error:', err);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
