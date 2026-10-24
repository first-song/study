
// 内嵌载荷的单文件启动器。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const APP_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'AberrantTide');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// 载荷解开后只放在内存里，磁盘上不落任何源码。
const KEY_SEED = 0x9e3779b9;
function keystream(length, seed) {
  const out = Buffer.alloc(length);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    s ^= (s << 13) >>> 0; s >>>= 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0; s >>>= 0;
    out[i] = s & 0xff;
  }
  return out;
}

function loadPayload() {
  const sea = require('node:sea');
  const packed = Buffer.from(sea.getAsset('payload.gz'));
  const stream = keystream(packed.length, KEY_SEED);
  for (let i = 0; i < packed.length; i++) packed[i] ^= stream[i];
  const raw = zlib.gunzipSync(packed);
  if (raw.toString('ascii', 0, 4) !== 'ATMP') throw new Error('载荷已损坏');
  const manifestLength = raw.readUInt32LE(4);
  const manifest = JSON.parse(raw.toString('utf8', 8, 8 + manifestLength));
  const dataStart = 8 + manifestLength;
  const files = new Map();
  for (const file of manifest.files) {
    files.set(file.path, raw.subarray(dataStart + file.offset, dataStart + file.offset + file.size));
  }
  return files;
}

// 找系统里现成的 Edge / Chrome。没有的话退回默认浏览器。
function findBrowser() {
  const local = process.env.LOCALAPPDATA || '';
  const programFiles = process.env['ProgramFiles'] || 'C:/Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const candidates = [
    path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(local, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
    path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
    path.join(local, 'Google/Chrome/Application/chrome.exe'),
  ];
  return candidates.find(candidate => { try { return fs.existsSync(candidate); } catch { return false; } }) || null;
}

let lastRequest = Date.now();
let PAYLOAD = new Map();

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      lastRequest = Date.now();
      let requested;
      try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { res.writeHead(400).end('Bad request'); return; }
      // 页面被关掉时会发一个信标过来，服务器随之退出，不留后台进程。
      if (requested === '/quit') {
        res.writeHead(204).end();
        setTimeout(() => process.exit(0), 120);
        return;
      }
      // 清单里的键没有前导斜杠，这里统一去掉。
      const key = requested.replace(/^\/+/, '') || 'index.html';
      if (key.split('/').includes('..')) { res.writeHead(403).end('Forbidden'); return; }
      const body = PAYLOAD.get(key);
      if (!body) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(key)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function runWorker() {
  PAYLOAD = loadPayload();
  const { server, port } = await serve();
  const url = 'http://127.0.0.1:' + port + '/index.html';
  // 记下地址：既是自动化验证的入口，也让玩家能随时重新打开。
  try {
    fs.mkdirSync(APP_DIR, { recursive: true });
    fs.writeFileSync(path.join(APP_DIR, 'address.txt'), url);
  } catch {}
  // 十分钟没有任何请求就自己退出，不给玩家留后台进程。
  const idle = setInterval(() => {
    if (Date.now() - lastRequest > 600000) { clearInterval(idle); process.exit(0); }
  }, 30000);
  idle.unref?.();
  const browser = findBrowser();
  if (browser) {
    // --app 模式：没有地址栏和标签页，看起来就是个游戏窗口。
    spawn(browser, ['--app=' + url, '--window-size=1440,900', '--no-first-run'], { stdio: 'ignore' });
  } else {
    execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
  }
  // 服务器的生命周期交给页面：它关掉时会发 /quit。
  server.on('close', () => process.exit(0));
}

if (process.argv.includes('--serve')) {
  runWorker().catch(error => {
    try { execFileSync('cmd', ['/c', 'start', '', 'about:blank'], { stdio: 'ignore' }); } catch {}
    process.exit(1);
  });
} else {
  // 真正干活的是隐藏的子进程，父进程立刻退出 ——
  // 这样双击时那个控制台窗口只会闪一下。
  try {
    spawn(process.execPath, ['--serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
  process.exit(0);
}
