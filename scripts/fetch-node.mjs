#!/usr/bin/env node
// Download a standalone Node.js runtime for the current platform/arch and place
// it at resources/node/. The dsh server runs under this Node (NOT Electron's),
// so its native prebuilds (node-pty / sharp / koffi) load with the correct ABI.
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NODE_MAJOR = 24; // Node 24 LTS — satisfies dsh's `engines: >=24.0.0`

const platMap = { darwin: 'darwin', win32: 'win', linux: 'linux' };
const archMap = { arm64: 'arm64', x64: 'x64' };

const platform = platMap[process.platform];
const arch = archMap[process.arch];
if (!platform || !arch) {
  console.error(`Unsupported platform/arch: ${process.platform}/${process.arch}`);
  process.exit(1);
}

const ext = platform === 'win' ? 'zip' : platform === 'linux' ? 'tar.xz' : 'tar.gz';

async function main() {
  const index = await (await fetch('https://nodejs.org/dist/index.json')).json();
  const candidate = index.find((r) => r.version.startsWith(`v${NODE_MAJOR}.`) && !r.version.includes('-'));
  if (!candidate) {
    console.error(`No stable Node ${NODE_MAJOR}.x release found.`);
    process.exit(1);
  }
  const version = candidate.version;
  const dirname = `node-${version}-${platform}-${arch}`;
  const url = `https://nodejs.org/dist/${version}/${dirname}.${ext}`;

  const dest = path.join(ROOT, 'resources', 'node');
  mkdirSync(dest, { recursive: true });

  const binName = platform === 'win' ? 'node.exe' : 'node';
  const finalBin = path.join(dest, binName);
  if (existsSync(finalBin)) {
    console.log(`Node already present at ${finalBin} — skipping.`);
    return;
  }

  const tmp = mkdtempSync(path.join(tmpdir(), 'dsh-node-'));
  const archive = path.join(tmp, `node.${ext}`);

  console.log(`Downloading ${url} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));

  console.log(`Extracting to ${tmp} …`);
  // bsdtar (shipped on macOS, Windows 10+, and Linux) handles .tar.gz/.tar.xz/.zip alike.
  execFileSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' });

  const extracted = path.join(tmp, dirname);
  const srcBin = platform === 'win'
    ? path.join(extracted, 'node.exe')
    : path.join(extracted, 'bin', 'node');
  if (!existsSync(srcBin)) throw new Error(`Node binary not found at ${srcBin}`);

  // Clear stale dir then place the single binary we need.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  execFileSync('mv', [srcBin, finalBin], { stdio: 'inherit' });

  rmSync(tmp, { recursive: true, force: true });
  console.log(`Installed Node ${version} → ${finalBin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
