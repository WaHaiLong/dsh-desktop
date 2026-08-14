'use strict';

const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const HOST = '127.0.0.1';

let serverProc = null;
let mainWindow = null;
let readyPort = null;
let logStream = null;

/** Root that holds `node/` and `dsh/` — dev: project root; packaged: resourcesPath. */
function resourcesRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
}

function nodeBinPath() {
  return path.join(resourcesRoot(), 'node', process.platform === 'win32' ? 'node.exe' : 'node');
}

function dshBinPath() {
  return path.join(
    resourcesRoot(),
    'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'
  );
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
  const stream = ensureLogStream();
  const line = `[${new Date().toISOString()}] ${prefix} ${text}`;
  stream.write(line.endsWith('\n') ? line : line + '\n');
}

function showError(message) {
  if (!mainWindow) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DeepSeek Harness</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
background:#0e1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh}
.box{max-width:620px;padding:32px;text-align:center}h1{font-size:20px;margin-bottom:16px}
pre{background:#161b22;padding:16px;border-radius:8px;text-align:left;white-space:pre-wrap;word-break:break-word;
font-size:13px;color:#f47067}</style></head><body><div class="box"><h1>DeepSeek Harness failed to start</h1>
<pre>${String(message).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>
<p>Log: ${logDir().replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}/dsh-server.log</p>
</div></body></html>`;
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function loadApp() {
  if (!mainWindow || !readyPort) return;
  mainWindow.loadURL(`http://${HOST}:${readyPort}/`);
}

function startServer() {
  const nodeBin = nodeBinPath();
  const dshBin = dshBinPath();

  if (!fs.existsSync(nodeBin)) {
    showError(`Bundled Node runtime not found at:\n${nodeBin}`);
    return;
  }
  if (!fs.existsSync(dshBin)) {
    showError(`dsh runtime not found at:\n${dshBin}`);
    return;
  }

  const dshHome = path.join(app.getPath('userData'), 'dsh-home');
  fs.mkdirSync(dshHome, { recursive: true });

  logLine('spawn', `node=${nodeBin}`);
  logLine('spawn', `dsh=${dshBin}`);

  serverProc = spawn(nodeBin, [dshBin, 'web', '--host', HOST, '--port', '0'], {
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
    showError(`Failed to launch DeepSeek Harness:\n${err.message}`);
  });

  serverProc.on('exit', (code, signal) => {
    logLine('exit', `code=${code} signal=${signal}`);
    serverProc = null;
    if (app.isQuitting) return;
    showError(`DeepSeek Harness exited unexpectedly (code ${code}${signal ? `, signal ${signal}` : ''}).`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'DeepSeek Harness',
    show: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
}

app.isQuitting = false;

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
    createWindow();
    startServer();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      loadApp();
    }
  });

  app.on('before-quit', () => { app.isQuitting = true; });

  app.on('will-quit', () => {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch (_) { /* ignore */ }
    }
    if (logStream) {
      try { logStream.end(); } catch (_) { /* ignore */ }
    }
  });

  app.on('window-all-closed', () => { app.quit(); });
}
