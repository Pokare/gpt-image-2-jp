#!/usr/bin/env node
// Multi-source parser: fetches each source's README, parses, applies translation cache, merges.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'src/data');
const CACHE_PATH = resolve(OUT_DIR, 'translations-cache.json');
const SOURCES_PATH = resolve(OUT_DIR, 'sources.json');

const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));

// Resolve cached MD files: scripts pre-fetch sources to /tmp/source-<id>.md
function loadSourceMd(source) {
  const cachePath = `/tmp/source-${source.id}.md`;
  if (!existsSync(cachePath)) {
    throw new Error(`Source MD not found: ${cachePath}. Run: npm run fetch-source first.`);
  }
  return readFileSync(cachePath, 'utf8');
}

const translationsCache = existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  : {};

function promptHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// Canonical category names — normalize varying translations to a stable label.
// Patterns matched are checked top-to-bottom; first match wins.
const CATEGORY_RULES = [
  [/ポートレート|ポトレ|portrait|フォトグラフィ/i, 'ポートレート / 写真'],
  [/ポスター|illust|イラスト/i, 'ポスター / イラスト'],
  [/ゲーム|エンタメ|エンターテイ|game|entertain/i, 'ゲーム / エンタメ'],
  [/UI|UX|モックアップ|mockup|app/i, 'UI / アプリモックアップ'],
  [/キャラクター|character|reference sheet|設定資料/i, 'キャラクターデザイン'],
  [/インフォグラフィック|infographic|タイポグラフィ|typography|教育/i, 'インフォグラフィック / 教育'],
  [/コミック|comic|storyboard|ストーリーボード|漫画|マンガ/i, 'コミック / ストーリーボード'],
  [/SNS|social media|ソーシャル/i, 'ソーシャルメディア'],
  [/youtube|サムネ/i, 'YouTube サムネイル'],
  [/プロダクト|product market|マーケティング/i, 'プロダクトマーケティング'],
  [/E.?コマース|e-?commerce|EC/i, 'Eコマース'],
  [/プロフィール|アバター|avatar|profile/i, 'プロフィール / アバター'],
  [/編集|スタイル変換|style transfer|edit/i, '画像編集 / スタイル変換'],
];

function normalizeCategory(cat) {
  if (!cat) return null;
  for (const [pattern, canonical] of CATEGORY_RULES) {
    if (pattern.test(cat)) return canonical;
  }
  // Fallback: strip common suffixes
  return cat.replace(/(事例|ケース|cases?)\s*$/i, '').trim() || cat;
}

const allEntries = [];
const stats = { perSource: {}, missingTranslations: [] };

for (const source of sources) {
  const md = loadSourceMd(source);
  const parserModule = await import(`./parsers/${source.format.replace(/-ja$/, '')}.mjs`);
  let entries = parserModule.parse(md, source);

  // Apply translations from cache for sources that need it
  if (source.needsTranslation) {
    entries = entries.map((e) => {
      const hash = promptHash(e.promptOriginal);
      const cached = translationsCache[hash];
      if (cached) {
        return {
          ...e,
          title: cached.title || e.titleOriginal,
          description: cached.description || '',
          prompt: cached.prompt || e.promptOriginal,
          category: cached.category || e.categoryOriginal,
          translationStatus: 'translated',
        };
      } else {
        // No translation yet — keep originals, mark for later
        stats.missingTranslations.push({ sourceId: source.id, no: e.no, title: e.titleOriginal, hash });
        return {
          ...e,
          title: e.titleOriginal,
          description: '',
          prompt: e.promptOriginal,
          category: e.categoryOriginal,
          translationStatus: 'pending',
        };
      }
    });
  } else {
    entries = entries.map((e) => ({ ...e, translationStatus: 'native' }));
  }

  // Add stable id and normalize category
  entries = entries.map((e) => ({
    id: `${source.id}-${e.sourceSection || 'all'}-${e.no}`,
    sourceMeta: {
      id: source.id,
      name: source.name,
      url: source.url,
      stars: source.stars,
      color: source.color,
    },
    ...e,
    category: normalizeCategory(e.category),
  }));

  stats.perSource[source.id] = {
    name: source.name,
    parsed: entries.length,
    needsTranslation: source.needsTranslation,
  };

  allEntries.push(...entries);
}

// Dedup by promptOriginal hash — when the same prompt appears in multiple sources,
// keep the highest-star source's entry but record all source attributions.
const byHash = new Map();
for (const e of allEntries) {
  const h = promptHash(e.promptOriginal);
  const existing = byHash.get(h);
  if (!existing) {
    byHash.set(h, { ...e, alsoFoundIn: [] });
  } else {
    if (e.sourceMeta.stars > existing.sourceMeta.stars) {
      // Promote this entry, demote previous
      const prevSourceMeta = existing.sourceMeta;
      byHash.set(h, {
        ...e,
        alsoFoundIn: [...(existing.alsoFoundIn || []), prevSourceMeta, ...(existing.alsoFoundIn || [])],
      });
    } else {
      existing.alsoFoundIn = [...(existing.alsoFoundIn || []), e.sourceMeta];
    }
  }
}

// Drop entries without sample images — useless on a visual curation site.
const beforeFilter = byHash.size;
const merged = [...byHash.values()].filter(e => Array.isArray(e.images) && e.images.length > 0);
const droppedNoImages = beforeFilter - merged.length;

// Sort: featured first, then by source stars desc, then by no
const sectionOrder = { featured: 0, all: 1, other: 2 };
merged.sort((a, b) => {
  const so = (sectionOrder[a.sourceSection] ?? 99) - (sectionOrder[b.sourceSection] ?? 99);
  if (so !== 0) return so;
  const ss = (b.sourceMeta.stars || 0) - (a.sourceMeta.stars || 0);
  if (ss !== 0) return ss;
  return a.no - b.no;
});

// Compute aggregates
const allCategories = [...new Set(merged.map(e => e.category).filter(Boolean))].sort();
const totalImages = merged.reduce((s, e) => s + (e.images?.length || 0), 0);
const translated = merged.filter(e => e.translationStatus === 'translated').length;
const pending = merged.filter(e => e.translationStatus === 'pending').length;
const native = merged.filter(e => e.translationStatus === 'native').length;

// Last-updated detection (per-source)
const lastUpdatedBySource = {};
for (const source of sources) {
  const md = loadSourceMd(source);
  const m = md.match(/(?:Last updated|最終更新)[：:]\s*([^\s<]+)/);
  lastUpdatedBySource[source.id] = m ? m[1] : null;
}

// Per-source displayed counts (after image filter and dedup)
const displayedBySource = {};
for (const e of merged) {
  displayedBySource[e.sourceMeta.id] = (displayedBySource[e.sourceMeta.id] || 0) + 1;
}

const meta = {
  curatedCount: merged.length,
  totalImages,
  translated,
  pending,
  native,
  droppedNoImages,
  categories: allCategories,
  sources: sources
    .map(s => ({
      id: s.id,
      name: s.name,
      fullName: s.fullName,
      url: s.url,
      stars: s.stars,
      color: s.color,
      lastUpdated: lastUpdatedBySource[s.id],
      parsed: stats.perSource[s.id]?.parsed || 0,
      displayed: displayedBySource[s.id] || 0,
    }))
    .filter(s => s.displayed > 0),  // hide sources contributing zero displayed entries
  parsedAt: new Date().toISOString(),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'prompts.json'), JSON.stringify(merged, null, 2));
writeFileSync(resolve(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

// Write a sidecar file with entries that need translation (for the translator script)
const pendingForTranslation = stats.missingTranslations.map(item => {
  const entry = allEntries.find(e => e.sourceId === item.sourceId && e.no === item.no);
  return {
    hash: item.hash,
    sourceId: item.sourceId,
    no: item.no,
    titleOriginal: entry.titleOriginal,
    categoryOriginal: entry.categoryOriginal,
    promptOriginal: entry.promptOriginal,
  };
});
writeFileSync(resolve(OUT_DIR, 'pending-translations.json'), JSON.stringify(pendingForTranslation, null, 2));

console.log(`Parsed ${merged.length} unique entries from ${sources.length} sources (${droppedNoImages} dropped: no preview image)`);
for (const [sid, s] of Object.entries(stats.perSource)) {
  console.log(`  ${s.name}: ${s.parsed} entries${s.needsTranslation ? ' (needs translation)' : ''}`);
}
console.log(`Translation status: ${native} native + ${translated} translated + ${pending} pending`);
console.log(`Total images: ${totalImages}`);
console.log(`Categories: ${allCategories.length}`);
if (pending > 0) {
  console.log(`\n⚠ ${pending} entries need translation. Wrote pending list to:`);
  console.log(`  ${resolve(OUT_DIR, 'pending-translations.json')}`);
}
