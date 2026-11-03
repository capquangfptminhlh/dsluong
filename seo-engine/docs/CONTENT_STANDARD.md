# CONTENT STANDARD — Quy chuẩn bắt buộc cho MỌI bài viết tự động (Antigravity phải tuân thủ 100%)

> Mọi bài trước khi publish (web chính hoặc Blogger) phải pass **TẤT CẢ** mục dưới đây.
> Fail bất kỳ mục [BẮT BUỘC] nào → KHÔNG publish, đưa về REGENERATE (tối đa 2 lần) rồi HOLD.
> Không được publish "tạm" rồi sửa sau.

---

## 1. CẤU TRÚC BÀI CHUẨN (theo đúng thứ tự)

```
[H1 — duy nhất 1 thẻ, chứa keyword chính, ≤65 ký tự]

[AEO DIRECT ANSWER — đoạn đầu tiên, 40–60 chữ, trả lời THẲNG câu hỏi của keyword.
 Người đọc chỉ đọc đoạn này phải nắm được câu trả lời. Không mở bài kiểu "Trong thời đại...", không dẫn dắt vòng vo.]

[Banner/ảnh cover — alt mô tả nội dung có keyword]

## H2 #1 — chứa keyword chính (dạng câu hỏi càng tốt)
   [giải thích cốt lõi + fact có nguồn]
## H2 #2..#n — mỗi H2 một ý lớn, theo trình tự người thật cần biết:
   là gì → áp dụng cho ai → cách làm từng bước → ví dụ số cụ thể → lỗi thường gặp
   ### H3 cho bước con khi cần
[≥1 bảng <table> so sánh hoặc tổng hợp mức/ngưỡng]
[1 <blockquote> lời khuyên thực tế — giọng người làm nghề, không sáo rỗng]
[≥2 ảnh giữa các H2/H3 — ảnh screenshot AutoTax thật đúng ngữ cảnh, alt tự nhiên có keyword phụ]

## Câu hỏi thường gặp (FAQ) — 3–5 câu
   [câu trả lời ngắn 2–4 câu/câu hỏi, tự đứng độc lập được]
<script type="application/ld+json"> FAQPage schema khớp ĐÚNG các câu FAQ ở trên </script>

## Kết luận
   [tóm 2–3 ý chính + CTA duy nhất về AutoTax — mềm, đúng ngữ cảnh, không hù dọa]
```

## 2. QUY CHUẨN NỘI DUNG [BẮT BUỘC]

| # | Tiêu chí | Ngưỡng pass |
|---|---|---|
| C1 | Độ dài | ≥1200 từ (web chính), ≥800 từ (Blogger) |
| C2 | Trả lời đúng intent | Nội dung giải quyết đúng `intent` ghi trong keywords.json/topics.json, không lạc đề bán hàng |
| C3 | Số liệu có nguồn | 100% con số (thuế suất, mức phạt, ngưỡng, hạn nộp, giá) có `fact_id` hợp lệ trong `data/facts.json`. Không fact → viết định tính hoặc bỏ. **Cấm bịa số.** |
| C4 | Căn cứ pháp lý | Chủ đề thuế phải nêu văn bản (VD: Thông tư 88/2021/TT-BTC, NĐ 123/2020/NĐ-CP) đúng tên + đúng năm |
| C5 | Không cam kết pháp lý | Cấm "chắc chắn không bị phạt", "miễn 100%", "cơ quan thuế không kiểm tra". Dùng "theo quy định hiện hành", "nên hỏi cơ quan thuế quản lý khi..." |
| C6 | Ví dụ cụ thể | ≥1 ví dụ tính toán bằng số thật (từ fact) hoặc tình huống cửa hàng cụ thể |
| C7 | Originality | Không trùng title/intent/đoạn văn với bài đã có (cả 2 kênh). Blogger phải khác hẳn web chính — gate originality quyết định |
| C8 | Giọng văn | Tiếng Việt tự nhiên, xưng "bạn", câu ngắn, người bán tạp hóa đọc hiểu được. Cấm dịch máy, cấm nhồi keyword vô nghĩa, cấm markdown lộ (`**`, `##`) trong HTML |

## 3. QUY CHUẨN SEO/AEO [BẮT BUỘC]

| # | Tiêu chí | Ngưỡng pass |
|---|---|---|
| S1 | Title | ≤65 ký tự, chứa keyword chính, không giật tít sai sự thật |
| S2 | Slug | không dấu, gạch ngang, ≤60 ký tự, chứa keyword rút gọn, KHÔNG đổi sau khi publish |
| S3 | Meta description | ≤155 ký tự, chứa keyword, có lý do bấm vào |
| S4 | Heading | Đúng 1 H1; H2 đầu chứa keyword; không nhảy cấp (H2→H4) |
| S5 | Ảnh | ≥2 ảnh, có alt, KHÔNG dùng ảnh AI/stock cho screenshot sản phẩm — chỉ ảnh AutoTax thật trong kho được phép |
| S6 | Internal link | 2–4 link đến bài liên quan/money page, anchor tự nhiên (cấm "bấm vào đây") |
| S7 | Link ngoài | Blogger→autotaxpos.com: tối đa 1, `rel="nofollow noopener noreferrer"` + UTM. Link nguồn pháp lý: được khuyến khích |
| S8 | Schema | FAQPage JSON-LD parse được (JSON.parse pass), câu hỏi khớp đúng phần FAQ hiển thị |
| S9 | LSI | Từ khóa phụ in <strong> 3–5 lần, tự nhiên trong câu |
| S10 | CTA | Đúng 1 CTA, chỉ ở kết luận. Thân bài sạch quảng cáo |

## 4. TỰ CHẤM TRƯỚC KHI PUBLISH (máy chạy tuần tự, fail là dừng)

```
1. JSON output của LLM parse được, đủ {title, slug, excerpt, html_content}
2. Đếm từ ≥ ngưỡng C1
3. Regex quét số liệu (%, đ, VNĐ, triệu, mức phạt, ngày hạn) → mỗi match phải nằm trong
   câu có gắn fact_id hoặc trích văn bản pháp lý → không thì REGENERATE
4. Kiểm tra cấm từ C5 (danh sách: "chắc chắn không bị", "miễn 100%", "không bao giờ bị phạt"...)
5. Đúng 1 <h1>; H2 đầu chứa keyword; đủ ≥2 <img> có alt; ≥1 <table>; ≥1 <blockquote>
6. JSON.parse khối ld+json; so khớp câu hỏi FAQ schema vs FAQ hiển thị
7. Check trùng: title + 3 đoạn ngẫu nhiên so với index bài cũ (originality gate)
8. Đếm link: internal 2–4; external về autotaxpos đúng policy S7
9. Title ≤65, meta ≤155, slug hợp lệ
10. Pass hết → publish. Fail → REGENERATE (max 2) → vẫn fail → HOLD + ghi lý do vào state/alerts/
```

## 5. SAU PUBLISH (trong cùng lượt chạy)

1. Read-back xác nhận bài LIVE, URL trả 200.
2. Bắn Google Indexing API cho URL mới.
3. Cập nhật `keywords.json` (`status: "published"`, `slug`) hoặc ledger Blogger (`postId`).
4. Ghi 1 dòng audit: ngày, keyword, URL, số fact dùng, kết quả các gate.

## 6. VÍ DỤ CHUẨN ĐẦU BÀI (để LLM bắt chước)

**Keyword**: "doanh thu bao nhiêu phải đóng thuế hộ kinh doanh"

> **H1**: Doanh thu bao nhiêu phải đóng thuế hộ kinh doanh? [≤65 ký tự ✓]
>
> **AEO answer (47 chữ)**: Hộ kinh doanh có doanh thu trên 100 triệu đồng/năm phải nộp thuế GTGT và thuế TNCN theo Thông tư 40/2021/TT-BTC [fact_012]. Dưới ngưỡng này, bạn được miễn hai loại thuế trên nhưng vẫn phải nộp lệ phí môn bài theo quy định hiện hành.

Sai chuẩn thường gặp phải tránh: mở bài "Trong bối cảnh kinh tế hiện nay..." (vòng vo), "chắc chắn bạn sẽ không bị phạt nếu..." (cam kết pháp lý), ảnh alt="image1" (alt rỗng nghĩa), 5 CTA rải khắp bài (spam).
