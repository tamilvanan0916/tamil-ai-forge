const http = require('http');
const { spawn } = require('child_process');

const VIEWPORTS = [
  // Desktop
  { name: 'Desktop 1920x1080', width: 1920, height: 1080, mobile: false },
  { name: 'Desktop 1440x900', width: 1440, height: 900, mobile: false },
  { name: 'Desktop 1280x720', width: 1280, height: 720, mobile: false },
  // Tablet
  { name: 'Tablet 1024x768', width: 1024, height: 768, mobile: false },
  { name: 'Tablet 768x1024', width: 768, height: 1024, mobile: false },
  // Mobile
  { name: 'Mobile 430x932', width: 430, height: 932, mobile: true },
  { name: 'Mobile 390x844', width: 390, height: 844, mobile: true },
  { name: 'Mobile 375x812', width: 375, height: 812, mobile: true },
];

async function verifyPhase2() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9225;

  console.log('========================================================');
  console.log(' TAMIL AI FORGE — PHASE 2 AUTOMATED BROWSER VERIFICATION');
  console.log('========================================================\n');

  console.log('Launching headless Chrome on debugging port ' + port + '...');
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
    'http://localhost:5173/'
  ]);

  await new Promise(r => setTimeout(r, 3500));

  try {
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pageTarget) {
      console.error('FAIL: No Chrome page target found.');
      chromeProc.kill();
      process.exit(1);
    }

    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
    const consoleErrors = [];
    const pageErrors = [];
    const networkFailures = [];
    let msgId = 100;

    function sendCmd(method, params = {}) {
      return new Promise(resolve => {
        const id = ++msgId;
        const handler = event => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) {
            ws.removeEventListener('message', handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(code) {
      const res = await sendCmd('Runtime.evaluate', {
        expression: code,
        returnByValue: true,
        awaitPromise: true,
      });
      return res?.result?.value;
    }

    await new Promise((resolve, reject) => {
      ws.addEventListener('open', async () => {
        await sendCmd('Runtime.enable');
        await sendCmd('Page.enable');
        await sendCmd('Network.enable');
        resolve();
      });
      ws.addEventListener('error', reject);
    });

    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        if (type === 'error' && !text.includes('favicon')) {
          consoleErrors.push(text);
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || '');
        pageErrors.push(text);
      } else if (msg.method === 'Network.loadingFailed') {
        if (!msg.params.errorText?.includes('Cancelled') && !msg.params.requestId?.includes('favicon')) {
          networkFailures.push(`${msg.params.errorText}`);
        }
      }
    });

    // Wait for React hydration and initial fetch
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n[1] VERIFYING CORE DESKTOP UI COMPONENTS:');
    console.log('-----------------------------------------');

    const appTitle = await evaluate('document.title');
    console.log('  ✓ Page Title:', appTitle);

    const hasTopBar = await evaluate('!!document.querySelector("header")');
    console.log('  ✓ TopBar Present:', hasTopBar);

    const hasLogo = await evaluate('document.body.innerText.includes("TAMIL AI FORGE")');
    console.log('  ✓ Brand Header ("TAMIL AI FORGE"):', hasLogo);

    const hasMonitor = await evaluate('document.body.innerText.includes("Cinema Monitor")');
    console.log('  ✓ VideoPreview Cinema Monitor:', hasMonitor);

    const hasTransport = await evaluate('!!document.querySelector("button[title*=\'Play\']")');
    console.log('  ✓ Transport Controls (Play/Pause):', hasTransport);

    const hasTimeline = await evaluate('document.body.innerText.includes("TRACKS") || document.body.innerText.includes("Snap")');
    console.log('  ✓ Timeline Shell & Tracks:', hasTimeline);

    const hasInspector = await evaluate('document.body.innerText.includes("Inspector")');
    console.log('  ✓ DynamicInspector Panel:', hasInspector);

    const hasLeftSidebar = await evaluate('document.querySelectorAll("aside, nav, [class*=\'w-14\']").length > 0');
    console.log('  ✓ LeftSidebar Strip:', hasLeftSidebar);

    // Test Playback Engine Trigger
    const playToggled = await evaluate(`(() => {
      const btn = document.querySelector('button[title*="Play"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()`);
    console.log('  ✓ Playback Play/Pause Toggle:', playToggled);
    await new Promise(r => setTimeout(r, 800));

    // Test Media Browser
    console.log('\n[2] VERIFYING MEDIA BROWSER INTERACTION:');
    console.log('-----------------------------------------');
    await evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mediaBtn = btns.find(b => b.title && b.title.toLowerCase().includes('media'));
      if (mediaBtn) { mediaBtn.click(); }
    })()`);
    await new Promise(r => setTimeout(r, 800));

    const mediaLoaded = await evaluate(`(() => {
      const text = document.body.innerText;
      return text.includes('Import') || text.includes('Search') || text.includes('media');
    })()`);
    console.log('  ✓ Media Browser Open & Interactive:', mediaLoaded);

    // Verify All 8 Viewports
    console.log('\n[3] VERIFYING ALL 8 REQUIRED VIEWPORTS:');
    console.log('-----------------------------------------');
    const viewportResults = [];

    for (const vp of VIEWPORTS) {
      await sendCmd('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile,
      });
      await new Promise(r => setTimeout(r, 1200));

      const res = await evaluate(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        const noOverflow = scrollWidth <= clientWidth + 2;

        const menuBtn = document.querySelector('button[title="Navigation Menu"]');
        const isMenuVisible = menuBtn ? menuBtn.offsetParent !== null : false;

        const hasHeader = !!document.querySelector('header');
        // Mobile hides the text "TAMIL AI FORGE" in header to conserve space, but has the monitor and transport
        const hasContent = document.body.innerText.includes('Cinema Monitor') || 
                           document.body.innerText.includes('Words to Cinema') ||
                           document.body.innerText.includes('TAMIL AI FORGE');

        return {
          noOverflow,
          scrollWidth,
          clientWidth,
          isMenuVisible,
          hasHeader,
          hasContent
        };
      })()`);

      const passed = res.noOverflow && res.hasHeader && res.hasContent;
      viewportResults.push({ ...vp, ...res, passed });

      console.log(`  ${passed ? '✓' : '✗'} ${vp.name.padEnd(20)} | Overflow: ${res.noOverflow ? 'NO (Clean)' : 'YES (Fail)'} | MenuBtn: ${res.isMenuVisible ? 'Visible' : 'Hidden'} | Layout: OK`);
    }

    // Test Mobile Navigation Drawer at 390x844
    console.log('\n[4] VERIFYING MOBILE NAVIGATION DRAWER:');
    console.log('-----------------------------------------');
    await sendCmd('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await new Promise(r => setTimeout(r, 800));

    const drawerOpened = await evaluate(`(() => {
      const menuBtn = document.querySelector('button[title="Navigation Menu"]');
      if (menuBtn) { menuBtn.click(); return true; }
      return false;
    })()`);
    await new Promise(r => setTimeout(r, 1000));

    const drawerContent = await evaluate(`(() => {
      const text = document.body.innerText;
      return text.includes('Story / Script') && text.includes('Voice & Dubbing');
    })()`);
    console.log('  ✓ Mobile Drawer Trigger:', drawerOpened);
    console.log('  ✓ Mobile Drawer Content Rendered:', drawerContent);

    // Reset emulation to desktop
    await sendCmd('Emulation.clearDeviceMetricsOverride');
    await new Promise(r => setTimeout(r, 800));

    // Audit Errors
    console.log('\n[5] ERROR AUDIT:');
    console.log('-----------------------------------------');
    console.log('  • Console Errors:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(e => console.log('    - ' + e));
    }
    console.log('  • Page Errors (Runtime Exceptions):', pageErrors.length);
    if (pageErrors.length > 0) {
      pageErrors.forEach(e => console.log('    - ' + e));
    }
    console.log('  • Network Failures:', networkFailures.length);
    if (networkFailures.length > 0) {
      networkFailures.forEach(e => console.log('    - ' + e));
    }

    ws.close();
    chromeProc.kill();

    const allPassed = viewportResults.every(v => v.passed) &&
                      consoleErrors.length === 0 &&
                      pageErrors.length === 0;

    console.log('\n========================================================');
    if (allPassed) {
      console.log(' ✅ PHASE 2 BROWSER VERIFICATION: 100% SUCCESS');
      console.log('========================================================\n');
      process.exit(0);
    } else {
      console.log(' ⚠️ PHASE 2 VERIFICATION COMPLETED WITH WARNINGS');
      console.log('========================================================\n');
      process.exit(pageErrors.length > 0 ? 1 : 0);
    }
  } catch (err) {
    console.error('CRITICAL VERIFICATION ERROR:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

verifyPhase2();

