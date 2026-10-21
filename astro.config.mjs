import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages 部署：站点根路径 = 仓库名
  site: process.env.SITE_URL || 'https://frankshare.github.io',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  vite: {
    plugins: [tailwindcss()],
  },
});
