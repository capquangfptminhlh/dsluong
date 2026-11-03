const bloggerPilotMarker = 'AUTOTAX_BLOGGER_PILOT';
const bloggerLogPath = '/var/log/autotax-blogger.log';
const bloggerCronWrapper = './scripts/blogger/cron.sh';

/**
 * Builds the Blogger cron entry installed by deploy_v32.cjs.
 *
 * - Pilot mode (default): entry is COMMENTED OUT — operators enable manually
 *   after pilot approval.
 * - Full-auto mode (`enabled: true`, driven by BLOGGER_AUTOPUBLISH=true at
 *   deploy time): entry is ACTIVE — the worker runs nightly at 00:00.
 */
export function buildBloggerCronEntry(
  projectDir: string,
  options: { enabled?: boolean } = {},
): string {
  // flock: chống 2 lượt chạy chồng nhau (cron trùng, lượt trước chưa xong) — nếu không,
  // hai tiến trình cùng ghi article/ledger và có thể đăng quá 1 bài/ngày.
  const entry = `0 0 * * * cd ${projectDir} && ${bloggerCronWrapper} >> ${bloggerLogPath} 2>&1 # ${bloggerPilotMarker}`;
  return options.enabled === true ? entry : `# ${entry}`;
}

export { bloggerPilotMarker };
