const http = require('http');
const { spawn } = require('child_process');

async function testProjectCreation() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9224;

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'http://localhost:5173/'
  ]);

  await new Promise(r => setTimeout(r, 2500));

  try {
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
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

    await new Promise((resolve, reject) => {
      ws.addEventListener('open', async () => {
        await sendCmd('Runtime.enable');
        resolve();
      });
      ws.addEventListener('error', reject);
    });

    await new Promise(r => setTimeout(r, 2000));

    // Navigate to "My Projects" tab
    await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll('aside button'));
          const target = buttons.find(b => b.textContent && b.textContent.includes('My Projects'));
          if (target) target.click();
        })()
      `
    });

    await new Promise(r => setTimeout(r, 500));

    // Click "+ New" in My Projects panel
    await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const newBtn = btns.find(b => b.textContent && b.textContent.trim().includes('New'));
          if (newBtn) newBtn.click();
        })()
      `
    });

    await new Promise(r => setTimeout(r, 500));

    // Check if modal title "New Project" and input is visible
    const checkModal = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const h2 = document.querySelector('h2');
          const input = document.querySelector('input[placeholder*="Ponniyin"]');
          return {
            hasHeading: h2 ? h2.textContent : null,
            hasInput: Boolean(input)
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Modal check result:', checkModal?.result?.value);

    // Test typing in project title and clicking Create
    const testTitle = "Kanguva AI Reimagining " + Math.floor(Math.random() * 1000);
    await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const input = document.querySelector('input[placeholder*="Ponniyin"]');
          if (input) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(input, '${testTitle}');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `
    });

    await new Promise(r => setTimeout(r, 300));

    // Click "Create Project" button inside modal
    await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const createBtn = btns.find(b => b.textContent && b.textContent.includes('Create Project'));
          if (createBtn) createBtn.click();
        })()
      `
    });

    await new Promise(r => setTimeout(r, 1500));

    // Verify project appears in active project title or project list
    const verifyProj = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          return text.includes('${testTitle}');
        })()
      `,
      returnByValue: true
    });

    console.log(`Project "${testTitle}" created and rendered in UI:`, verifyProj?.result?.value);

    ws.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    chromeProc.kill();
  }
}

testProjectCreation();
