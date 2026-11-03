/**
 * Cổng kiểm định nội dung web chính theo docs/CONTENT_STANDARD.md.
 *
 * Chạy TRƯỚC khi ghi file markdown vào src/content/articles — bài không đạt thì
 * không bao giờ chạm ổ đĩa, tránh publish rồi mới sửa. Trả về danh sách lỗi cụ
 * thể để pipeline quyết định REGENERATE (tối đa 2 lần) hay HOLD.
 */

export interface ContentFact {
  factId: string;
  statement: string;
  /** Giá trị số của fact (nếu có) — dùng để đối chiếu con số trong bài. */
  value?: number | string;
  /** 'official' = văn bản pháp luật (đã đối chiếu thuvienphapluat.vn); 'internal' = tính năng sản phẩm. */
  sourceType?: string;
  /** Tên/số hiệu văn bản, ví dụ "Điều 10 Nghị quyết 198/2025/QH15". */
  sourceRef?: string;
  /** Link tra cứu để người duyệt kiểm lại. */
  sourceUrl?: string;
}

export interface ValidateOptions {
  keyword: string;
  minWords?: number;
  facts?: readonly ContentFact[];
}

/** Câu khẳng định pháp lý tuyệt đối — cấm theo C5 (chủ đề YMYL). */
const FORBIDDEN_CLAIMS = [
  'chắc chắn không bị phạt',
  'chac chan khong bi phat',
  'không bao giờ bị phạt',
  'khong bao gio bi phat',
  'miễn 100%',
  'mien 100%',
  'miễn thuế 100%',
  'cam kết không bị',
  'cam ket khong bi',
  'cơ quan thuế không kiểm tra',
  'co quan thue khong kiem tra',
  'tuyệt đối an toàn về thuế',
];

function stripFence(markdown: string): string {
  return markdown.replace(/^\s*```(?:markdown|md|html)?\n?/i, '').replace(/\n?```\s*$/i, '');
}

function plainText(markdown: string): string {
  return markdown
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/[#*_>`|-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/** Câu có số liệu tiền/ngưỡng/thời hạn — phải được bọc bởi một fact đã duyệt (C3). */
/**
 * Câu có khả năng là MỘT KHẲNG ĐỊNH SỐ LIỆU VỀ THUẾ do model tự nghĩ ra.
 *
 * Cân bằng có chủ đích: bắt tiền/tỷ lệ/hạn nộp (những thứ sai là mất uy tín), bỏ qua
 * mốc lịch thông thường và số hiệu văn bản. Gate quá chặt thì không bài nào đăng được,
 * mà như thế cũng vô dụng như không có gate.
 */
function isNumericClaim(sentence: string): boolean {
  if (!/\d/u.test(sentence)) return false;
  const normalized = normalize(sentence);

  // Số hiệu văn bản pháp luật: Thông tư 88/2021/TT-BTC, Nghị định 123/2020/NĐ-CP
  if (/(?:thong tu|nghi dinh|nghi quyet|luat|quyet dinh)\s|tt-btc|nd-cp|nq-tw/u.test(normalized)) return false;
  // Đánh số mục/bước trong bài
  if (/^\s*(?:buoc|phan|muc)\s*\d+/u.test(normalized)) return false;
  // Mốc lịch thông thường (đầu/cuối năm dương lịch, quý) — không phải khẳng định về thuế
  if (/(?:^|\D)(?:1\/1|31\/12|01\/01|31\/12)(?:\D|$)/u.test(normalized)
    && !/(?:trieu|ty|nghin|dong|vnd|%|phat|han nop)/u.test(normalized)) return false;

  // Tiền, tỷ lệ, ngưỡng: luôn phải có fact
  if (/(?:trieu|ty|nghin|tram trieu|dong|vnd|%|phan tram|thue suat|nguong)/u.test(normalized)) return true;
  // Hạn nộp/mức phạt gắn với con số: luôn phải có fact (đã từng bắt được "trước ngày 20")
  if (/(?:han nop|cham nop|truoc ngay|chau nhat|muc phat|bi phat|xu phat)/u.test(normalized)) return true;
  return false;
}

/**
 * Rút các biểu thức số trong câu, chuẩn hóa để so được: "1 tỷ đồng" → "1 ty",
 * "300.000.000" → "300000000", "20%" → "20%".
 */
function numericExpressions(value: string): string[] {
  const normalized = normalize(value);
  const matches = normalized.match(/\d[\d.,]*\s*(?:ty|trieu|nghin|tram|%|dong|vnd)?/gu) ?? [];
  return matches
    .map((match) => match.replace(/[.,](?=\d{3}\b)/gu, '').replace(/\s+/gu, ' ').trim())
    .map((match) => match.replace(/\s*(?:dong|vnd)$/u, '').trim())
    .filter(Boolean);
}

/**
 * Câu có căn cứ khi MỌI con số trong câu đều xuất hiện trong fact đã duyệt.
 *
 * Vì sao so theo con số chứ không so nguyên văn câu: model gần như luôn diễn giải lại
 * fact bằng lời của nó ("nếu doanh thu chưa đến 1 tỷ đồng thì..."), đó là viết bài bình
 * thường chứ không phải bịa. Thứ thật sự nguy hiểm là CON SỐ không có nguồn — nên gate
 * chặn đúng cái đó: "1 tỷ" có trong fact thì cho qua, "300 triệu" hay "trước ngày 20"
 * không có trong fact thì chặn.
 */
function isGrounded(sentence: string, normalizedFacts: readonly string[], factNumbers: ReadonlySet<string>): boolean {
  const normalizedSentence = normalize(sentence);
  if (normalizedFacts.some((statement) => statement.length > 0
    && (normalizedSentence.includes(statement) || statement.includes(normalizedSentence)))) {
    return true;
  }
  const numbers = numericExpressions(sentence);
  return numbers.length > 0 && numbers.every((number) => factNumbers.has(number));
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/u).map((value) => value.trim()).filter(Boolean);
}

/** LLM hay chép cả mã fact vào bài ("... theo [fact_004]") — người đọc thấy là mất uy tín. */
const FACT_MARKER = /\[\s*fact[\s_-]*\d+\s*\]/giu;

export function validateMainArticle(rawMarkdown: string, options: ValidateOptions): string[] {
  const markdown = stripFence(rawMarkdown);
  // Bỏ mã fact trước khi quét số liệu để lỗi báo đúng bản chất, không đổ oan cho C3.
  const text = plainText(markdown).replace(FACT_MARKER, ' ');
  const normalizedText = normalize(text);
  const normalizedKeyword = normalize(options.keyword);
  const errors: string[] = [];

  // C1 — độ dài
  const minWords = options.minWords ?? 1200;
  const words = countWords(text);
  if (words < minWords) errors.push(`C1: bài chỉ ${words} từ, cần >= ${minWords}`);

  // AEO — đoạn mở đầu 40–60 chữ, đứng trước heading đầu tiên
  const beforeFirstHeading = markdown.split(/^##\s/mu)[0];
  const openingWords = countWords(plainText(beforeFirstHeading.replace(/^#\s.*$/mu, '')));
  if (openingWords < 35 || openingWords > 90) {
    errors.push(`AEO: đoạn trả lời mở đầu ${openingWords} từ, cần khoảng 40-60 (chấp nhận 35-90)`);
  }

  // S4 — heading: >= 3 H2, H2 đầu chứa keyword
  const h2s = [...markdown.matchAll(/^##\s+(.+)$/gmu)].map((match) => match[1].trim());
  if (h2s.length < 3) errors.push(`S4: chỉ có ${h2s.length} thẻ H2, cần >= 3`);
  if (h2s.length > 0) {
    const keywordHead = normalizedKeyword.split(' ').filter((w) => w.length > 2).slice(0, 3);
    const firstH2 = normalize(h2s[0]);
    if (keywordHead.length > 0 && !keywordHead.some((word) => firstH2.includes(word))) {
      errors.push('S4: H2 đầu tiên không chứa từ khóa chính');
    }
  }

  // S5 — >= 2 ảnh có alt mô tả
  const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/gu)];
  const withAlt = images.filter((image) => plainText(image[1]).length >= 5);
  if (withAlt.length < 2) errors.push(`S5: chỉ có ${withAlt.length} ảnh có alt mô tả, cần >= 2`);

  // Cấu trúc bắt buộc — bảng so sánh + trích dẫn chuyên gia
  if (!/^\|.+\|/mu.test(markdown)) errors.push('Cấu trúc: thiếu bảng so sánh (markdown table)');
  if (!/^>\s+\S/mu.test(markdown)) errors.push('Cấu trúc: thiếu blockquote lời khuyên chuyên gia');

  // S8 — FAQ + JSON-LD parse được và khớp số câu hỏi
  const ldMatch = markdown.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/iu);
  if (!ldMatch) {
    errors.push('S8: thiếu khối JSON-LD FAQPage');
  } else {
    try {
      const parsed = JSON.parse(ldMatch[1].trim());
      const entities = Array.isArray(parsed?.mainEntity) ? parsed.mainEntity : [];
      if (parsed?.['@type'] !== 'FAQPage' || entities.length < 3) {
        errors.push('S8: JSON-LD không phải FAQPage hợp lệ hoặc có dưới 3 câu hỏi');
      }
    } catch {
      errors.push('S8: JSON-LD không parse được');
    }
  }

  // Lộ mã fact ra bài đăng
  const leaked = stripFence(rawMarkdown).match(FACT_MARKER);
  if (leaked) {
    errors.push(`Lộ mã fact trong bài (${leaked[0]}) — chép nguyên văn câu, tuyệt đối không kèm mã fact`);
  }

  // C5 — cấm cam kết pháp lý tuyệt đối
  for (const phrase of FORBIDDEN_CLAIMS) {
    if (normalizedText.includes(normalize(phrase))) {
      errors.push(`C5: chứa cam kết pháp lý bị cấm — "${phrase}"`);
      break;
    }
  }

  // C3 — mọi câu có số liệu phải trùng khớp một fact đã duyệt
  const facts = options.facts ?? [];
  const normalizedFacts = facts.map((fact) => normalize(fact.statement));
  const factNumbers = new Set(facts.flatMap((fact) => [
    ...numericExpressions(fact.statement),
    ...(fact.value === undefined ? [] : numericExpressions(String(fact.value))),
  ]));
  const ungrounded = sentences(text)
    .filter(isNumericClaim)
    .filter((sentence) => !isGrounded(sentence, normalizedFacts, factNumbers));
  if (ungrounded.length > 0) {
    errors.push(`C3: ${ungrounded.length} câu có số liệu không khớp fact đã duyệt — ví dụ: "${ungrounded[0].slice(0, 110)}"`);
  }

  // S10 — chỉ đếm lời mời hành động thật sự. Nhắc tên thương hiệu trong bài là bình thường;
  // thứ cần chặn là rải "đăng ký ngay / dùng thử ngay" khắp bài như quảng cáo.
  const ctaPattern = /(dùng thử ngay|dung thu ngay|đăng ký ngay|dang ky ngay|tải ngay|tai ngay|liên hệ ngay|lien he ngay)/giu;
  const ctaHits = [...markdown.matchAll(ctaPattern)];
  if (ctaHits.length > 3) errors.push(`S10: có ${ctaHits.length} lời kêu gọi hành động, CTA nên gói gọn ở kết luận`);

  // R3 — không để lộ markdown thô trong HTML hoặc thẻ nguy hiểm
  if (/<(?:iframe|style)\b/iu.test(markdown)) errors.push('R3: chứa thẻ không được phép (iframe/style)');

  return errors;
}
