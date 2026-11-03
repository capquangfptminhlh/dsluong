import { describe, expect, it } from 'vitest';
import { validateMainArticle } from '../../src/content-standard/validate.js';

const FACTS = [{
  factId: 'fact_001',
  statement: 'Hộ kinh doanh và cá nhân kinh doanh có doanh thu từ 1 tỷ đồng/năm trở xuống không phải nộp thuế GTGT và thuế TNCN.',
  value: 1000000000,
}];

function buildArticle(overrides: { body?: string; faq?: string } = {}): string {
  const filler = Array.from({ length: 130 }, () => 'Chủ tiệm cần chuẩn bị sổ sách rõ ràng để việc kê khai diễn ra thuận lợi và minh bạch.').join(' ');
  const body = overrides.body ?? `
Hộ kinh doanh cần nắm rõ ngưỡng doanh thu chịu thuế để chủ động chuẩn bị sổ sách và hóa đơn. Bài viết dưới đây tổng hợp cách xác định ngưỡng, hồ sơ cần có và những lưu ý quan trọng khi làm việc với cơ quan thuế quản lý.

## Ngưỡng doanh thu chịu thuế hộ kinh doanh gồm những gì

${FACTS[0].statement} ${filler}

![Màn hình theo dõi doanh thu AutoTax](/img_dashboard.png)

## Hồ sơ cần chuẩn bị

${filler}

| Hạng mục | Yêu cầu |
| --- | --- |
| Sổ sách | Ghi chép đầy đủ |

> Lời khuyên: hãy đối chiếu số liệu bán hàng hằng tuần thay vì dồn đến cuối kỳ.

![Sổ sách bán hàng theo mẫu quy định](/img_inventory.png)

## Lỗi thường gặp khi kê khai

${filler}
`;
  const faq = overrides.faq ?? `
## Câu hỏi thường gặp

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"A","acceptedAnswer":{"@type":"Answer","text":"a"}},
{"@type":"Question","name":"B","acceptedAnswer":{"@type":"Answer","text":"b"}},
{"@type":"Question","name":"C","acceptedAnswer":{"@type":"Answer","text":"c"}}]}
</script>
`;
  return `${body}\n${faq}`;
}

describe('CONTENT_STANDARD main-article gate', () => {
  const options = { keyword: 'ngưỡng doanh thu chịu thuế hộ kinh doanh', facts: FACTS };

  it('accepts an article that meets the standard', () => {
    expect(validateMainArticle(buildArticle(), options)).toEqual([]);
  });

  it('rejects an article that is too short', () => {
    const short = '\nMở đầu ngắn gọn trả lời trực tiếp câu hỏi của người đọc về ngưỡng doanh thu phải nộp thuế hiện nay ra sao.\n\n## Ngưỡng doanh thu\n\nNội dung ngắn.\n';
    expect(validateMainArticle(short, options).some((error) => error.startsWith('C1'))).toBe(true);
  });

  it('rejects a number that is not backed by an approved fact', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị\n\nMức doanh thu phải nộp thuế là 100 triệu đồng mỗi năm.',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(true);
  });

  it('rejects an absolute legal promise', () => {
    const article = buildArticle().replace('Lỗi thường gặp khi kê khai', 'Lỗi thường gặp\n\nLàm theo cách này bạn chắc chắn không bị phạt.');
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C5'))).toBe(true);
  });

  it('rejects a missing or malformed FAQ schema', () => {
    const article = buildArticle({ faq: '## Câu hỏi thường gặp\n\nKhông có schema.' });
    expect(validateMainArticle(article, options).some((error) => error.startsWith('S8'))).toBe(true);

    const broken = buildArticle({ faq: '<script type="application/ld+json">{ khong-phai-json }</script>' });
    expect(validateMainArticle(broken, options).some((error) => error.startsWith('S8'))).toBe(true);
  });

  it('rejects an article with fewer than two described images', () => {
    const article = buildArticle().replace('![Sổ sách bán hàng theo mẫu quy định](/img_inventory.png)', '');
    expect(validateMainArticle(article, options).some((error) => error.startsWith('S5'))).toBe(true);
  });

  it('rejects an article that leaks an internal fact marker into the prose', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị theo quy định [fact_004] hiện hành',
    );
    const errors = validateMainArticle(article, options);

    expect(errors.some((error) => error.startsWith('Lộ mã fact'))).toBe(true);
    // Mã fact không được tính nhầm thành số liệu chưa có nguồn.
    expect(errors.some((error) => error.startsWith('C3'))).toBe(false);
  });

  it('still blocks a fabricated filing deadline', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị\n\nBạn phải nộp tờ khai trước ngày 20 của tháng tiếp theo.',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(true);
  });

  it('still blocks a fabricated money threshold', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị\n\nMức doanh thu phải nộp thuế là 300 triệu đồng mỗi năm.',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(true);
  });

  it('accepts ordinary calendar boundaries that are not tax claims', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị\n\nCộng dồn doanh thu từ ngày 1/1 đến ngày 31/12 của năm đó.',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(false);
  });

  it('accepts a paraphrase that reuses only numbers found in approved facts', () => {
    // Model gần như luôn diễn giải lại fact — chỉ chặn khi CON SỐ không có nguồn.
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị\n\nNếu tổng doanh thu cả năm chưa đến 1 tỷ đồng, bạn chưa phải nộp hai sắc thuế này.',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(false);
  });

  it('accepts an approved fact quoted inside a longer sentence', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      `Hồ sơ cần chuẩn bị\n\nBạn nên nhớ rằng ${FACTS[0].statement.replace(/\.$/, '')} theo quy định hiện hành.`,
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(false);
  });

  it('does not treat ordinary brand mentions as call-to-action spam', () => {
    const article = buildArticle().replace(
      /Chủ tiệm cần chuẩn bị sổ sách rõ ràng/gu,
      'Phần mềm AutoTax POS giúp chủ tiệm chuẩn bị sổ sách rõ ràng',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('S10'))).toBe(false);
  });

  it('does not flag legal document references as ungrounded numbers', () => {
    const article = buildArticle().replace(
      'Hồ sơ cần chuẩn bị',
      'Hồ sơ cần chuẩn bị theo Thông tư 88/2021/TT-BTC và Nghị định 123/2020/NĐ-CP',
    );
    expect(validateMainArticle(article, options).some((error) => error.startsWith('C3'))).toBe(false);
  });
});
