import { rotator } from '../../src/utils/llm-rotator';

export async function writeDraft(brief: any): Promise<string> {
  console.log(`[WRT-9] Đang kết nối AI qua API Rotator để viết bài...`);
  
  const prompt = `
Viết một bài viết chuẩn SEO theo cấu trúc sau:
Mục tiêu bài viết: Cung cấp thông tin chất lượng về từ khóa SEO.
Nội dung yêu cầu (Brief): ${JSON.stringify(brief)}

Yêu cầu xuất ra định dạng Markdown, gồm frontmatter:
---
title: "[Tiêu đề hấp dẫn]"
description: "[Mô tả bài viết]"
---

Nội dung chi tiết ở đây...
`;

  try {
    const articleContent = await rotator.generateText(prompt, "gemini-1.5-pro");
    console.log(`[WRT-9] ✅ AI đã viết xong bản nháp.`);
    return articleContent;
  } catch (error) {
    console.error("[WRT-9] Lỗi khi AI tạo nội dung:", error);
    // Trả về bản nháp mặc định nếu lỗi toàn bộ API
    return `---
title: "Lỗi tạo bài viết"
description: "Bài viết không thể tạo do lỗi kết nối API."
---
# Lỗi hệ thống
Các API Key đều đã hết hạn mức hoặc bị từ chối.
`;
  }
}
