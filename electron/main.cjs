'use strict';

const { app, BrowserWindow, shell, Menu, ipcMain, dialog, nativeImage, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const HOST = '127.0.0.1';
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'kingdee-settings.json');
const KINGDEE_PATCH_FILE = () => path.join(app.getPath('userData'), 'kingdee-mcp.patch.yml');

let serverProc = null;
let mainWindow = null;
let settingsWindow = null;
let readyPort = null;
let logStream = null;

/** Root that holds `node/` and `dsh/` — dev: project `resources/`; packaged: resourcesPath. */
function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
}

function nodeBinPath() {
  return path.join(resourcesRoot(), 'node', process.platform === 'win32' ? 'node.exe' : 'node');
}

function dshBinPath(runtimeNm) {
  return path.join(runtimeNm, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

/** Bundled single-file runtime archive — shipped instead of the raw 33k-file node_modules. */
function runtimeArchivePath() {
  return path.join(resourcesRoot(), 'dsh-runtime.tar.gz');
}

/**
 * Resolve the dsh runtime node_modules:
 *  - dev: the raw tree at resources/dsh/node_modules (npm run runtime:install).
 *  - packaged: extract the bundled dsh-runtime.tar.gz once to <userData>/dsh-runtime
 *    (writable even under Program Files), keyed by app version so updates re-extract.
 * Extraction is synchronous + atomic (temp dir → rename), so a crash mid-extract never
 * leaves a half-baked runtime behind.
 */
function ensureRuntime() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'resources', 'dsh', 'node_modules');
  }

  const archive = runtimeArchivePath();
  const destDir = path.join(app.getPath('userData'), 'dsh-runtime');
  const nmDir = path.join(destDir, 'node_modules');
  const markerFile = path.join(destDir, '.app-version');
  const version = app.getVersion();

  if (!fs.existsSync(archive)) {
    throw new Error(`Bundled runtime not found:\n${archive}\n\nThe installer was built without "npm run runtime:pack".`);
  }

  // Fast path: already extracted for this exact app version.
  let markerOk = false;
  try { markerOk = fs.existsSync(nmDir) && fs.readFileSync(markerFile, 'utf8') === version; } catch (_) { /* re-extract */ }
  if (markerOk) return nmDir;

  const tmp = fs.mkdtempSync(path.join(app.getPath('userData'), 'dsh-runtime-tmp-'));
  try {
    const r = spawnSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`tar exited ${r.status}`);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Failed to extract bundled runtime:\n${e.message}`);
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.renameSync(tmp, destDir);
  fs.writeFileSync(markerFile, version);
  logLine('runtime', `extracted to ${destDir}`);
  return nmDir;
}

function logDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureLogStream() {
  if (logStream) return logStream;
  logStream = fs.createWriteStream(path.join(logDir(), 'dsh-server.log'), { flags: 'a' });
  return logStream;
}

function logLine(prefix, text) {
  const line = `[${new Date().toISOString()}] ${prefix} ${text}`;
  ensureLogStream().write(line.endsWith('\n') ? line : line + '\n');
}

function escapeHtml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function showError(message) {
  if (!mainWindow) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>金蝶云星空助手</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
background:#0e1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh}
.box{max-width:640px;padding:32px;text-align:center}h1{font-size:20px;margin-bottom:16px}
pre{background:#161b22;padding:16px;border-radius:8px;text-align:left;white-space:pre-wrap;word-break:break-word;
font-size:13px;color:#f47067}</style></head><body><div class="box"><h1>金蝶云星空助手启动失败</h1>
<pre>${escapeHtml(message)}</pre>
<p>Log: ${escapeHtml(logDir())}/dsh-server.log</p></div></body></html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function loadApp() {
  if (!mainWindow || !readyPort) return;
  mainWindow.loadURL(`http://${HOST}:${readyPort}/`);
}

function showSplash() {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// ---------------------------------------------------------------------------
// Kingdee MCP settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = { enabled: false, serverUrl: '', acctId: '', username: '', password: '' };

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }, null, 2));
}

function bundledUvPath() {
  return path.join(resourcesRoot(), 'uv', process.platform === 'win32' ? 'uv.exe' : 'uv');
}

/** Resolve the uv binary: bundled copy first, then system uv. */
function findUv() {
  const bundled = bundledUvPath();
  if (fs.existsSync(bundled)) return bundled;
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSync(cmd, ['uv'], { encoding: 'utf8' });
    const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
  } catch (_) { /* ignore */ }
  return 'uv';
}

/** Write/remove the --patch overlay that wires kingdee-mcp into dsh. */
function writeKingdeePatch(settings) {
  if (!settings.enabled) {
    try { fs.rmSync(KINGDEE_PATCH_FILE(), { force: true }); } catch (_) { /* ignore */ }
    return;
  }
  const uv = findUv();
  const env = {
    KINGDEE_SERVER_URL: settings.serverUrl || '',
    KINGDEE_ACCT_ID: settings.acctId || '',
    KINGDEE_USERNAME: settings.username || '',
    KINGDEE_PASSWORD: settings.password || '',
  };
  const lines = [
    '- insert:',
    '    - id: kingdee-mcp',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        transport: stdio',
    '        serverName: kingdee',
    `        command: ${JSON.stringify(uv)}`,
    `        args: ${JSON.stringify(['tool', 'run', 'kingdee-mcp'])}`,
    '        env:',
  ];
  for (const [k, v] of Object.entries(env)) lines.push(`          ${k}: ${JSON.stringify(v)}`);
  lines.push(`        cwd: ${JSON.stringify(app.getPath('home'))}`);
  lines.push('        toolCallTimeoutMs: 120000');
  lines.push('        failOnStartupError: false');

  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(KINGDEE_PATCH_FILE(), lines.join('\n') + '\n');
}

function buildDshArgs() {
  const args = ['web', '--host', HOST, '--port', '0'];
  if (fs.existsSync(KINGDEE_PATCH_FILE())) args.splice(1, 0, '--patch', KINGDEE_PATCH_FILE());
  return args;
}

// ---------------------------------------------------------------------------
// dsh server lifecycle
// ---------------------------------------------------------------------------

function startServer() {
  const nodeBin = nodeBinPath();
  let runtimeNm;
  try {
    runtimeNm = ensureRuntime();   // packaged: extracts bundled runtime on first launch
  } catch (e) {
    showError(String((e && e.message) || e));
    return;
  }
  const dshBin = dshBinPath(runtimeNm);

  if (!fs.existsSync(nodeBin)) { showError(`Bundled Node runtime not found at:\n${nodeBin}`); return; }
  if (!fs.existsSync(dshBin)) { showError(`dsh runtime not found at:\n${dshBin}`); return; }

  const dshHome = path.join(app.getPath('userData'), 'dsh-home');
  fs.mkdirSync(dshHome, { recursive: true });

  const args = buildDshArgs();
  logLine('spawn', `node=${nodeBin}`);
  logLine('spawn', `dsh=${dshBin} args=${args.join(' ')}`);

  serverProc = spawn(nodeBin, [dshBin, ...args], {
    env: { ...process.env, DSH_HOME: dshHome, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let outBuf = '';
  serverProc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    outBuf += text;
    logLine('stdout', text.trim());
    const m = outBuf.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/);
    if (m && !readyPort) {
      readyPort = parseInt(m[1], 10);
      logLine('ready', `detected port ${readyPort}`);
      loadApp();
    }
  });

  serverProc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    logLine('stderr', text.trim());
    console.error('[dsh]', text);
  });

  serverProc.on('error', (err) => {
    logLine('error', String(err && err.stack ? err.stack : err));
    showError(`金蝶云星空助手启动失败:\n${err.message}`);
  });

  serverProc.on('exit', (code, signal) => {
    logLine('exit', `code=${code} signal=${signal}`);
    serverProc = null;
    if (app.isQuitting || app.isRestarting) return;
    showError(`金蝶云星空助手意外退出 (code ${code}${signal ? `, signal ${signal}` : ''}).`);
  });
}

function stopServer() {
  if (serverProc) {
    try { serverProc.kill('SIGTERM'); } catch (_) { /* ignore */ }
    serverProc = null;
  }
}

function restartServer() {
  app.isRestarting = true;
  stopServer();
  readyPort = null;
  showSplash();
  // brief settle so the old child releases the port before the new one boots
  setTimeout(() => {
    app.isRestarting = false;
    startServer();
  }, 400);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: '金蝶云星空助手',
    show: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload-main.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith(`http://${HOST}:`) || url.startsWith('file://') || url.startsWith('data:');
    if (!allowed) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  showSplash();
}

function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 620,
    height: 720,
    title: '金蝶 MCP 设置',
    resizable: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: '设置',
      submenu: [
        { label: '金蝶 MCP 设置', click: () => openSettings() },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

// 主窗口悬浮齿轮按钮 → 打开金蝶 MCP 设置
ipcMain.on('main:open-settings', () => openSettings());

ipcMain.handle('kingdee:get-settings', () => loadSettings());
ipcMain.handle('kingdee:save-settings', (_e, settings) => {
  saveSettings(settings);
  writeKingdeePatch(loadSettings());
  restartServer();
  return true;
});
ipcMain.handle('kingdee:get-status', () => ({ uvx: findUv() !== 'uv' }));

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

/** Windows 任务栏叠加的小红点资源(打包在 asar 的 electron/assets 下)。 */
const UPDATE_DOT = path.join(__dirname, 'assets', 'update-dot.png');

let updateAvailable = false;

/** 有新版本时亮原生角标:macOS Dock 小红点 / Windows 任务栏叠加红点 / Linux 尽力而为。 */
function setUpdateBadge(show) {
  updateAvailable = show;
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(show ? 1 : 0);
    } else if (process.platform === 'win32') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setOverlayIcon(
          show ? nativeImage.createFromPath(UPDATE_DOT) : null,
          show ? '新版本可用' : '',
        );
      }
    }
  } catch (_) { /* 角标只是提示,失败不崩溃 */ }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return; // 开发模式不检查更新,避免本地报错刷屏

  autoUpdater.autoDownload = true;          // 后台静默下载
  autoUpdater.autoInstallOnAppQuit = true;  // 用户直接退出时兜底安装

  // 并发检查有竞态:启动检查 + 定时器重叠时,第二次会误报 update-not-available,
  // 把已亮起的红点清掉。用 inFlight 串行化,并只在「从未宣布过更新」时才清红点。
  let checkInFlight = false;
  const checkOnce = () => {
    if (checkInFlight) return;
    checkInFlight = true;
    autoUpdater.checkForUpdates()
      .catch((err) => logLine('updater', `check failed: ${err && err.message}`))
      .finally(() => { checkInFlight = false; });
  };

  autoUpdater.on('update-available', (info) => {
    logLine('updater', 'update available');
    setUpdateBadge(true);
    // 红点亮了但用户不知道在干嘛:同时弹一个系统通知说明「正在后台下载」。
    try {
      const ver = info && info.version ? info.version : '新版本';
      if (Notification.isSupported()) {
        const n = new Notification({
          title: '发现新版本',
          body: `有 ${ver} 可用,正在后台下载,下载完成后会提示重启安装。`,
        });
        n.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
        n.show();
      }
    } catch (_) { /* 通知失败不阻塞更新 */ }
  });
  autoUpdater.on('update-not-available', () => {
    logLine('updater', 'no update available');
    if (!updateAvailable) setUpdateBadge(false); // 已宣布过更新(下载中/待装)就不再熄灯
  });
  autoUpdater.on('update-downloaded', async () => {
    logLine('updater', 'update downloaded');
    setUpdateBadge(true); // 下载完成仍亮着,直到用户处理
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['立即重启安装', '稍后'],
      defaultId: 0,
      cancelId: 1,
      title: '发现新版本',
      message: '新版本已下载完成,重启即可生效。',
      detail: `当前版本 ${app.getVersion()},是否立即重启安装?`,
    });
    if (response === 0) {
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 500);
    }
  });
  autoUpdater.on('error', (err) => {
    logLine('updater', `error: ${err && err.message ? err.message : err}`);
  });

  // 启动检查一次,之后每小时一次;走 checkOnce 串行化,避免并发竞态误清红点。
  checkOnce();
  setInterval(checkOnce, 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.isQuitting = false;
app.isRestarting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    writeKingdeePatch(loadSettings()); // ensure patch reflects saved settings
    createWindow();
    startServer();
    setupAutoUpdater(); // 在 createWindow 之后,确保 mainWindow 可用于 Windows 角标
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      loadApp();
    }
  });

  app.on('before-quit', () => { app.isQuitting = true; });

  app.on('will-quit', () => {
    stopServer();
    if (logStream) { try { logStream.end(); } catch (_) { /* ignore */ } }
  });

  app.on('window-all-closed', () => { app.quit(); });
}
