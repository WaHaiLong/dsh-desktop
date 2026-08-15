#!/usr/bin/env node
// Patch the dsh runtime after `npm run runtime:install` and before `npm run runtime:pack`,
// so the single-file runtime archive carries the「金蝶云星空助手」branding.
//
// The runtime is DeepSeek's product (dsh / @deepseek-ai/*). We keep its engine but
// re-brand the user-facing surfaces:
//   - conversation hero headline        ("探索未至之境" → 金蝶云星空助手)
//   - AI system-prompt identity         (AI 自称 DeepSeek → 金蝶云星空助手)
//   - connection/provider display names (侧栏/提供商显示 DeepSeek → 金蝶云星空助手)
//   - setup empty-state hint
//
// All replacements are exact-string and keyed on a distinctive substring, so a dsh
// upgrade that rewords any of them just skips that entry (warn) instead of corrupting
// the bundle. Model IDs (deepseek-v4-flash, deepseek-chat …) are untouched — only
// display names change.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'resources', 'dsh', 'node_modules');

const BRAND = '金蝶云星空助手';

/** [file, [[from, to], ...]] — from must be an exact substring. */
const PATCHES = [
  // 对话首页大标题
  ['@deepseek-ai/dsh-client-ui-conversation/lib/client.js', [
    [/("hero\.headline"\s*:\s*")[^"]*(")/, `$1${BRAND}$2`],
  ]],
  // AI 系统提示词里的身份声明(这就是 AI 自称 DeepSeek 的来源)
  ['@deepseek-ai/dsh-system-prompt/lib/index.js', [
    ['You are an AI agent powered by DeepSeek Harness.',
     `你是${BRAND},由金蝶云星空提供,专为金蝶云星空 ERP 用户提供智能辅助。`],
  ]],
  // 连接/侧栏品牌(展示名,不动模型 ID)
  ['@deepseek-ai/dsh-client-connection/lib/client.js', [
    ['displayName: "DeepSeek"', `displayName: "${BRAND}"`],
    ['name: "DeepSeek"', `name: "${BRAND}"`],
    ['title: "DeepSeek Harness — plugin-based agent harness"', `title: "${BRAND}"`],
  ]],
  // DeepSeek LLM 提供商展示名
  ['@deepseek-ai/dsh-llm-deepseek/lib/index.js', [
    ['name: "DeepSeek"', `name: "${BRAND}"`],
    ['displayName: "DeepSeek"', `displayName: "${BRAND}"`],
  ]],
  // 设置页模型空态提示
  ['@deepseek-ai/dsh-client-ui-settings-models/lib/client.js', [
    ['配置 DeepSeek 官方模型，即可开始使用。', '配置模型，即可开始使用。'],
  ]],
];

let patched = 0;
let skipped = 0;

for (const [relFile, pairs] of PATCHES) {
  const file = path.join(NM, relFile);
  if (!existsSync(file)) {
    console.warn(`[patch-runtime] skip (missing): ${relFile}`);
    skipped++;
    continue;
  }
  let src = readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of pairs) {
    if (from instanceof RegExp) {
      if (!from.test(src)) { console.warn(`[patch-runtime] not found: ${relFile} ~ ${from}`); skipped++; continue; }
      src = src.replace(from, to);
    } else {
      if (!src.includes(from)) { console.warn(`[patch-runtime] not found: ${relFile} ~ "${from}"`); skipped++; continue; }
      src = src.split(from).join(to);
    }
    changed = true;
    patched++;
  }
  if (changed) writeFileSync(file, src);
}

console.log(`[patch-runtime] done: ${patched} patched, ${skipped} skipped.`);
