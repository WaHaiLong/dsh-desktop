#!/usr/bin/env node
// Download the `uv` binary for the current platform/arch into resources/uv/.
// Bundled so kingdee-mcp runs out-of-the-box (no manual uv install).
//
// Set UV_LOCAL=/path/to/uv to copy an existing local binary instead of downloading.
// Set UV_VERSION to pin a release (default 0.12.3). Set UV_MIRROR to override the
// download base URL (e.g. a GitHub proxy).
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, renameSync, chmodSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VERSION = process.env.UV_VERSION || '0.12.3';

const TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
};

const platform = process.platform;
const arch = process.arch;
const triple = TRIPLES[`${platform}-${arch}`];
if (!triple) {
  console.error(`Unsupported platform/arch for uv: ${platform}/${arch}`);
  process.exit(1);
}

const isWin = platform === 'win32';
const ext = isWin ? 'zip' : 'tar.gz';
const binName = isWin ? 'uv.exe' : 'uv';
const dest = path.join(ROOT, 'resources', 'uv');
const finalBin = path.join(dest, binName);

async function main() {
  mkdirSync(dest, { recursive: true });
  if (existsSync(finalBin)) {
    console.log(`uv already present at ${finalBin} — skipping.`);
    return;
  }

  // Fast path: copy a local uv binary (offline builds).
  if (process.env.UV_LOCAL) {
    if (!existsSync(process.env.UV_LOCAL)) throw new Error(`UV_LOCAL not found: ${process.env.UV_LOCAL}`);
    copyFileSync(process.env.UV_LOCAL, finalBin);
    chmodSync(finalBin, 0o755);
    console.log(`Copied uv from ${process.env.UV_LOCAL} → ${finalBin}`);
    return;
  }

  const dirname = `uv-${triple}`;
  const base = process.env.UV_MIRROR || 'https://github.com/astral-sh/uv/releases/download';
  const url = `${base}/${VERSION}/${dirname}.${ext}`;

  const tmp = mkdtempSync(path.join(tmpdir(), 'dsh-uv-'));
  const archive = path.join(tmp, `uv.${ext}`);
  console.log(`Downloading ${url} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));

  console.log(`Extracting to ${tmp} …`);
  execFileSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' });

  // Unix tarballs contain a `uv-<triple>/` directory wrapper; the Windows zip
  // drops uv.exe at the archive root. Locate the binary either way.
  const srcBin = isWin
    ? path.join(tmp, binName)
    : path.join(tmp, dirname, binName);
  if (!existsSync(srcBin)) throw new Error(`uv binary not found at ${srcBin}`);

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  renameSync(srcBin, finalBin);
  if (!isWin) chmodSync(finalBin, 0o755);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`Installed uv ${VERSION} → ${finalBin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
