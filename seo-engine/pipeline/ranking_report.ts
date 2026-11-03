import * as fs from 'fs';
import * as path from 'path';
import { fetchRankings, generateRankingReport } from '../agents/monitoring/RNK-22';

async function runRankingReport() {
  console.log("=========================================");
  console.log("BÁO CÁO THỨ HẠNG TỪ KHÓA - AUTOTAX SEO");
  console.log("=========================================\n");

  try {
    const rankings = await fetchRankings();
    const reportMarkdown = await generateRankingReport(rankings);
    
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const reportPath = path.join(docsDir, 'ranking_report.md');
    fs.writeFileSync(reportPath, reportMarkdown, 'utf-8');

    console.log(`✅ Đã xuất báo cáo thành công tại: ${reportPath}`);
    console.log("\nNội dung tóm tắt:\n");
    console.table(rankings);

  } catch (error) {
    console.error("Lỗi khi xuất báo cáo thứ hạng:", error);
    process.exit(1);
  }
}

runRankingReport();
