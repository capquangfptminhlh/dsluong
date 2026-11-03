import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

async function runDailyPipeline() {
  console.log("=========================================");
  console.log("ANTIGRAVITY SEO + AEO + GEO PIPELINE V3.2");
  console.log("=========================================\n");

  try {
    // 1. Chạy generate-content.js để sinh Content & SVG Banner
    console.log("=> Gọi script sinh nội dung và banner (Round-Robin API & Sharp)...");
    execSync('node generate-content.js', { stdio: 'inherit', cwd: process.cwd() });
    
    // 2. Build lại Astro
    console.log("\n=> Đang Build lại toàn bộ Website tĩnh (Astro)...");
    execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
    console.log("=> BUILD HOÀN TẤT. WEBSITE ĐÃ ĐƯỢC CẬP NHẬT!");

  } catch (error) {
    console.error("\n[CRITICAL ERROR] Daily pipeline failed:", error);
    process.exit(1);
  }
  
  console.log("\n=> Pipeline execution completed successfully.");
}

runDailyPipeline();
