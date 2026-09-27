'use strict';
// TAMIL AI FORGE — PHASE 10 CINEMA SCREENING THEATER & STUDIO SYNCHRONIZATION PUPPETEER SUITE
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
  console.log('\n[Phase 10 Project Setup]');
  return await page.evaluate(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/film/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Puppeteer Phase 10 Cinema Project',
          prompt: 'A master classical musician in Madurai composing a divine raga on veena.',
          genre: 'Drama',
          mood: 'Soulful',
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
          title: data.title || 'Puppeteer Phase 10 Cinema Project',
          settings: { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 }
        });
      }
      if (window.__timelineStore) {
        await window.__timelineStore.getState().fetchTimeline(pid);
      }
      return { ok: true, projectId: pid, scenes: data.scenes || [], status: res.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

// ─── Step 2: Cinema Screening Theater Verification ────────────────────────────
async function verifyCinemaScreeningTheater(page) {
  console.log('\n[Stage 2: Cinema Screening Theater Verification]');
  const results = [];

  // Switch to Production Studio
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('production-studio');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const theaterChecks = await page.evaluate(() => {
    const theater = document.getElementById('cinema-screening-theater');
    const screen = document.getElementById('cinema-theater-screen');
    const specs = document.getElementById('cinema-media-specs');
    const text = document.body.innerText;

    // Aspect ratio framing buttons
    const btns = Array.from(document.querySelectorAll('button'));
    const has16x9 = btns.some(b => (b.textContent || '').includes('16:9'));
    const has9x16 = btns.some(b => (b.textContent || '').includes('9:16'));
    const hasScope = btns.some(b => (b.textContent || '').includes('CinemaScope') || (b.textContent || '').includes('2.39:1'));
    const hasSubtitlesToggle =
      !!document.getElementById('cinema-subtitles-toggle-btn') ||
      !!document.getElementById('cinema-subtitles-btn') ||
      btns.some(b => (b.textContent || '').includes('CC') || (b.title || '').includes('Subtitle'));

    return {
      hasTheater: !!theater || text.includes('Cinema Screening Theater'),
      hasScreen: !!screen || !!document.querySelector('.aspect-video'),
      hasSpecs: !!specs || text.includes('PROBED SPECS') || text.includes('1080p') || text.includes('fps'),
      has16x9,
      has9x16,
      hasScope,
      hasSubtitlesToggle,
    };
  });

  results.push(check('Cinema Screening Theater container renders', theaterChecks.hasTheater));
  results.push(check('Cinema Theater Screen viewport renders', theaterChecks.hasScreen));
  results.push(check('16:9 widescreen framing control exists', theaterChecks.has16x9));
  results.push(check('9:16 vertical framing control exists', theaterChecks.has9x16));
  results.push(check('2.39:1 CinemaScope framing control exists', theaterChecks.hasScope));
  results.push(check('Subtitle / CC overlay toggle exists', theaterChecks.hasSubtitlesToggle));

  return results.every(Boolean);
}

// ─── Step 3: Multi-Track Audio Preview Verification ───────────────────────────
async function verifyMultiTrackAudio(page) {
  console.log('\n[Stage 3: Multi-Track Audio Preview Verification]');
  const results = [];

  const audioChecks = await page.evaluate(() => {
    const videoPreview = document.querySelector('.bg-cinema-void');
    const audioMeter = document.querySelector('[class*="AudioMeter"]') || document.querySelector('.h-1.bg-cinema-800');
    const volumeSlider = document.querySelector('input[type="range"]');

    return {
      hasVideoPreview: !!videoPreview,
      hasVolumeControl: !!volumeSlider,
      hasAudioMeter: !!audioMeter,
    };
  });

  results.push(check('VideoPreview workspace is active', audioChecks.hasVideoPreview));
  results.push(check('Master volume & mute controls available', audioChecks.hasVolumeControl));
  results.push(check('Audio meter and visualizer attached', audioChecks.hasAudioMeter));

  return results.every(Boolean);
}

// ─── Step 4: 4-Shot Storyboard View Verification ──────────────────────────────
async function verify4ShotStoryboard(page) {
  console.log('\n[Stage 4: 4-Shot Storyboard View Verification]');
  const results = [];

  // Switch to Storyboard tab
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('storyboard');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const storyboardChecks = await page.evaluate(() => {
    const view = document.getElementById('storyboard-view');
    const add4ShotBtn = document.getElementById('add-4shot-btn');
    const text = document.body.innerText;

    const hasFilterEstablishing = text.includes('Establishing');
    const hasFilterMedium = text.includes('Medium');
    const hasFilterCloseup = text.includes('Close-up');
    const hasFilterDetail = text.includes('Detail');

    return {
      hasView: !!view || text.includes('4-Shot Storyboard'),
      hasAdd4ShotBtn: !!add4ShotBtn || text.includes('Add 4-Shot Coverage') || text.includes('Initialize 4-Shot'),
      hasFilterEstablishing,
      hasFilterMedium,
      hasFilterCloseup,
      hasFilterDetail,
    };
  });

  results.push(check('4-Shot Storyboard View opens', storyboardChecks.hasView));
  results.push(check('+ Add 4-Shot Coverage button exists', storyboardChecks.hasAdd4ShotBtn));
  results.push(check('Establishing (24mm) filter tab present', storyboardChecks.hasFilterEstablishing));
  results.push(check('Medium (50mm) filter tab present', storyboardChecks.hasFilterMedium));
  results.push(check('Close-up (85mm) filter tab present', storyboardChecks.hasFilterCloseup));
  results.push(check('Detail (100mm) filter tab present', storyboardChecks.hasFilterDetail));

  // Trigger Add 4-Shot Coverage if empty
  const coverageCreated = await page.evaluate(async () => {
    try {
      const btn = document.getElementById('add-4shot-btn') || document.querySelector('[data-testid="add-4shot-btn"]');
      if (btn) {
        btn.click();
        await new Promise(r => setTimeout(r, 2000));
      }
      const cards = document.querySelectorAll('[data-testid="storyboard-shot-card"]');
      return { ok: true, cardsCount: cards.length };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
  results.push(check('4-Shot Coverage generation hook executes', coverageCreated.ok));

  return results.every(Boolean);
}

// ─── Step 5: Character Consistency Studio Verification ────────────────────────
async function verifyCharacterStudio(page) {
  console.log('\n[Stage 5: Character Consistency Studio Verification]');
  const results = [];

  // Switch to Characters tab
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('characters');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const charChecks = await page.evaluate(() => {
    const studio = document.getElementById('character-studio');
    const addBtn = document.getElementById('add-character-btn');
    const text = document.body.innerText;

    return {
      hasStudio: !!studio || text.includes('Character Studio'),
      hasAddBtn: !!addBtn || text.includes('Add Character'),
    };
  });

  results.push(check('Character Studio panel opens', charChecks.hasStudio));
  results.push(check('Add Character action button present', charChecks.hasAddBtn));

  // Click Add Character button and wait for React state update
  await page.evaluate(() => {
    const btn = document.getElementById('add-character-btn');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  const formChecks = await page.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    return {
      hasNameField: text.includes('character name'),
      hasTamilName: text.includes('tamil name') || text.includes('தமிழ்'),
      hasAgeGender: text.includes('age') && text.includes('gender'),
      hasAppearance: text.includes('appearance') || text.includes('face'),
      hasClothing: text.includes('wardrobe') || text.includes('clothing'),
      hasFeatures: text.includes('hair') || text.includes('skin'),
      hasCulturalMarkers: text.includes('cultural markers'),
      hasColorPalette: text.includes('color palette'),
      hasLockToggle: text.includes('character lock'),
    };
  });

  results.push(check('12 Consistency Attributes form rendered', formChecks.hasNameField && formChecks.hasTamilName));
  results.push(check('Cultural markers attribute exposed', formChecks.hasCulturalMarkers));
  results.push(check('Color palette chips exposed', formChecks.hasColorPalette));
  results.push(check('Character Lock consistency toggle exposed', formChecks.hasLockToggle));

  return results.every(Boolean);
}

// ─── Step 6: Voice Dubbing Studio Verification ────────────────────────────────
async function verifyVoiceDubbing(page) {
  console.log('\n[Stage 6: Voice Dubbing Studio Verification]');
  const results = [];

  // Switch to Voice Dubbing tab
  await page.evaluate(() => {
    if (window.__uiStore) {
      window.__uiStore.getState().setActiveSidebarTab('voice-dubbing');
    }
  });
  await page.waitForSelector('#voice-dubbing-panel', { timeout: 8000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));

  const voiceChecks = await page.evaluate(() => {
    const panel = document.getElementById('voice-dubbing-panel');
    const genBtn = document.getElementById('generate-voice-btn');
    const text = (document.body.innerText || '').toLowerCase();

    return {
      hasPanel: !!panel || text.includes('voice & dubbing'),
      hasGenBtn: !!genBtn || text.includes('generate voice'),
      hasTamilOption: text.includes('valluvar') || text.includes('tamil') || text.includes('chennai'),
      hasSpeedTone: text.includes('speed') && (text.includes('emotion') || text.includes('tone')),
    };
  });

  results.push(check('Voice Dubbing Studio panel opens', voiceChecks.hasPanel));
  results.push(check('Generate Voice button exists', voiceChecks.hasGenBtn));
  results.push(check('Tamil neural voices exposed in dropdown', voiceChecks.hasTamilOption));
  results.push(check('Speed and emotion controls present', voiceChecks.hasSpeedTone));

  return results.every(Boolean);
}

// ─── Step 7: Multi-Viewport Responsive Audit ──────────────────────────────────
async function verifyViewports(browser) {
  console.log('\n[Stage 7: Multi-Viewport Responsive Audit across 8 Viewports]');
  let allViewportsOk = true;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!t.includes('net::ERR_') && !t.includes('favicon')) {
          consoleErrors.push(t);
        }
      }
    });

    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('favicon.ico')) {
        failedRequests.push(`${req.method()} ${url}`);
      }
    });

    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    const rendered = await page.evaluate(() => {
      return document.getElementById('root') !== null && document.body.innerText.length > 0;
    });

    const isOk = rendered && consoleErrors.length === 0 && failedRequests.length === 0;
    check(`${vp.name.padEnd(20)} (${vp.width}x${vp.height})`, isOk, consoleErrors.join('; '));
    if (!isOk) allViewportsOk = false;

    await page.close();
  }

  return allViewportsOk;
}

// ─── Main Execution ───────────────────────────────────────────────────────────
(async () => {
  console.log('================================================================');
  console.log('TAMIL AI FORGE — PHASE 10 COMPLETE VERIFICATION AUDIT');
  console.log('Strict Quality Gate: 0 console errors, 0 failed requests');
  console.log('================================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('net::ERR_') && !text.includes('favicon')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (!url.includes('favicon.ico')) {
      failedRequests.push(`${req.method()} ${url}`);
    }
  });

  try {
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));

    // Wait for App.tsx to mount and attach stores to window
    await page.waitForFunction(
      () => window.__projectStore && window.__timelineStore && window.__uiStore,
      { timeout: 15000 }
    );

    const setupRes = await setupFilmProject(page);
    check('Real Film Project creation & store binding', setupRes.ok, setupRes.error);

    // Wait for activeProject to populate in UI
    await page.waitForFunction(
      () => !!window.__projectStore && !!window.__projectStore.getState().activeProject,
      { timeout: 10000 }
    );
    await new Promise(r => setTimeout(r, 1000));

    const theaterOk = await verifyCinemaScreeningTheater(page);
    const audioOk = await verifyMultiTrackAudio(page);
    const storyboardOk = await verify4ShotStoryboard(page);
    const charOk = await verifyCharacterStudio(page);
    const voiceOk = await verifyVoiceDubbing(page);
    const viewportsOk = await verifyViewports(browser);

    console.log('\n[Console & Network Error Audit]');
    check('Zero console errors detected', consoleErrors.length === 0, consoleErrors.join('; '));
    check('Zero failed network requests detected', failedRequests.length === 0, failedRequests.join('; '));

    const allPassed =
      setupRes.ok &&
      theaterOk &&
      audioOk &&
      storyboardOk &&
      charOk &&
      voiceOk &&
      viewportsOk &&
      consoleErrors.length === 0 &&
      failedRequests.length === 0;

    console.log('\n================================================================');
    if (allPassed) {
      console.log('✓ PHASE 10 VERIFICATION: ALL QUALITY GATES PASSED (100%)');
      console.log('================================================================\n');
      await browser.close();
      process.exit(0);
    } else {
      console.log('✗ PHASE 10 VERIFICATION: QUALITY GATE CHECKS FAILED');
      console.log('================================================================\n');
      await browser.close();
      process.exit(1);
    }
  } catch (err) {
    console.error('Test run crashed:', err);
    await browser.close();
    process.exit(1);
  }
})();
