#!/usr/bin/env node
// Repository lint: syntax-check every module and reject accidental debugging
// leftovers. No third-party dependency required, so it runs in CI as-is.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(?:js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

let failures = 0;
const files = walk(ROOT);

for (const file of files) {
  const rel = relative(ROOT, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failures += 1;
    console.error(`✖ syntax: ${rel}`);
    console.error(String(err.stderr || err.message).trim());
    continue;
  }
  const source = readFileSync(file, 'utf8');
  source.split('\n').forEach((line, index) => {
    if (/^\s*debugger\s*;?\s*$/.test(line)) {
      failures += 1;
      console.error(`✖ debugger statement: ${rel}:${index + 1}`);
    }
  });
}

if (failures) {
  console.error(`\nlint failed: ${failures} problem(s)`);
  process.exit(1);
}
console.log(`lint: ${files.length} module(s) checked, no problems`);
