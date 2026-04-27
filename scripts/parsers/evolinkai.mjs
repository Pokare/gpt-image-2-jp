// Parser for EvoLinkAI/awesome-gpt-image-2-prompts
// Format:
//   ### Case N: [Title](twitter-url) (by [@handle](handle-url))
//
//   image
//   ![alt](image-url)
//
//   ```
//   prompt body
//   ```

export function parse(md, source) {
  // Extract section context (## Heading) for each entry
  const sectionMatches = [...md.matchAll(/^##\s+(.+?)$/gm)];

  // Find each "### Case N: ..." entry
  const entryRegex = /^### Case (\d+):\s*(?:\[([^\]]+)\]\(([^)]+)\))?\s*(?:\(by\s*\[([^\]]+)\]\(([^)]+)\)\))?/gm;
  const matches = [...md.matchAll(entryRegex)];
  const entries = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const block = md.slice(start, end);

    // Find the most recent ## section above this entry
    let category = null;
    for (let s = sectionMatches.length - 1; s >= 0; s--) {
      if (sectionMatches[s].index < start) {
        category = sectionMatches[s][1].replace(/^\W+/, '').trim();
        // Skip TOC, meta sections
        if (/table of contents|toc|introduction|how to|contribute|license|footer/i.test(category)) {
          category = null;
        }
        break;
      }
    }

    const caseNo = parseInt(m[1], 10);
    const title = (m[2] || `Case ${caseNo}`).trim();
    const sourceUrl = m[3] || null;
    const authorHandle = m[4] || null;
    const authorUrl = m[5] || null;

    // Extract images: ![alt](url) — but skip badge images (img.shields.io)
    const imgMatches = [...block.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)];
    const images = imgMatches
      .filter(im => !im[2].includes('img.shields.io') && !im[2].includes('badge'))
      .map(im => ({ src: im[2], alt: im[1] || title }));

    // Extract prompt code block (first ``` block)
    const promptMatch = block.match(/```(?:[a-zA-Z]*)\n([\s\S]*?)\n```/);
    const prompt = promptMatch ? promptMatch[1].trim() : '';

    if (!prompt) continue; // skip entries without a usable prompt

    // Description is rarely present in EvoLinkAI; entries are mostly title+image+prompt.
    // Skip extraction entirely to avoid table cells, badges, etc. polluting the field.
    const description = '';

    entries.push({
      sourceId: source.id,
      sourceSection: 'all',
      no: caseNo,
      title,
      titleOriginal: title,
      category,
      categoryOriginal: category,
      isFeatured: false,
      isRaycast: false,
      description,
      descriptionOriginal: description,
      prompt: '',          // filled by translation
      promptOriginal: prompt,
      images,
      author: authorHandle ? { name: authorHandle, url: authorUrl } : null,
      sourcePost: sourceUrl ? { label: 'X (Twitter)', url: sourceUrl } : null,
      published: null,
      externalGalleryUrl: null,
    });
  }

  return entries;
}
