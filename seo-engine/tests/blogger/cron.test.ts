import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildBloggerCronEntry } from '../../src/blogger/cron.js';

describe('Blogger cron', () => {
  it('builds a disabled (commented) schedule by default', () => {
    const entry = buildBloggerCronEntry('/var/www/autotax/seo-engine');

    expect(entry.startsWith('# ')).toBe(true);
    expect(entry).toContain('scripts/blogger/cron.sh');
    expect(entry).not.toContain('pipeline/dual-publish.ts');
    expect(entry).toContain('AUTOTAX_BLOGGER_PILOT');
  });

  it('builds an ACTIVE schedule when full-auto publishing is enabled', () => {
    const entry = buildBloggerCronEntry('/var/www/autotax/seo-engine', { enabled: true });

    expect(entry.startsWith('#')).toBe(false);
    expect(entry).toContain('0 0 * * *');
    expect(entry).toContain('cd /var/www/autotax/seo-engine && ./scripts/blogger/cron.sh');
  });

  it('delegates overlap protection to the dedicated Blogger wrapper', () => {
    const entry = buildBloggerCronEntry('/srv/seo-engine', { enabled: true });

    expect(entry).toContain('cd /srv/seo-engine && ./scripts/blogger/cron.sh');
    expect(entry).not.toContain('seo-daily.lock');
    expect(entry).toContain('AUTOTAX_BLOGGER_PILOT');
  });

  it('runs the worker through a kill-switch wrapper with the dedicated flock command', async () => {
    const wrapper = await readFile('scripts/blogger/cron.sh', 'utf8');

    // -e cố tình bị bỏ: wrapper phải bắt được exit code của worker để đếm lỗi liên tiếp
    expect(wrapper).toContain('set -uo pipefail');
    expect(wrapper).toContain('/usr/bin/flock -n /var/lock/autotax_blogger.lock /usr/bin/npx tsx scripts/blogger/run-worker.ts');
    expect(wrapper).not.toContain('seo-daily.lock');
    // Kill-switch: 2 lượt lỗi liên tiếp → tự comment dòng cron + ghi alert
    expect(wrapper).toContain('blogger-consecutive-failures');
    expect(wrapper).toContain('blogger-kill-switch.jsonl');
    expect(wrapper).toContain('-ge 2');
    expect(wrapper).toContain('crontab -l');
  });

  it('keeps primary cron entries while replacing only the disabled Blogger pilot entry', async () => {
    const deploy = await readFile('deploy_v32.cjs', 'utf8');

    // Lọc theo marker, không theo tên log — nếu không, đổi log path là dòng cũ không bị
    // thay thế và crontab cộng dồn trùng lặp mỗi lần deploy (đã từng xảy ra thật).
    expect(deploy).toContain("grep -v 'AUTOTAX_BLOGGER_PILOT'");
    expect(deploy).not.toContain("grep -v 'seo-engine'");
    expect(deploy).toContain("require('tsx/cjs/api').register()");
    expect(deploy).toContain("require('./src/blogger/cron.ts')");
    expect(deploy).toContain('buildBloggerCronEntry(remoteExtractDir, {');
    expect(deploy).toContain("enabled: process.env.BLOGGER_AUTOPUBLISH === 'true'");
    expect(deploy).toContain('chmod +x ${remoteExtractDir}/scripts/blogger/cron.sh');
    expect(deploy).toContain('state,_archive,.tmp,test_zip,.astro,.vscode,seo-engine-v32.zip');
    expect(deploy).toContain('rm -rf ${remoteExtractDir}/.tmp ${remoteExtractDir}/test_zip ${remoteExtractDir}/.astro ${remoteExtractDir}/.vscode');
    expect(deploy).toContain('printf');
    expect(deploy).toContain('shellSingleQuote(bloggerCronEntry)');
    expect(deploy).not.toContain('30 2 * * *');
    expect(deploy).not.toContain('autotax_blogger.lock');
  });

  it('uses validated environment SSH configuration and a fail-safe remote setup script', async () => {
    const deploy = await readFile('deploy_v32.cjs', 'utf8');

    expect(deploy).toContain('AUTOTAX_VPS_HOST');
    expect(deploy).toContain('AUTOTAX_VPS_PORT');
    expect(deploy).toContain('AUTOTAX_VPS_USER');
    expect(deploy).toContain('AUTOTAX_VPS_PASSWORD');
    expect(deploy).toContain('AUTOTAX_VPS_PRIVATE_KEY_PATH');
    expect(deploy).toContain("new Error('AUTOTAX_VPS_CONFIG_INVALID')");
    expect(deploy).not.toContain('VPS_SECRET_KEY');
    expect(deploy).toContain('npm ci');
    expect(deploy).toContain('cron_temp=$(mktemp)');
    expect(deploy).toContain("trap 'rm -f \\\"$cron_temp\\\"' EXIT");
    expect(deploy).toContain('/bin/bash -lc ${shellSingleQuote(setupScript)}');
    expect(deploy).toContain('if (code !== 0)');
    expect(deploy).toContain('Deployment setup failed');
  });
});
