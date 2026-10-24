// 异潮的桌面外壳：内嵌一个本地静态服务器，把游戏装进一个原生窗口。
// 朋友拿到 exe 双击就能玩，不需要装 Node、不需要开浏览器。
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let requested;
      try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
      catch { res.writeHead(400).end('Bad request'); return; }
      const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
      if (!file.startsWith(root + path.sep) || requested.split('/').includes('..')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      fs.stat(file, (error, stat) => {
        if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.on('error', reject);
    // 端口 0：让系统分配一个空闲端口，避免和玩家机器上别的服务撞车。
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function createWindow() {
  const { port } = await startServer();
  const win = new BrowserWindow({
    width: 1380,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#071b22',
    title: '异潮 · ABERRANT TIDE',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${port}/index.html`);
  return win;
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    const { dialog } = require('electron');
    dialog.showErrorBox('异潮启动失败', String(error && error.stack ? error.stack : error));
    app.quit();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
