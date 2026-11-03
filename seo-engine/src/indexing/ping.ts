/**
 * Báo URL mới/vừa cập nhật cho Google qua Indexing API.
 *
 * Đọc khóa từ biến môi trường GSC_SERVICE_ACCOUNT_JSON (chuỗi JSON của service account),
 * KHÔNG đọc file — nhờ vậy VPS không cần chứa file khóa và khóa không lọt vào gói deploy.
 *
 * Lưu ý thực tế: Google chỉ cam kết hỗ trợ Indexing API cho JobPosting/BroadcastEvent.
 * Với bài blog, đây là tín hiệu "có thể" được dùng — nên coi là bổ trợ, sitemap vẫn là
 * đường chính. Vì vậy mọi lỗi ở đây đều KHÔNG được làm hỏng luồng đăng bài.
 */
import { google } from 'googleapis';

export interface PingResult {
  ok: boolean;
  detail: string;
}

function loadCredentials(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  try {
    // Cho phép cả JSON thuần lẫn JSON đã base64 hóa trong .env
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return typeof parsed.client_email === 'string' && typeof parsed.private_key === 'string'
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export async function pingIndexingApi(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PingResult> {
  const credentials = loadCredentials(env.GSC_SERVICE_ACCOUNT_JSON);
  if (!credentials) {
    return { ok: false, detail: 'GSC_SERVICE_ACCOUNT_JSON thiếu hoặc không hợp lệ' };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });
    const indexing = google.indexing({ version: 'v3', auth: await auth.getClient() as never });
    const response = await indexing.urlNotifications.publish({
      requestBody: { url, type: 'URL_UPDATED' },
    });
    const notifyTime = (response.data as { urlNotificationMetadata?: { latestUpdate?: { notifyTime?: string } } })
      ?.urlNotificationMetadata?.latestUpdate?.notifyTime;
    return { ok: true, detail: notifyTime ? `Google ghi nhận lúc ${notifyTime}` : 'Google đã ghi nhận' };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'lỗi không xác định' };
  }
}
