// Parser for Anil-matcha/Awesome-GPT-Image-2-API-Prompts
// Format:
//   ## Section Heading
//   ### Title
//   **Prompt:**
//   ```
//   prompt body
//   ```
//   **Source:** [@handle](url)

export function parse(md, source) {
  const sectionMatches = [...md.matchAll(/^##\s+(.+?)$/gm)];
  const entryRegex = /^### (.+?)$/gm;
  const matches = [...md.matchAll(entryRegex)];
  const entries = [];

  let entryNo = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const block = md.slice(start, end);

    const title = m[1].trim();
    // Skip if title looks like a section/meta heading
    if (/^(table of contents|toc|how to|introduction|contributing|license)/i.test(title)) continue;

    let category = null;
    for (let s = sectionMatches.length - 1; s >= 0; s--) {
      if (sectionMatches[s].index < start) {
        category = sectionMatches[s][1].replace(/^\W+/, '').trim();
        if (/table of contents|toc|introduction|how to|contribute|license|footer|resources/i.test(category)) {
          category = null;
        }
        break;
      }
    }

    // Prompt body (first ``` after **Prompt:**)
    const promptMatch = block.match(/\*\*Prompt:\*\*\s*\n*```(?:[a-zA-Z]*)\n([\s\S]*?)\n```/);
    const prompt = promptMatch ? promptMatch[1].trim() : '';

    if (!prompt) continue;

    // Source attribution
    const sourceMatch = block.match(/\*\*Source:\*\*\s*\[([^\]]+)\]\(([^)]+)\)/);

    // Images (often there are no images in this repo — prompt-only)
    const imgMatches = [...block.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)];
    const images = imgMatches
      .filter(im => !im[2].includes('img.shields.io'))
      .map(im => ({ src: im[2], alt: im[1] || title }));

    entryNo++;
    entries.push({
      sourceId: source.id,
      sourceSection: 'all',
      no: entryNo,
      title,
      titleOriginal: title,
      category,
      categoryOriginal: category,
      isFeatured: false,
      isRaycast: false,
      description: '',
      descriptionOriginal: '',
      prompt: '',
      promptOriginal: prompt,
      images,
      author: sourceMatch ? { name: sourceMatch[1], url: sourceMatch[2] } : null,
      sourcePost: sourceMatch ? { label: sourceMatch[1], url: sourceMatch[2] } : null,
      published: null,
      externalGalleryUrl: null,
    });
  }

  return entries;
}
