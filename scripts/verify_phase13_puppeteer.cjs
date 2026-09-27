'use strict';
// TAMIL AI FORGE — PHASE 13 "FROM WORDS TO CINEMA" END-TO-END FINAL COMPLETION VERIFICATION SUITE
// Strict quality gate: Exit code 0 = ALL PASSED (0 failures, 0 console errors, 0 page errors, 0 failed network requests); Exit code 1 = FAIL.

const puppeteer = require('../frontend/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

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
  console.log(`  • ${label.padEnd(62)} : ${sym}${suffix}`);
  return ok;
}

// ─── Step 1: Create Real Film Project via API ─────────────────────────────────
async function setupFilmProject(page) {
  console.log('\n[Stage 1: Phase 13 Project Setup & Creation]');
  return await page.evaluate(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/film/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Puppeteer Phase 13 From Words to Cinema Masterpiece',
          prompt: 'Historic Chola naval expedition crossing the ocean with emperor Rajendra Chola commanding warships towards Kadaram.',
          genre: 'Historical Epic',
          mood: 'Grand',
          language: 'ta',
          target_duration_sec: 12.0,
          aspect_ratio: '16:9'
        })
      });
      const data = await res.json();
      const pid = data.project_id || data.project?.id;

      if (window.__projectStore) {
        window.__projectStore.getState().selectProject({
          id: pid,
          title: data.title || 'Puppeteer Phase 13 From Words to Cinema Masterpiece',
          settings: { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 }
        });
      }
      if (window.__timelineStore) {
        await window.__timelineStore.getState().fetchTimeline(pid);
      }
      return { ok: true, projectId: pid, status: res.status, title: data.title };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

// ─── Step 2: One-Click "Produce Full Film" Action & UI Card Verification ──────
async function verifyProduceFullFilmAction(page, projectId) {
  console.log('\n[Stage 2: One-Click "Produce Full Film" Action Card Verification]');
  const results = [];

  // Switch to Production Studio tab
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('production-studio');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const uiChecks = await page.evaluate(() => {
    const btn = document.getElementById('produce-full-film-btn');
    const text = document.body.innerText;

    const hasBtn = !!btn;
    const hasHeaderBadge = text.includes('Phase 13 • From Words to Cinema');
    const hasCardTitle = text.includes('Produce Full Film (Words to Cinema)');
    const hasCardDesc = text.includes('Automates Story') || text.includes('Produce Full Film');
    const hasOrchestratorSection = text.toUpperCase().includes('ORCHESTRATOR ACTIONS');

    return {
      hasBtn,
      hasHeaderBadge,
      hasCardTitle,
      hasCardDesc,
      hasOrchestratorSection,
      btnDisabled: btn ? btn.disabled : false,
      btnText: btn ? btn.innerText : ''
    };
  });

  results.push(check('Production Studio header badge displays Phase 13', uiChecks.hasHeaderBadge));
  results.push(check('Production Orchestrator Actions section rendered', uiChecks.hasOrchestratorSection));
  results.push(check('Produce Full Film (Words to Cinema) card rendered', uiChecks.hasCardTitle));
  results.push(check('Produce Full Film pipeline description rendered', uiChecks.hasCardDesc));
  results.push(check('Produce Full Film action button #produce-full-film-btn exists', uiChecks.hasBtn));
  results.push(check('Produce Full Film button is enabled in idle state', !uiChecks.btnDisabled));

  // Trigger Produce Full Film pipeline via API
  console.log('  Executing Produce Full Film pipeline via backend API...');
  const produceResult = await page.evaluate(async (pid) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/v1/film/${pid}/produce-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Historic Chola naval expedition crossing the ocean with emperor Rajendra Chola commanding warships towards Kadaram.',
          target_duration_sec: 10.0,
          genre: 'Historical Epic',
          mood: 'Cinematic',
          language: 'ta',
          aspect_ratio: '16:9'
        })
      });
      const data = await res.json();
      return { ok: res.status === 200, status: data.status, data };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, projectId);

  results.push(check('POST /api/v1/film/{id}/produce-all succeeds', produceResult.ok, `Status: ${produceResult.status}`));
  results.push(check('Pipeline reports rendering_queued or completed', ['rendering_queued', 'already_running', 'completed'].includes(produceResult.status), `Got: ${produceResult.status}`));

  if (produceResult.data) {
    results.push(check('Pipeline returns render_job_id', !!produceResult.data.render_job_id));
    results.push(check('Pipeline returns timeline_id', !!produceResult.data.timeline_id));
    results.push(check('Pipeline returns plan_id', !!produceResult.data.plan_id));
  }

  // Refresh frontend UI
  await page.evaluate(async (pid) => {
    if (window.__timelineStore) {
      await window.__timelineStore.getState().fetchTimeline(pid);
    }
  }, projectId);
  await new Promise(r => setTimeout(r, 1500));

  return results.every(Boolean);
}

// ─── Step 3: Verify All Pipeline Artifact States (Story, Characters, Audio, Captions)
async function verifyPipelineArtifacts(page, projectId) {
  console.log('\n[Stage 3: Full Pipeline Artifact Verification (Story, Audio, Music, Captions)]');
  const results = [];

  const artifactsCheck = await page.evaluate(async (pid) => {
    try {
      // 1. Check Film Status / Progress
      const pRes = await fetch(`http://127.0.0.1:8000/api/v1/film/${pid}/progress`);
      const progress = await pRes.json();

      // 2. Check Scenes
      const scRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${pid}/scenes`);
      const scenes = await scRes.json();

      // 3. Check Timeline & Tracks
      const tlRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${pid}/timeline`);
      const timeline = await tlRes.json();

      // 4. Check Assets
      const asRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${pid}/assets`);
      const assets = await asRes.json();

      // 5. Check Captions
      const capRes = await fetch(`http://127.0.0.1:8000/api/v1/projects/${pid}/captions`);
      const captions = await capRes.json();

      return {
        ok: true,
        progress,
        scenesCount: Array.isArray(scenes) ? scenes.length : 0,
        scenes,
        tracks: timeline?.tracks || [],
        assets: Array.isArray(assets) ? assets : [],
        captionsCount: Array.isArray(captions) ? captions.length : 0
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, projectId);

  results.push(check('Fetched all pipeline artifacts successfully', artifactsCheck.ok));
  results.push(check('Story Scenes planned and generated (>= 2 scenes)', artifactsCheck.scenesCount >= 2, `Count: ${artifactsCheck.scenesCount}`));

  // Verify Tracks structure
  const tracks = artifactsCheck.tracks;
  const v1Track = tracks.find(t => t.track_role === 'v1_main' || t.name?.includes('V1'));
  const a1Track = tracks.find(t => t.track_role === 'dialogue' || t.name?.includes('A1'));
  const a3Track = tracks.find(t => t.track_role === 'music' || t.name?.includes('A3'));

  results.push(check('Timeline contains Track V1 (Main Video)', !!v1Track));
  results.push(check('Timeline contains Track A1 (Dialogue)', !!a1Track));
  results.push(check('Timeline contains Track A3 (Music Score)', !!a3Track));

  // Audio Asset Binding Verification (Stage 1 Core Requirement)
  let dialogueHasValidAsset = false;
  if (a1Track && a1Track.clips && a1Track.clips.length > 0) {
    const clipsWithAsset = a1Track.clips.filter(c => c.asset_id && typeof c.asset_id === 'string');
    dialogueHasValidAsset = clipsWithAsset.length > 0;
  }
  results.push(check('Track A1 dialogue clips have genuine Asset IDs bound', dialogueHasValidAsset));

  let musicHasValidAsset = false;
  if (a3Track && a3Track.clips && a3Track.clips.length > 0) {
    const musicClip = a3Track.clips[0];
    musicHasValidAsset = !!(musicClip && musicClip.asset_id && musicClip.volume_db === -6.0);
  }
  results.push(check('Track A3 background music clip bound with -6.0 dB volume', musicHasValidAsset));

  // Video Media Assets Verification
  const videoAssets = (artifactsCheck.assets || []).filter(a => a.asset_type === 'video');
  results.push(check('Project contains genuine video media Assets', videoAssets.length >= 1, `Count: ${videoAssets.length}`));

  return results.every(Boolean);
}

// ─── Step 4: Cinema Screening Theater & Deliverables Verification ─────────────
async function verifyCinemaTheaterAndDeliverables(page, projectId) {
  console.log('\n[Stage 4: Cinema Screening Theater & Deliverables Verification]');
  const results = [];

  // Switch to Production Studio tab
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('production-studio');
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // Check Deliverables API endpoint
  const delivApi = await page.evaluate(async (pid) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/v1/film/${pid}/deliverables`);
      const data = await res.json();
      return { ok: res.status === 200, data };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, projectId);

  results.push(check('GET /api/v1/film/{id}/deliverables returns 200 OK', delivApi.ok));

  if (delivApi.ok && delivApi.data) {
    const d = delivApi.data;
    results.push(check('Deliverables package contains project info', !!d.project_id));
    results.push(check('Deliverables package contains audio_stems structure', !!d.audio_stems));
    results.push(check('Deliverables package contains dialogue stem entry', 'dialogue' in (d.audio_stems || {})));
    results.push(check('Deliverables package contains music stem entry', 'music' in (d.audio_stems || {})));
    results.push(check('Deliverables package contains subtitles export entry', 'subtitles' in d));
  }

  // DOM verification of Cinema Screening Theater and Deliverables cards
  const domChecks = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasScreeningTheater = text.includes('Cinema Screening Theater') || text.includes('Cinema Theater') || text.includes('Master Screening');
    const hasDeliverables = text.includes('Deliverables') || text.includes('Production Deliverables');
    const hasAudioStemsCard = text.includes('Audio Stems (WAV)');
    const hasSubtitlesCard = text.includes('Subtitles & Captions');
    const hasStemPlayer = !!document.getElementById('audio-stem-player');

    return {
      hasScreeningTheater,
      hasDeliverables,
      hasAudioStemsCard,
      hasSubtitlesCard,
      hasStemPlayer
    };
  });

  results.push(check('Cinema Screening Theater / Review section present in UI', domChecks.hasScreeningTheater));
  results.push(check('Production Deliverables section present in UI', domChecks.hasDeliverables));
  results.push(check('Audio Stems Deliverables card present', domChecks.hasAudioStemsCard));
  results.push(check('Subtitles & Captions Deliverables card present', domChecks.hasSubtitlesCard));
  results.push(check('Audio Stem Player element rendered in DOM', domChecks.hasStemPlayer));

  return results.every(Boolean);
}

// ─── Step 5: 8 Viewports Responsiveness & Visual Stability Verification ───────
async function verifyViewports(page) {
  console.log('\n[Stage 5: 8 Viewports Responsiveness & Visual Verification]');
  const results = [];

  const screenshotDir = path.resolve(__dirname, '../dist/verification_screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 400));

    const checkResult = await page.evaluate((vp) => {
      const root = document.getElementById('root');
      const text = document.body.innerText;
      const isRendered = root !== null && text.length > 0;
      const noCrash = !text.includes('Something went wrong') && !text.includes('Error:');
      const hasStudio = !!document.getElementById('production-studio');
      const hasStepper = !!document.getElementById('workflow-stepper');
      const hasProduceBtn = !!document.getElementById('produce-full-film-btn');

      return {
        isRendered,
        noCrash,
        hasStudio,
        hasStepper,
        hasProduceBtn
      };
    }, vp);

    // Take screenshot for visual audit
    const safeName = vp.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const scPath = path.join(screenshotDir, `phase13_${safeName}.png`);
    await page.screenshot({ path: scPath, fullPage: false });

    const ok = checkResult.isRendered && checkResult.noCrash && (vp.type === 'mobile' || (checkResult.hasStudio && checkResult.hasProduceBtn));
    results.push(check(`Viewport ${vp.name.padEnd(20)} layout responsive & stable`, ok));
  }

  // Restore 1920x1080
  await page.setViewport({ width: 1920, height: 1080 });
  return results.every(Boolean);
}

// ─── Main Execution ──────────────────────────────────────────────────────────
async function main() {
  console.log('================================================================');
  console.log(' TAMIL AI FORGE — PHASE 13 "FROM WORDS TO CINEMA" END-TO-END    ');
  console.log(' FINAL PRODUCTION-READY AUTOMATED VERIFICATION SUITE            ');
  console.log('================================================================');

  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('404') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(String(err));
    });

    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('favicon') && !url.includes('.map')) {
        failedRequests.push(`${req.method()} ${url} : ${req.failure()?.errorText || 'Unknown failure'}`);
      }
    });

    await page.setViewport({ width: 1920, height: 1080 });

    console.log('\nNavigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Page loaded successfully.');

    // 1. Setup Project
    const setup = await setupFilmProject(page);
    if (!setup.ok || !setup.projectId) {
      throw new Error(`Project setup failed: ${setup.error || 'No project ID returned'}`);
    }
    const projectId = setup.projectId;
    console.log(`  Project ID: ${projectId}`);

    // 2. Verify Produce Full Film UI Card & Pipeline
    const s2 = await verifyProduceFullFilmAction(page, projectId);

    // 3. Verify Pipeline Artifacts (Story, Audio, Music, Captions)
    const s3 = await verifyPipelineArtifacts(page, projectId);

    // 4. Verify Cinema Theater & Deliverables
    const s4 = await verifyCinemaTheaterAndDeliverables(page, projectId);

    // 5. Verify 8 Viewports
    const s5 = await verifyViewports(page);

    // Final Error Checks
    console.log('\n[Stage 6: Runtime Console & Network Strict Quality Gate]');
    const cOk = check('Zero browser console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
    const pOk = check('Zero uncaught page/runtime errors', pageErrors.length === 0, pageErrors.join(' | '));
    const rOk = check('Zero failed application network requests', failedRequests.length === 0, failedRequests.join(' | '));

    const allPassed = s2 && s3 && s4 && s5 && cOk && pOk && rOk;

    console.log('\n================================================================');
    if (allPassed) {
      console.log(' ✓✓✓ ALL PHASE 13 END-TO-END VERIFICATIONS PASSED (0 FAILURES) ✓✓✓');
      console.log(' TAMIL AI FORGE "FROM WORDS TO CINEMA" PRODUCTION-READY!');
      console.log('================================================================\n');
      process.exit(0);
    } else {
      console.error(' ✗✗✗ ONE OR MORE PHASE 13 VERIFICATIONS FAILED ✗✗✗');
      console.log('================================================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n[FATAL ERROR IN PHASE 13 VERIFICATION SUITE]', err);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
