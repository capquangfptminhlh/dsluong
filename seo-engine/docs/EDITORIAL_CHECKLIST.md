# Checklist duyệt bài trước khi publish (bắt buộc cho chủ đề thuế — YMYL)

Bài do AI sinh **không được publish thẳng**. Người duyệt tick đủ mới đăng:

## Chính xác (quan trọng nhất — sai 1 con số thuế là mất uy tín cả site)
- [ ] Mọi con số (thuế suất, mức phạt, ngưỡng doanh thu, hạn nộp) đối chiếu văn bản gốc (Thông tư 88/2021/TT-BTC, NĐ 123/2020/NĐ-CP, quy định 2026) — không tin số AI viết ra
- [ ] Mọi claim có `fact_id` trong `data/facts.json`; con số không có nguồn → xóa hoặc bổ sung nguồn
- [ ] Không hứa hẹn pháp lý ("chắc chắn không bị phạt", "miễn 100% thuế")

## E-E-A-T
- [ ] Tác giả đứng tên là **người thật, kiểm chứng được** (LinkedIn/FB thật). Không tạo persona ảo với bằng cấp ảo — Google phạt và rủi ro pháp lý
- [ ] Có ít nhất 1 chi tiết kinh nghiệm thực tế (ảnh chụp thật, tình huống khách thật đã ẩn danh)
- [ ] Ngày cập nhật hiển thị đúng

## SEO/AEO
- [ ] Đoạn trả lời trực tiếp 40–60 chữ ngay đầu bài, đúng trọng tâm keyword
- [ ] Title <65 ký tự, meta <155 ký tự, H2 đầu chứa keyword
- [ ] ≥2 ảnh có alt mô tả đúng nội dung ảnh (không nhồi keyword vô nghĩa)
- [ ] FAQ schema JSON-LD hợp lệ (test bằng Rich Results Test)
- [ ] ≥3 internal link đến bài liên quan / money page, anchor tự nhiên
- [ ] CTA chỉ ở kết luận, không chèn quảng cáo giữa phần giải thích pháp lý

## Sau publish
- [ ] Bắn Indexing API (`node seo-bots/google_indexer.js <URL>`)
- [ ] Thêm keyword vào `data/keywords.json` với `status: "published"` + `slug`
