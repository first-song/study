// 手工组装 Windows 版：把本地已下载的 Electron 运行时和应用文件拼成一个目录。
// 不用 electron-packager，是因为它会去 GitHub 重新下载运行时（国内不通）。
// 复制也不用 fs.cpSync —— 它在递归复制某些目录时会直接把进程打死（静默退出 127），
// 所以这里自己逐文件复制。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const outRoot = path.join(root, 'dist');
const appName = '异潮';
const target = path.join(outRoot, `${appName}-win32-x64`);

function copyTree(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyTree(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) {
  throw new Error(`找不到 Electron 运行时：${electronDist}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.join(target, 'resources'), { recursive: true });

// 1) 运行时
for (const entry of fs.readdirSync(electronDist)) {
  if (entry === 'resources') continue;
  copyTree(path.join(electronDist, entry), path.join(target, entry));
}

// 2) 应用本体
const appDir = path.join(target, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
copyTree(path.join(root, 'index.html'), path.join(appDir, 'index.html'));
copyTree(path.join(root, 'src'), path.join(appDir, 'src'));
copyTree(path.join(root, 'electron'), path.join(appDir, 'electron'));

// three 是运行时唯一需要的依赖。
// 整包有 32MB（大部分是没用到的示例与源码），这里只留真正会加载的文件。
const threeSource = path.join(root, 'node_modules', 'three');
const threeDir = path.join(appDir, 'node_modules', 'three');
for (const file of ['build/three.module.js', 'build/three.core.js', 'package.json', 'LICENSE']) {
  copyTree(path.join(threeSource, file), path.join(threeDir, file));
}
// 整个 jsm 目录都带上：postprocessing 里的文件会互相引用，
// 还会用到 ../math/SimplexNoise.js，只挑两个文件夹会 404。
copyTree(path.join(threeSource, 'examples', 'jsm'), path.join(threeDir, 'examples', 'jsm'));

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runtimePackage = {
  name: packageJson.name,
  productName: appName,
  version: packageJson.version,
  description: packageJson.description,
  main: 'electron/main.cjs',
  author: packageJson.author,
  license: packageJson.license,
  private: true,
  dependencies: { three: packageJson.dependencies.three },
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(runtimePackage, null, 2));

// 3) 可执行文件改名
fs.renameSync(path.join(target, 'electron.exe'), path.join(target, `${appName}.exe`));

// 4) 只留中文与英文的语言包，其余 53 个 .pak 白占 49MB
const locales = path.join(target, 'locales');
if (fs.existsSync(locales)) {
  for (const file of fs.readdirSync(locales)) {
    if (file !== 'zh-CN.pak' && file !== 'en-US.pak') fs.rmSync(path.join(locales, file));
  }
}

// 5) 给朋友看的说明
copyTree(path.join(root, 'build', '给朋友.txt'), path.join(target, '给朋友.txt'));

console.log('packaged:', target);
