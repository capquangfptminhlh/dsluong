import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export async function publishContent(keyword: string, content: string, imageUrl: string) {
  console.log(`[PUB-19] Bắt đầu quá trình đăng bài (Publish) cho từ khóa: ${keyword}`);
  
  try {
    // 1. Lưu file markdown vào thư mục Astro content
    const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${slug}.md`;
    const articlesDir = path.join(process.cwd(), 'src', 'content', 'articles');
    
    if (!fs.existsSync(articlesDir)) {
      fs.mkdirSync(articlesDir, { recursive: true });
    }
    
    const filePath = path.join(articlesDir, filename);
    
    let finalContent = content;
    if (!content.startsWith('---')) {
      const date = new Date().toISOString().split('T')[0];
      const frontmatter = `---
title: "${keyword.charAt(0).toUpperCase() + keyword.slice(1)}"
description: "Bài viết tự động về ${keyword}"
author: "autotax-expert"
date: "${date}"
tags: ["seo", "auto"]
image: "${imageUrl}"
---

![${keyword}](${imageUrl})

`;
      finalContent = frontmatter + content;
    } else {
      // Nếu đã có frontmatter do AI tự tạo, chèn ảnh vào sau frontmatter
      finalContent = content.replace(/---\n/, `image: "${imageUrl}"\n---\n\n![${keyword}](${imageUrl})\n\n`);
    }

    fs.writeFileSync(filePath, finalContent, 'utf-8');
    console.log(`[PUB-19] Đã lưu file nội dung tại: ${filePath}`);

    // 2. Chạy lệnh build Astro để cập nhật website
    console.log(`[PUB-19] Đang build lại website (npm run build)...`);
    execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
    
    console.log(`[PUB-19] ✅ Đăng bài thành công! Website đã được cập nhật bản build mới nhất trong thư mục dist/.`);
    return true;
  } catch (error) {
    console.error(`[PUB-19] ❌ Lỗi khi đăng bài:`, error);
    return false;
  }
}
