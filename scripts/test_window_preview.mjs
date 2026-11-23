import { spawn } from 'node:child_process';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9480;

const absHtml = path.resolve('public/window-preview.html').replace(/\\/g, '/');
const fileUrl = `file:///${absHtml}`;

const ch = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--remote-debugging-port=${port}`,
  fileUrl
], { stdio: 'ignore' });

process.on('exit', () => { try { ch.kill(); } catch {} });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await sleep(1500);
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let reqId = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = reqId++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const res = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        return {
          title: document.title,
          h1: document.querySelector('h1')?.textContent,
          cardsCount: document.querySelectorAll('.opt-card').length,
          tableRows: document.querySelectorAll('.library-table tbody tr').length,
          hasSim: !!document.getElementById('simGlass')
        };
      })()
    `
  });

  console.log('Page test result:', res.result.value);

  // Test toggling window
  const toggleRes = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        toggleWindow();
        return { isWinding, targetOpenness };
      })()
    `
  });
  console.log('Toggle window result:', toggleRes.result.value);

  await sleep(1800); // Wait for winding to finish

  const endRes = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        return {
          openness,
          isWinding,
          label: document.getElementById('simLabel')?.textContent
        };
      })()
    `
  });
  console.log('End state result:', endRes.result.value);

  ch.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); ch.kill(); process.exit(1); });
