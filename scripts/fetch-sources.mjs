#!/usr/bin/env node
// Fetch all source READMEs to /tmp/source-<id>.md

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sources = JSON.parse(readFileSync(resolve(__dirname, '../src/data/sources.json'), 'utf8'));

await Promise.all(sources.map(async (source) => {
  const res = await fetch(source.rawUrl);
  if (!res.ok) {
    console.error(`Failed to fetch ${source.id}: ${res.status}`);
    process.exit(1);
  }
  const text = await res.text();
  writeFileSync(`/tmp/source-${source.id}.md`, text);
  console.log(`✓ ${source.id}: ${text.length} bytes`);
}));
