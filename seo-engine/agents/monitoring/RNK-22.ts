export async function fetchRankings() {
  console.log("[RNK-22] Fetching keyword rankings from Google Search Console (Mock)...");
  
  // Dữ liệu mock (Giả lập kết quả trả về từ API)
  const mockRankings = [
    { keyword: 'tax software for small business', position: 3.2, impressions: 1200, clicks: 150, url: '/tax-software-small-business' },
    { keyword: 'automated tax filing', position: 5.8, impressions: 850, clicks: 42, url: '/automated-tax-filing' },
    { keyword: 'best tax software 2026', position: 12.5, impressions: 400, clicks: 5, url: '/best-tax-software-2026' },
    { keyword: 'auto tax calculator', position: 1.1, impressions: 3200, clicks: 800, url: '/auto-tax-calculator' }
  ];

  // Giả lập thời gian delay của API
  await new Promise(resolve => setTimeout(resolve, 1000));

  return mockRankings;
}

export async function generateRankingReport(rankings: any[]) {
  let report = `# Báo cáo Thứ hạng Từ khóa (SEO Ranking Report)\n\n`;
  report += `*Cập nhật lúc: ${new Date().toISOString()}*\n\n`;
  report += `| Từ khóa | Vị trí trung bình | Lượt hiển thị (Impressions) | Lượt click (Clicks) | URL đích |\n`;
  report += `|---|---|---|---|---|\n`;
  
  for (const rank of rankings) {
    report += `| ${rank.keyword} | ${rank.position} | ${rank.impressions} | ${rank.clicks} | ${rank.url} |\n`;
  }

  return report;
}
