import { findStaleArticles } from '../agents/monitoring/RFR-24.js';
import { generateReport } from '../agents/core/RPT-27.js';
export function runWeekly() {
  console.log("Weekly pipeline run: finding stale articles and generating report");
}
runWeekly();
