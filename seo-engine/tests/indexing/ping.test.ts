import { describe, expect, it } from 'vitest';
import { pingIndexingApi } from '../../src/indexing/ping.js';

describe('Indexing API ping', () => {
  it('báo lỗi rõ ràng khi thiếu khóa, không ném exception', async () => {
    await expect(pingIndexingApi('https://autotaxpos.com/blog/a', {})).resolves.toEqual({
      ok: false,
      detail: expect.stringContaining('GSC_SERVICE_ACCOUNT_JSON'),
    });
  });

  it('báo lỗi khi khóa không phải JSON hợp lệ', async () => {
    const result = await pingIndexingApi('https://autotaxpos.com/blog/a', {
      GSC_SERVICE_ACCOUNT_JSON: 'khong-phai-json',
    });

    expect(result.ok).toBe(false);
  });

  it('báo lỗi khi JSON thiếu client_email hoặc private_key', async () => {
    const result = await pingIndexingApi('https://autotaxpos.com/blog/a', {
      GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account' }),
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('GSC_SERVICE_ACCOUNT_JSON');
  });

  it('không bao giờ ném lỗi ra ngoài — luồng đăng bài không được gãy vì bước này', async () => {
    const result = await pingIndexingApi('khong-phai-url', {
      GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'a@b.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nkhong-hop-le\n-----END PRIVATE KEY-----\n',
      }),
    });

    expect(result.ok).toBe(false);
    expect(typeof result.detail).toBe('string');
  });
});
