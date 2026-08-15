#!/usr/bin/env node
// Pack the dsh runtime (resources/dsh/node_modules — ~33k small files) into a SINGLE
// tar.gz archive (resources/dsh-runtime.tar.gz).
//
// Why: the installer then ships ONE file instead of 33k. Windows packaging is I/O-bound
// per small file (NTFS + Defender), so copying 33k files made Windows builds take 30+ min.
// A single archive makes Windows packaging take minutes. main.cjs extracts it on first run.
//
// Gzip is still worth it (~30-40MB off a ~340MB runtime) and is fast on the already-
// incompressible binaries; plain store would save nothing and still read every file.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SRC = path.join(ROOT, 'resources', 'dsh', 'node_modules');
const DEST = path.join(ROOT, 'resources', 'dsh-runtime.tar.gz');

if (!existsSync(SRC)) {
  console.error(`dsh runtime not found at ${SRC} — run "npm run runtime:install" first.`);
  process.exit(1);
}

// Windows 上的 npm 会在 node_modules 里生成一个指向仓库根的自链接
// `node_modules/<根包名>`(macOS 的 npm 不生成)。tar 时若不排除,Windows 的
// bsdtar 会跟随该链接把整个仓库(含正在写入的 dsh-runtime.tar.gz 自身)递归打包,
// 报 "Can't add archive to itself"。故排除该条目,两个平台行为一致。
const rootPkgName = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;
const selfLinkExclude = `--exclude=node_modules/${rootPkgName}`;

console.log(`Packing ${SRC} → ${DEST} … (excluding ${selfLinkExclude})`);
execFileSync(
  'tar',
  ['-czf', DEST, '-C', path.dirname(SRC), selfLinkExclude, 'node_modules'],
  { stdio: 'inherit' },
);
console.log('Done.');
