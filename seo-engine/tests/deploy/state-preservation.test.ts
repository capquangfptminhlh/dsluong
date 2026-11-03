import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('deploy không được xóa trạng thái chạy của VPS', () => {
  it('loại state/ ra khỏi gói zip', async () => {
    const deploy = await readFile('deploy_v32.cjs', 'utf8');
    const excludeLine = deploy.split('\n').find((line) => line.includes('-Exclude'));

    expect(excludeLine).toBeDefined();
    // state chứa ledger bài đã đăng — ghi đè nó lên VPS sẽ gây đăng trùng bài.
    expect(excludeLine).toContain('state');
    expect(excludeLine).toContain('node_modules');
    expect(excludeLine).toContain('.env');
  });

  it('sao lưu rồi hợp nhất lại trạng thái topic quanh bước unzip', async () => {
    const deploy = await readFile('deploy_v32.cjs', 'utf8');
    const backupAt = deploy.indexOf('autotax-topics-prev.json');
    const unzipAt = deploy.indexOf('unzip -o');
    const mergeAt = deploy.indexOf('merge-topic-status.mjs');

    expect(backupAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(-1);
    // Thứ tự bắt buộc: sao lưu -> unzip -> hợp nhất
    expect(backupAt).toBeLessThan(unzipAt);
    expect(unzipAt).toBeLessThan(mergeAt);
  });

  it('script hợp nhất ưu tiên trạng thái đã chạy trên VPS', async () => {
    const merge = await readFile('scripts/merge-topic-status.mjs', 'utf8');

    expect(merge).toContain('topic.status = old.status');
    // Không có bản sao cũ thì thoát êm, không làm hỏng lần deploy đầu tiên.
    expect(merge).toContain('process.exit(0)');
  });
});
