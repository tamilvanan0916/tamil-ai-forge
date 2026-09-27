const puppeteer = require('../frontend/node_modules/puppeteer-core');
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Select project
  await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:8000/api/v1/film/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Diagnostic Film Project',
        prompt: 'Silk weaver in Kanchipuram.',
        target_duration_sec: 15.0
      })
    });
    const data = await res.json();
    const pid = data.project_id || data.project?.id;
    window.__projectStore.getState().selectProject({
      id: pid,
      title: 'Diagnostic Film Project',
      settings: { width: 1920, height: 1080, fps: 30, sample_rate: 48000, color_space: 'rec709', max_duration_sec: 600 }
    });
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. Switch to characters tab
  await page.evaluate(() => {
    window.__uiStore.getState().setActiveSidebarTab('characters');
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- BEFORE CLICKING ADD ---');
  let charText = await page.evaluate(() => document.getElementById('character-studio')?.innerText);
  console.log(charText);

  await page.evaluate(() => {
    document.getElementById('add-character-btn')?.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- AFTER CLICKING ADD ---');
  charText = await page.evaluate(() => document.getElementById('character-studio')?.innerText);
  console.log(charText);

  // 3. Switch to voice dubbing
  await page.evaluate(() => {
    window.__uiStore.getState().setActiveSidebarTab('voice-dubbing');
  });
  await new Promise(r => setTimeout(r, 1500));
  const voiceText = await page.evaluate(() => document.getElementById('voice-dubbing-panel')?.innerText);
  console.log('--- VOICE DUBBING TEXT ---');
  console.log(voiceText);

  await browser.close();
})();
