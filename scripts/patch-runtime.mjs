#!/usr/bin/env node
// Patch the dsh conversation UI's i18n bundle: rename the hero headline
// ("探索未至之境") to "金蝶云星空助手".
//
// This runs AFTER `npm run runtime:install` (npm would overwrite it) and BEFORE
// `npm run runtime:pack`, so the single-file runtime archive carries the rename.
// The patch is keyed on `hero.headline` (regex, any value) so a dsh upgrade that
// rewords the default still gets renamed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const FILE = path.join(
  ROOT,
  'resources', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js',
);
const KEY = /"hero\.headline"\s*:\s*"[^"]*"/;
const NEW_HEADLINE = '"hero.headline": "金蝶云星空助手"';

if (!existsSync(FILE)) {
  console.error(`dsh conversation UI not found at ${FILE} — run "npm run runtime:install" first.`);
  process.exit(1);
}

const src = readFileSync(FILE, 'utf8');
const matches = src.match(KEY);
if (!matches) {
  console.warn(`[patch-runtime] warning: "hero.headline" not found in ${FILE} — dsh may have changed its i18n keys, rename skipped.`);
  process.exit(0);
}
if (matches[0] === NEW_HEADLINE) {
  console.log('[patch-runtime] headline already patched, skipping.');
} else {
  writeFileSync(FILE, src.replace(KEY, NEW_HEADLINE));
  console.log(`[patch-runtime] patched: ${matches[0]} → ${NEW_HEADLINE}`);
}
