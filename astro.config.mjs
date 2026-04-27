import { defineConfig } from 'astro/config';

// site/base will be set after we create the GitHub repo and know the user/repo names.
// For now, use a relative-friendly setup. We'll inject these via env at build time.
const SITE = process.env.SITE_URL || 'https://pokare.github.io';
const BASE = process.env.BASE_PATH || '/gpt-image-2-jp';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
});
