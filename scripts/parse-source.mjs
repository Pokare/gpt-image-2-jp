#!/usr/bin/env node
// Parse Japanese README into structured JSON
// Source: https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_ja-JP.md

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = process.argv[2] || '/tmp/source-readme-ja.md';
const OUT_DIR = resolve(ROOT, 'src/data');

const md = readFileSync(SOURCE, 'utf8');

const totalMatch = md.match(/\|\s*📝\s*(?:Total Prompts|プロンプト総数)\s*\|\s*\*\*(\d+)\*\*/);
const featuredCountMatch = md.match(/\|\s*⭐\s*(?:Featured|注目|おすすめ)\s*\|\s*\*\*(\d+)\*\*/);
const lastUpdatedMatch = md.match(/(?:Last updated|最終更新)[：:]\s*([^\s<]+)/);

const featuredHeadingIdx = md.search(/^##\s*🔥\s+/m);
const allPromptsHeadingIdx = md.search(/^##\s*📋\s+/m);
const otherHeadingIdx = md.search(/^##\s*📚\s+/m);
const endIdx = md.search(/^##\s*🤝\s+/m); // contributing section marks the end of prompt data

function parseSection(text) {
  const entryRegex = /^### No\. (\d+):\s*(.+?)$/gm;
  const entries = [];
  const matches = [...text.matchAll(entryRegex)];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, end);

    const no = parseInt(m[1], 10);
    let title = m[2].trim();

    let category = null;
    const catSplit = title.match(/^(.+?)\s+-\s+(.+)$/);
    if (catSplit) {
      category = catSplit[1].trim();
      title = catSplit[2].trim();
    }

    const badgeMatches = [...block.matchAll(/!\[([^\]]+)\]\(https:\/\/img\.shields\.io\/badge\/([^)]+)\)/g)];
    const badges = badgeMatches.map(b => b[1]);
    const isFeatured = badges.some(b => b.includes('Featured'));
    const isRaycast = badges.some(b => b.includes('Raycast'));
    const language = (badges.find(b => b.startsWith('Language-')) || 'Language-EN').replace('Language-', '');

    const descMatch = block.match(/####\s*📖\s*説明\s*\n+([\s\S]*?)(?=\n####\s|\n---|$)/);
    const description = descMatch ? descMatch[1].trim() : '';

    const promptMatch = block.match(/####\s*📝\s*プロンプト\s*\n+```[a-zA-Z]*\n([\s\S]*?)\n```/);
    const prompt = promptMatch ? promptMatch[1] : '';

    const imgMatches = [...block.matchAll(/<img\s+src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*>/g)];
    const images = imgMatches.map(im => ({ src: im[1], alt: im[2] }));

    const authorMatch = block.match(/\*\*作者:\*\*\s*\[([^\]]+)\]\(([^)]+)\)/);
    const sourceMatch = block.match(/\*\*ソース:\*\*\s*\[([^\]]+)\]\(([^)]+)\)/);
    const publishedMatch = block.match(/\*\*公開日:\*\*\s*([^\n]+)/);
    const tryMatch = block.match(/\[👉 今すぐ試す →\]\(([^)]+)\)/);

    entries.push({
      no,
      title,
      category,
      language,
      isFeatured,
      isRaycast,
      description,
      prompt,
      images,
      author: authorMatch ? { name: authorMatch[1], url: authorMatch[2] } : null,
      source: sourceMatch ? { label: sourceMatch[1], url: sourceMatch[2] } : null,
      tryItUrl: tryMatch ? tryMatch[1] : null,
      published: publishedMatch ? publishedMatch[1].trim() : null,
    });
  }
  return entries;
}

// Slice each section
const featuredEnd = allPromptsHeadingIdx !== -1 ? allPromptsHeadingIdx : (otherHeadingIdx !== -1 ? otherHeadingIdx : endIdx);
const allEnd = otherHeadingIdx !== -1 ? otherHeadingIdx : endIdx;
const otherEnd = endIdx !== -1 ? endIdx : md.length;

const featuredText = featuredHeadingIdx !== -1 ? md.slice(featuredHeadingIdx, featuredEnd) : '';
const allText = allPromptsHeadingIdx !== -1 ? md.slice(allPromptsHeadingIdx, allEnd) : '';
const otherText = otherHeadingIdx !== -1 ? md.slice(otherHeadingIdx, otherEnd) : '';

const featuredEntries = parseSection(featuredText).map(e => ({ ...e, _section: 'featured', isFeatured: true }));
const allEntries = parseSection(allText).map(e => ({ ...e, _section: 'all', isFeatured: false }));
const otherEntries = parseSection(otherText).map(e => ({ ...e, _section: 'other', isFeatured: false }));

// `No.` resets per section (featured uses 1..6, all uses 1..N, other uses 1..M).
// Build a stable globally-unique id from (section, no).
const all = [...featuredEntries, ...allEntries, ...otherEntries];
const merged = all.map((e, idx) => ({
  id: `${e._section}-${e.no}`,
  globalIndex: idx + 1,
  ...e,
}));
const categories = [...new Set(merged.map(e => e.category).filter(Boolean))].sort();

const meta = {
  totalPromptsUpstream: totalMatch ? parseInt(totalMatch[1], 10) : null,
  featuredCountUpstream: featuredCountMatch ? parseInt(featuredCountMatch[1], 10) : null,
  lastUpdatedUpstream: lastUpdatedMatch ? lastUpdatedMatch[1] : null,
  curatedCount: merged.length,
  totalImages: merged.reduce((s, e) => s + e.images.length, 0),
  parsedAt: new Date().toISOString(),
  sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2',
  sourceLicense: 'CC BY 4.0',
  sourceAuthor: 'YouMind OpenLab',
  categories,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'prompts.json'), JSON.stringify(merged, null, 2));
writeFileSync(resolve(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

console.log(`Parsed ${merged.length} entries (upstream claims ${meta.totalPromptsUpstream})`);
console.log(`  Featured: ${merged.filter(e => e.isFeatured).length} (upstream claims ${meta.featuredCountUpstream})`);
console.log(`  Total images: ${meta.totalImages}`);
console.log(`  Categories: ${categories.length}`);
console.log(`  Sample categories:`, categories.slice(0, 8));
console.log(`  Last upstream update: ${meta.lastUpdatedUpstream}`);
