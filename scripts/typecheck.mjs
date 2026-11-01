#!/usr/bin/env node
// Static integrity check for a plain-JS codebase: every relative import must
// resolve, every named import must be exported, every module script referenced
// by an HTML page must exist, and every manifest icon must exist.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(ROOT);
const jsFiles = all.filter((file) => /\.(?:js|mjs)$/.test(file));
const htmlFiles = all.filter((file) => file.endsWith('.html'));
const manifests = all.filter((file) => file.endsWith('manifest.webmanifest'));

let problems = 0;
function fail(message) {
  problems += 1;
  console.error(`✖ ${message}`);
}

const EXPORT_RE = (name) => new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`);
const EXPORT_LIST_RE = (name) => new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`);

for (const file of jsFiles) {
  const source = readFileSync(file, 'utf8');
  const importRe = /import\s+(?:([\w*\s{},]+?)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(source))) {
    const spec = match[2];
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec.split('?')[0]);
    if (!existsSync(target)) {
      fail(`${relative(ROOT, file)} imports missing file ${spec}`);
      continue;
    }
    const clause = match[1];
    if (!clause || target.endsWith('.json')) continue;
    const targetSource = readFileSync(target, 'utf8');
    const names = clause.replace(/[{}]/g, ',').split(',')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('*'))
      .map((part) => part.split(/\s+as\s+/)[0].trim());
    for (const name of names) {
      if (!EXPORT_RE(name).test(targetSource) && !EXPORT_LIST_RE(name).test(targetSource)) {
        fail(`${relative(ROOT, file)} imports ${name}, which ${spec} does not export`);
      }
    }
  }
}

for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = scriptRe.exec(source))) {
    const src = match[1];
    if (/^(?:https?:)?\/\//.test(src)) continue;
    const target = resolve(dirname(file), src.split('?')[0]);
    if (!existsSync(target)) fail(`${relative(ROOT, file)} references missing script ${src}`);
  }
}

for (const file of manifests) {
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    for (const icon of manifest.icons || []) {
      const target = resolve(dirname(file), String(icon.src || '').split('?')[0]);
      if (!existsSync(target)) fail(`${relative(ROOT, file)} references missing icon ${icon.src}`);
    }
  } catch (err) {
    fail(`${relative(ROOT, file)} is not valid JSON: ${err.message}`);
  }
}

if (problems) {
  console.error(`\ntypecheck failed: ${problems} problem(s)`);
  process.exit(1);
}
console.log(`typecheck: ${jsFiles.length} module(s), ${htmlFiles.length} page(s), ${manifests.length} manifest(s) verified`);
