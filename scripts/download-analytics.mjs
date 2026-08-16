#!/usr/bin/env node
// 下载量数据分析:从 GitHub API 拉取各 Release 的资产下载量,输出
// 按版本 / 按平台 的汇总。数据源为 releases/<tag>/assets 的 download_count。
//
// 用法:node scripts/download-analytics.mjs [--json]
// 用已认证的 gh CLI 拉数据(未认证 GitHub API 限流 60 次/小时,易 403)。

import { execFileSync } from 'node:child_process';

const OWNER = 'WaHaiLong';
const REPO = 'dsh-desktop';
const API = `repos/${OWNER}/${REPO}/releases?per_page=100`;

/** 按文件名归类平台。 */
function platformOf(name) {
  if (name.includes('windows')) return 'Windows';
  if (name.includes('mac') || name.includes('.dmg')) return 'macOS';
  if (name.includes('linux') || name.includes('AppImage') || name.includes('.deb')) return 'Linux';
  return '其他';
}

/** 归类安装包 vs 辅助文件(blockmap/yml 不算下载)。 */
function isInstaller(name) {
  return /\.(exe|zip|dmg|AppImage|deb)$/.test(name);
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
    const relAssets = rel.assets || [];
    const installers = relAssets.filter((a) => isInstaller(a.name));
    const relTotal = installers.reduce((s, a) => s + a.download_count, 0);
    if (relTotal === 0) continue; // 无下载的版本不占行
    rows.push({ tag, total: relTotal, assets: installers.map((a) => ({ name: a.name, count: a.download_count, plat: platformOf(a.name) })) });
    for (const a of installers) {
      platTotal[platformOf(a.name)] = (platTotal[platformOf(a.name)] || 0) + a.download_count;
    }
    grand += relTotal;
  }

  rows.sort((a, b) => (a.tag < b.tag ? 1 : -1)); // 新版本在前

  const isJson = process.argv.includes('--json');
  if (isJson) {
    console.log(JSON.stringify({ grand, releases: rows, byPlatform: platTotal }, null, 2));
    return;
  }

  console.log(`\n📊 下载量分析 · ${OWNER}/${REPO}  (数据源: GitHub Releases download_count)\n`);
  console.log('── 按版本 ──────────────────────────────────────────────');
  for (const r of rows) {
    console.log(`  ${r.tag.padEnd(10)} ${String(r.total).padStart(5)} 次`);
    for (const a of r.assets.sort((x, y) => y.count - x.count)) {
      console.log(`      ${a.plat.padEnd(8)} ${String(a.count).padStart(5)}  ${a.name}`);
    }
  }
  console.log('\n── 按平台 ──────────────────────────────────────────────');
  const sorted = Object.entries(platTotal).sort((a, b) => b[1] - a[1]);
  const maxLen = Math.max(...sorted.map(([k]) => k.length));
  for (const [plat, n] of sorted) {
    const pct = grand ? ((n / grand) * 100).toFixed(1) : '0';
    const bar = '█'.repeat(Math.round((n / grand) * 20));
    console.log(`  ${plat.padEnd(maxLen)} ${String(n).padStart(5)} 次  ${pct.padStart(4)}%  ${bar}`);
  }
  console.log(`\n  合计: ${grand} 次下载\n`);
}

try {
  main();
} catch (err) {
  console.error(`分析失败: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
