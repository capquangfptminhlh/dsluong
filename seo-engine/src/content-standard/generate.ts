/**
 * Sinh bài web chính đạt docs/CONTENT_STANDARD.md.
 *
 * Đặt ở đây (không nằm trong pipeline) để pipeline đăng hằng đêm VÀ script viết lại bài cũ
 * dùng CHUNG một prompt + một bộ gate. Nếu tách đôi, hai đường sẽ trôi khác nhau và bài
 * refresh lại không cùng chuẩn với bài mới.
 */
import { validateMainArticle, type ContentFact } from './validate.js';

/** Hàm gọi LLM do phía ngoài cung cấp (đã xoay vòng key, đã retry mạng). */
export type GenerateFn = (prompt: string) => Promise<string>;

export interface GenerateOptions {
  /** Số lần viết lại tối đa khi trượt gate. Hết lượt vẫn trượt → ném lỗi, KHÔNG đăng bài kém. */
  maxAttempts?: number;
  log?: (message: string) => void;
}

export function buildArticlePrompt(title: string, facts: readonly ContentFact[]): string {
  // Kèm căn cứ pháp lý của từng fact để bài trích đúng tên văn bản, không tự nghĩ ra.
  const factBlock = facts.length
    ? facts.map((fact) => {
      const legal = fact.sourceType === 'official' && fact.sourceRef ? ` (căn cứ: ${fact.sourceRef})` : '';
      return `- [${fact.factId}] ${fact.statement}${legal}`;
    }).join('\n')
    : '- (không có số liệu nào được duyệt)';

  const legalRefs = facts
    .filter((fact) => fact.sourceType === 'official' && fact.sourceRef)
    .map((fact) => fact.sourceRef as string);

  return [
    `Viết một bài blog tiếng Việt chuẩn SEO về chủ đề: "${title}".`,
    'Trả về MARKDOWN THUẦN, không bọc trong code fence, không thêm lời dẫn.',
    '',
    'CẤU TRÚC BẮT BUỘC, đúng thứ tự:',
    '1. Mở đầu: MỘT đoạn 40-60 từ trả lời TRỰC TIẾP câu hỏi của tiêu đề. Không "Trong thời đại...", không dẫn dắt.',
    '2. Ít nhất 4 mục "## " (H2). H2 đầu tiên PHẢI chứa từ khóa chính của tiêu đề.',
    '   Trình tự nội dung: là gì → áp dụng cho ai → làm từng bước → ví dụ thực tế → lỗi thường gặp.',
    '3. Chèn ĐÚNG 2 ảnh bằng cú pháp markdown, alt mô tả thật nội dung ảnh:',
    '   ![Màn hình quản lý bán hàng AutoTax](/img_pos.png) và ![Báo cáo doanh thu và thuế](/img_dashboard.png)',
    '4. Ít nhất một bảng markdown (| cột | cột |) tổng hợp hoặc so sánh.',
    '5. BẮT BUỘC có ít nhất một dòng riêng bắt đầu bằng dấu ">" rồi khoảng trắng, chứa lời khuyên',
    '   thực tế của người làm nghề. Ví dụ đúng: "> Kinh nghiệm: hãy đối chiếu sổ mỗi tuần thay vì dồn cuối kỳ."',
    '   Dòng này phải đứng riêng, không nằm trong bảng hay danh sách.',
    '6. Mục "## Câu hỏi thường gặp" với 3-5 câu hỏi, mỗi câu trả lời 2-4 câu.',
    '7. Ngay sau FAQ, chèn khối schema (đặt nguyên văn, thay nội dung cho khớp FAQ ở trên):',
    '   <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"...","acceptedAnswer":{"@type":"Answer","text":"..."}}]}</script>',
    '8. Mục "## Kết luận": tóm 2-3 ý và MỘT lời mời dùng AutoTax POS. Toàn bài chỉ nhắc sản phẩm ở đây.',
    '',
    'ĐỘ DÀI: tối thiểu 1200 từ. Viết sâu, có ví dụ cụ thể, không lặp ý cho đủ chữ.',
    '',
    'QUY TẮC SỐ LIỆU (quan trọng nhất — sai một con số thuế là mất uy tín):',
    'Chỉ được nêu số liệu nằm trong danh sách dưới đây, và phải chép NGUYÊN VĂN cả câu:',
    factBlock,
    'Chép ĐÚNG NỘI DUNG CÂU, TUYỆT ĐỐI KHÔNG viết kèm mã fact vào bài. Người đọc không được',
    'nhìn thấy chuỗi dạng [fact_001] hay (fact 004) ở bất kỳ đâu — đó là mã nội bộ.',
    'Mọi câu khác TUYỆT ĐỐI không được chứa chữ số hay mức tiền/ngưỡng/thời hạn tự nghĩ ra.',
    'KHÔNG được tự đặt hạn nộp, mức phạt, tỷ lệ phần trăm hay ngưỡng doanh thu nào ngoài danh sách trên.',
    'Nếu cần nói về mức thu, hãy viết định tính ("tùy ngành nghề", "theo quy định hiện hành").',
    '',
    'CĂN CỨ PHÁP LÝ — CHỈ ĐƯỢC NHẮC ĐÚNG NHỮNG VĂN BẢN SAU, chép đúng số hiệu:',
    legalRefs.length > 0 ? legalRefs.map((ref) => `- ${ref}`).join('\n') : '- (chưa có văn bản nào được duyệt cho chủ đề này)',
    'TUYỆT ĐỐI không nêu tên hay số hiệu văn bản nào ngoài danh sách trên, kể cả khi bạn',
    'nghĩ là mình nhớ đúng. Sai số hiệu văn bản luật còn tệ hơn không nhắc tới nó.',
    'Khi viện dẫn, ghi rõ tên văn bản trong câu để người đọc tự tra cứu được.',
    '',
    'CẤM: các câu cam kết tuyệt đối như "chắc chắn không bị phạt", "miễn 100%", "cơ quan thuế không kiểm tra".',
    'Giọng văn: xưng "bạn", câu ngắn, chủ tiệm tạp hóa đọc hiểu được.',
  ].join('\n');
}

export function stripCodeFence(raw: string): string {
  return raw.replace(/^\s*```(?:markdown|md)?\n?/iu, '').replace(/\n?```\s*$/iu, '');
}

export async function generateStandardArticle(
  title: string,
  facts: readonly ContentFact[],
  generate: GenerateFn,
  options: GenerateOptions = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? 3;
  const log = options.log ?? console.log;
  const prompt = buildArticlePrompt(title, facts);
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Lần viết lại được nhận đúng danh sách lỗi của lần trước — nhờ vậy tỉ lệ đạt
    // ở lần 2-3 cao hơn hẳn so với việc chỉ gọi lại cùng một prompt.
    const retryNote = attempt === 1 ? '' : [
      '',
      'LẦN VIẾT TRƯỚC BỊ TỪ CHỐI vì các lỗi sau — sửa hết rồi viết lại toàn bài:',
      ...lastErrors.map((error) => `- ${error}`),
    ].join('\n');

    const body = stripCodeFence(await generate(prompt + retryNote));
    const errors = validateMainArticle(body, { keyword: title, facts });
    if (errors.length === 0) {
      log(`[CONTENT] Bài đạt CONTENT_STANDARD ở lần viết thứ ${attempt}.`);
      return body;
    }
    lastErrors = errors;
    log(`[CONTENT] Lần ${attempt} trượt gate: ${errors.join(' | ')}`);
  }

  throw new Error(`CONTENT_STANDARD_FAILED: ${lastErrors.join(' | ')}`);
}
