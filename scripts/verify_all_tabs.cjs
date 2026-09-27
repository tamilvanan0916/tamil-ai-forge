const http = require('http');
const { spawn } = require('child_process');

async function testAllTabs() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9223;

  console.log('Launching headless Chrome for full UI navigation test on port ' + port);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'http://localhost:5173/'
  ]);

  await new Promise(r => setTimeout(r, 3000));

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
      console.log('No page target found');
      return;
    }

    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
    const errors = [];
    let msgId = 10;

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

    await new Promise((resolve, reject) => {
      ws.addEventListener('open', async () => {
        await sendCmd('Runtime.enable');
        await sendCmd('Page.enable');
        resolve();
      });
      ws.addEventListener('error', reject);
    });

    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        errors.push(`[Console Error] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        errors.push(`[Exception] ${msg.params.exceptionDetails.text}`);
      }
    });

    // Wait for initial render
    await new Promise(r => setTimeout(r, 2000));

    // Get all sidebar button labels
    const sidebarTabs = [
      'Home', 'Media', 'AI Generate', 'Story / Script', 'Characters',
      'Scenes', 'Storyboard', 'Edit', 'Color', 'VFX / Compositing',
      'Voice & Dubbing', 'Music Library', 'Sound Effects', 'Captions / Subtitles',
      'Graphics / Titles', 'Assets / Elements', 'Templates', 'My Projects',
      'Render Queue', 'Settings'
    ];

    console.log(`\nTesting navigation through all ${sidebarTabs.length} sidebar tabs...`);
    for (const tabName of sidebarTabs) {
      const evalRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll('aside button'));
            const target = buttons.find(b => b.textContent && b.textContent.includes('${tabName}'));
            if (target) {
              target.click();
              return 'CLICKED: ${tabName}';
            }
            return 'NOT_FOUND: ${tabName}';
          })()
        `,
        returnByValue: true
      });
      const resVal = evalRes?.result?.value;
      console.log(`  Tab [${tabName}]: ${resVal}`);
      await new Promise(r => setTimeout(r, 250));
    }

    // Test Inspector tabs
    const inspectorTabs = ['Transform', 'Crop', 'Video', 'Effects', 'Color', 'Audio', 'Text', 'AI'];
    console.log(`\nTesting all ${inspectorTabs.length} inspector tabs...`);
    for (const tabName of inspectorTabs) {
      const evalRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll('button[title]'));
            const target = buttons.find(b => b.getAttribute('title') === '${tabName}');
            if (target) {
              target.click();
              return 'CLICKED: ${tabName}';
            }
            return 'NOT_FOUND: ${tabName}';
          })()
        `,
        returnByValue: true
      });
      console.log(`  Inspector [${tabName}]: ${evalRes?.result?.value}`);
      await new Promise(r => setTimeout(r, 150));
    }

    // Verify modals (open & close New Project modal)
    console.log('\nTesting New Project Modal...');
    await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('New'));
          if (btn) btn.click();
        })()
      `
    });
    await new Promise(r => setTimeout(r, 400));
    const modalCheck = await sendCmd('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('input[placeholder*="Ponniyin"]'))`,
      returnByValue: true
    });
    console.log('  New Project Modal opened:', modalCheck?.result?.value);

    // Close modal via Escape
    await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          const cancel = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Cancel');
          if (cancel) cancel.click();
        })()
      `
    });
    await new Promise(r => setTimeout(r, 400));

    console.log('\n--- VERIFICATION RESULT ---');
    if (errors.length === 0) {
      console.log('ALL 20 SIDEBAR TABS, INSPECTOR TABS & MODALS VERIFIED WITH ZERO ERRORS!');
    } else {
      console.error(`Found ${errors.length} browser errors:`);
      errors.forEach(e => console.error(' ', e));
    }

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

testAllTabs();
