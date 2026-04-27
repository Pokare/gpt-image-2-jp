// Parser for YouMind-OpenLab/awesome-gpt-image-2 (Japanese README)
// Format: ### No. N: Title, sections "📖 説明", "📝 プロンプト", "🖼️ 生成画像", "📌 詳細"

export function parse(md, source) {
  const featuredHeadingIdx = md.search(/^##\s*🔥\s+/m);
  const allPromptsHeadingIdx = md.search(/^##\s*📋\s+/m);
  const otherHeadingIdx = md.search(/^##\s*📚\s+/m);
  const endIdx = md.search(/^##\s*🤝\s+/m);

  const featuredEnd = allPromptsHeadingIdx !== -1 ? allPromptsHeadingIdx : (otherHeadingIdx !== -1 ? otherHeadingIdx : endIdx);
  const allEnd = otherHeadingIdx !== -1 ? otherHeadingIdx : endIdx;
  const otherEnd = endIdx !== -1 ? endIdx : md.length;

  const featuredText = featuredHeadingIdx !== -1 ? md.slice(featuredHeadingIdx, featuredEnd) : '';
  const allText = allPromptsHeadingIdx !== -1 ? md.slice(allPromptsHeadingIdx, allEnd) : '';
  const otherText = otherHeadingIdx !== -1 ? md.slice(otherHeadingIdx, otherEnd) : '';

  function parseSection(text, sectionLabel) {
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
      const isRaycast = badges.some(b => b.includes('Raycast'));

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
        sourceId: source.id,
        sourceSection: sectionLabel,
        no,
        title,
        category,
        isFeatured: sectionLabel === 'featured',
        isRaycast,
        description,
        prompt,
        promptOriginal: prompt,
        images,
        author: authorMatch ? { name: authorMatch[1], url: authorMatch[2] } : null,
        sourcePost: sourceMatch ? { label: sourceMatch[1], url: sourceMatch[2] } : null,
        published: publishedMatch ? publishedMatch[1].trim() : null,
        externalGalleryUrl: tryMatch ? tryMatch[1] : null,
      });
    }
    return entries;
  }

  const featured = parseSection(featuredText, 'featured');
  const all = parseSection(allText, 'all');
  const other = parseSection(otherText, 'other');

  return [...featured, ...all, ...other];
}
