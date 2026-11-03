import { describe, expect, it } from 'vitest';
import { slugify } from '../../pipeline/dual-publish.js';

describe('slugify tiếng Việt', () => {
  it('đổi "đ" thành "d" thay vì xóa mất', () => {
    // Đây là lỗi đã xảy ra thật: "hóa đơn điện tử" từng ra "hoa-on-ien-tu".
    expect(slugify('Hóa đơn điện tử khởi tạo từ máy tính tiền'))
      .toBe('hoa-don-dien-tu-khoi-tao-tu-may-tinh-tien');
  });

  it('xử lý các từ hay gặp có chữ đ', () => {
    expect(slugify('Đăng ký hộ kinh doanh')).toBe('dang-ky-ho-kinh-doanh');
    expect(slugify('Một tỷ đồng mỗi năm')).toBe('mot-ty-dong-moi-nam');
    expect(slugify('Đối soát sàn thương mại điện tử')).toBe('doi-soat-san-thuong-mai-dien-tu');
  });

  it('bỏ dấu và ký tự lạ, không để lại gạch nối thừa', () => {
    expect(slugify('  Chốt ca cuối ngày: lệch tiền?  ')).toBe('chot-ca-cuoi-ngay-lech-tien');
  });

  it('không sinh slug rỗng cho tiêu đề chỉ có dấu câu', () => {
    expect(slugify('---')).toBe('');
  });
});
