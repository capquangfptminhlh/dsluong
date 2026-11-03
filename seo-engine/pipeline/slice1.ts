import fs from 'fs';
import path from 'path';

// Import các agents
import { buildBrief } from '../agents/content/BRF-8';
import { writeDraft } from '../agents/content/WRT-9';
import { verifyDraft } from '../agents/content/VER-12';

async function main() {
  const mockCandidate = "thuế bán hàng online 2026";
  
  console.log(`[Slice 1] Bắt đầu pipeline với candidate: "${mockCandidate}"`);

  try {
    // 1. Build Brief
    console.log('[Slice 1] Đang tạo Brief (BRF-8)...');
    const brief = await buildBrief(mockCandidate);

    // 2. Write Draft
    console.log('[Slice 1] Đang viết nháp (WRT-9)...');
    const draftMarkdown = await writeDraft(brief);

    // 3. Verify Draft
    console.log('[Slice 1] Đang kiểm duyệt bản nháp (VER-12)...');
    const verificationDecision = await verifyDraft(draftMarkdown, brief);

    // 4. Quyết định
    if (verificationDecision.decision === 'PASS') {
      const outputPath = "D:\\AutoTax\\seo-engine\\src\\content\\articles\\test-slice1.md";
      console.log(`[Slice 1] Kiểm duyệt PASS. Đang ghi file: ${outputPath}`);
      
      // Đảm bảo thư mục tồn tại trước khi ghi
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      
      // Ghi file markdown
      fs.writeFileSync(outputPath, draftMarkdown, 'utf-8');
      
      console.log('[Slice 1] Hoàn thành Slice 1 thành công!');
    } else {
      console.warn(`[Slice 1] Kiểm duyệt không đạt: ${JSON.stringify(verificationDecision)}. Hủy lưu file.`);
    }
  } catch (error) {
    console.error('[Slice 1] Lỗi trong quá trình thực thi:', error);
  }
}

main();
