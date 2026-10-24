// 做一个单文件 exe：把整个游戏（页面、脚本、three 运行时）打包进一个可执行文件。
//
// 朋友只需要这一个文件，双击就玩，里面看不到任何源码。
// 做法是 Node 的 Single Executable Application：
//   1) 把游戏文件拼成一个自定义归档（清单 + 文件字节），gzip 后作为 SEA 资源内嵌
//   2) 启动器解包到 %LOCALAPPDATA%，再用系统自带的 Edge/Chrome 以"应用窗口"模式打开游戏
//   3) 把 node.exe 复制成 异潮.exe，用 postject 把 SEA blob 注入进去
//
// 之所以不用 Electron 做这个单文件：Electron 的运行时文件必须和 exe 并排，
// 永远是一整个文件夹，塞不进单个 exe。

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildDir = path.join(root, 'build');
const stageDir = path.join(buildDir, 'single');
const outExe = path.join(root, 'dist', '异潮.exe');
const APP_DIR_NAME = 'AberrantTide';

fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

// ---- 1) 收集要打进去的游戏文件 ----
const files = [];
function collect(source, relative) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(source)) collect(path.join(source, entry), path.join(relative, entry));
    return;
  }
  files.push({ source, relative: relative.split(path.sep).join('/') });
}
collect(path.join(root, 'index.html'), 'index.html');
collect(path.join(root, 'src'), 'src');

// three 运行时：只带真正会加载的文件。
const threeSource = path.join(root, 'node_modules', 'three');
for (const file of ['build/three.module.js', 'build/three.core.js', 'package.json', 'LICENSE']) {
  collect(path.join(threeSource, file), path.join('node_modules/three', file));
}
// 整个 jsm 都要：postprocessing 之间互相引用，还用到 ../math/SimplexNoise.js
collect(path.join(threeSource, 'examples', 'jsm'), 'node_modules/three/examples/jsm');

console.log(`收集 ${files.length} 个文件`);

// ---- 2) 拼成自定义归档：魔数 + 清单长度 + 清单 JSON + 文件字节 ----
const chunks = [];
const manifest = [];
let offset = 0;
for (const file of files) {
  const data = fs.readFileSync(file.source);
  manifest.push({ path: file.relative, offset, size: data.length });
  chunks.push(data);
  offset += data.length;
}
const manifestJson = Buffer.from(JSON.stringify({ files: manifest }), 'utf8');
const header = Buffer.alloc(8);
header.write('ATMP', 0, 'ascii');
header.writeUInt32LE(manifestJson.length, 4);
const archive = Buffer.concat([header, manifestJson, ...chunks]);

// 先压缩再加密：加密后的数据压不动，顺序反了 exe 会胖 10MB。
// 载荷在进 exe 之前加密，朋友不会在磁盘上看到明文源码。
// 这是防"随手翻一翻"，不是密码学意义上的保密 —— 真要防内行得靠混淆或服务端化。
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
const compressed = zlib.gzipSync(archive, { level: 9 });
const payload = Buffer.from(compressed);
const stream = keystream(payload.length, KEY_SEED);
for (let i = 0; i < payload.length; i++) payload[i] ^= stream[i];
fs.writeFileSync(path.join(buildDir, 'payload.gz'), payload);
console.log(`载荷 ${(payload.length / 1024 / 1024).toFixed(1)} MB（原始 ${(archive.length / 1024 / 1024).toFixed(1)} MB，已加密）`);

// ---- 3) 启动器 ----
const launcher = String.raw`
// 内嵌载荷的单文件启动器。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const APP_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), '${APP_DIR_NAME}');
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
`;
fs.writeFileSync(path.join(buildDir, 'launcher.cjs'), launcher);

// ---- 4) 生成 SEA blob ----
const seaConfig = {
  main: path.join(buildDir, 'launcher.cjs').split(path.sep).join('/'),
  output: path.join(buildDir, 'sea-prep.blob').split(path.sep).join('/'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets: { 'payload.gz': path.join(buildDir, 'payload.gz').split(path.sep).join('/') },
};
fs.writeFileSync(path.join(buildDir, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', path.join(buildDir, 'sea-config.json')], { stdio: 'inherit' });

// ---- 5) 复制 node.exe 并注入 blob ----
const nodeExe = process.execPath;
fs.copyFileSync(nodeExe, outExe);
execFileSync(process.execPath, [
  path.join(root, 'node_modules', 'postject', 'dist', 'cli.js'),
  outExe,
  'NODE_SEA_BLOB',
  path.join(buildDir, 'sea-prep.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
], { stdio: 'inherit' });

const size = fs.statSync(outExe).size;
console.log(`单文件 exe 已生成：${outExe}（${(size / 1024 / 1024).toFixed(1)} MB）`);
