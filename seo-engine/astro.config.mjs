// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// URL đã từng công khai mà nay đổi slug PHẢI có redirect, nếu không nginx sẽ trả trang
// blog index với mã 200 — Google đọc thành nội dung trùng lặp thay vì thấy bài đã dời.
// Khai báo trong config/redirects.json để việc sửa slug không phải đụng vào file config này.
const { redirects: redirectList } = JSON.parse(readFileSync('./config/redirects.json', 'utf8'));
const redirects = Object.fromEntries(redirectList.map(({ from, to }) => [from, to]));

// https://astro.build/config
export default defineConfig({
  site: 'https://autotaxpos.com',
  redirects,
  integrations: [sitemap()],

  vite: {
    plugins: [tailwindcss()]
  }
});