const http = require('http');
const { spawn } = require('child_process');

async function testBrowser() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9222;

  console.log('Launching headless Chrome with remote debugging on port ' + port);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'http://localhost:5173/'
  ]);

  // Wait 3 seconds for Chrome to start
  await new Promise(r => setTimeout(r, 3000));

  try {
    // Get list of targets
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    console.log('Targets found:', targets.length);
    const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pageTarget) {
      console.log('No page target with websocketDebuggerUrl');
      chromeProc.kill();
      return;
    }

    // Connect using Node 22 built-in global WebSocket
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

    const errors = [];
    const logs = [];

    await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        console.log('Connected to Chrome DevTools WebSocket');
        ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));
        resolve();
      });
      ws.addEventListener('error', reject);
    });

    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        logs.push(`[${type}] ${text}`);
        if (type === 'error') {
          errors.push(text);
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || '');
        errors.push(text);
      }
    });

    // Wait 4 seconds to observe initial load and render
    await new Promise(r => setTimeout(r, 4000));

    console.log('\n--- BROWSER CONSOLE LOGS ---');
    logs.forEach(l => console.log(l));
    console.log('--- END OF LOGS ---\n');

    if (errors.length === 0) {
      console.log('SUCCESS: Zero console errors detected on page load!');
    } else {
      console.error(`ERRORS FOUND (${errors.length}):`);
      errors.forEach(e => console.error('  ERROR:', e));
    }

    ws.close();
  } catch (err) {
    console.error('Test script error:', err);
  } finally {
    chromeProc.kill();
  }
}

testBrowser();
