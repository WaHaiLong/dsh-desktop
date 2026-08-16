#!/usr/bin/env node
// 下载量数据分析:从 GitHub Releases API(经 gh 认证)拉取各资产下载量,
// 输出按版本/按平台的汇总,并与上次运行的快照对比出趋势。
//
// 用法:
//   node scripts/download-analytics.mjs            # 文本汇总 + 趋势
//   node scripts/download-analytics.mjs --json     # 结构化数据
//
// 快照存在 .analytics-snapshots.json(已 gitignore),每次运行记录一次。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SNAP_FILE = path.join(ROOT, '.analytics-snapshots.json');

const OWNER = 'WaHaiLong';
const REPO = 'dsh-desktop';
const API = `repos/${OWNER}/${REPO}/releases?per_page=100`;

function platformOf(name) {
  if (name.includes('windows')) return 'Windows';
  if (name.includes('mac') || name.includes('.dmg')) return 'macOS';
  if (name.includes('linux') || name.includes('AppImage') || name.includes('.deb')) return 'Linux';
  return '其他';
}

function isInstaller(name) {
  return /\.(exe|zip|dmg|AppImage|deb)$/.test(name);
}

function loadSnapshot() {
  try { return existsSync(SNAP_FILE) ? JSON.parse(readFileSync(SNAP_FILE, 'utf8')) : null; }
  catch (_) { return null; }
}

function saveSnapshot(snap) {
  const list = loadSnapshotList();
  list.push({ ts: new Date().toISOString(), ...snap });
  writeFileSync(SNAP_FILE, JSON.stringify(list.slice(-60), null, 2)); // 只留最近 60 条
}

function loadSnapshotList() {
  try { return existsSync(SNAP_FILE) ? JSON.parse(readFileSync(SNAP_FILE, 'utf8')) : []; }
  catch (_) { return []; }
}

function main() {
  const raw = execFileSync('gh', ['api', API, '--paginate'], { encoding: 'utf8' });
  const releases = JSON.parse(raw);
  if (!Array.isArray(releases) || releases.length === 0) throw new Error('no releases');

  const rows = [];
  const platTotal = {};
  let grand = 0;

  for (const rel of releases) {
    const tag = rel.tag_name;
    const installers = (rel.assets || []).filter((a) => isInstaller(a.name));
    const relTotal = installers.reduce((s, a) => s + a.download_count, 0);
    if (relTotal === 0) continue;
    rows.push({ tag, total: relTotal, assets: installers.map((a) => ({ name: a.name, count: a.download_count, plat: platformOf(a.name) })) });
    for (const a of installers) platTotal[platformOf(a.name)] = (platTotal[platformOf(a.name)] || 0) + a.download_count;
    grand += relTotal;
  }
  rows.sort((a, b) => (a.tag < b.tag ? 1 : -1));

  // 快照对比:用上一份快照算各平台/总量增量。
  const prev = loadSnapshotList();
  const last = prev.length ? prev[prev.length - 1] : null;
  const delta = (key) => last && last.byPlatform && last.byPlatform[key] != null ? platTotal[key] - last.byPlatform[key] : null;

  // 保存本次快照(不因 `--json` 分支而跳过,趋势依赖它)。
  saveSnapshot({ total: grand, byPlatform: platTotal });

  const isJson = process.argv.includes('--json');
  if (isJson) {
    console.log(JSON.stringify({ grand, releases: rows, byPlatform: platTotal, previous: last || null, snapshots: prev.length }, null, 2));
    return;
  }

  console.log(`\n📊 下载量分析 · ${OWNER}/${REPO}   (数据源: GitHub Releases download_count)\n`);

  console.log('── 按版本 ──────────────────────────────────────────────');
  for (const r of rows) {
    console.log(`  ${r.tag.padEnd(10)} ${String(r.total).padStart(5)} 次`);
    for (const a of r.assets.sort((x, y) => y.count - x.count)) {
      console.log(`      ${a.plat.padEnd(8)} ${String(a.count).padStart(5)}  ${a.name}`);
    }
  }

  console.log('\n── 按平台(含较上次增量)──────────────────────────────');
  const sorted = Object.entries(platTotal).sort((a, b) => b[1] - a[1]);
  const maxLen = Math.max(...sorted.map(([k]) => k.length));
  for (const [plat, n] of sorted) {
    const pct = grand ? ((n / grand) * 100).toFixed(1) : '0';
    const bar = '█'.repeat(Math.round((n / grand) * 20));
    const d = delta(plat);
    const deltaTxt = d === null ? '' : d === 0 ? '  (0)' : d > 0 ? `  (+${d})` : `  (${d})`;
    console.log(`  ${plat.padEnd(maxLen)} ${String(n).padStart(5)} 次  ${pct.padStart(4)}%  ${bar}${deltaTxt}`);
  }
  const dGrand = last ? grand - last.total : null;
  const gDelta = dGrand === null ? '' : dGrand === 0 ? '  (0)' : dGrand > 0 ? `  (+${dGrand})` : `  (${dGrand})`;
  console.log(`\n  合计: ${grand} 次下载${gDelta}`);
  console.log(`  快照: 已保存 ${prev.length + 1} 份(最多 60),上次 ${last ? last.ts.slice(0, 16).replace('T', ' ') : '—'}\n`);
}

try {
  main();
} catch (err) {
  console.error(`分析失败: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
