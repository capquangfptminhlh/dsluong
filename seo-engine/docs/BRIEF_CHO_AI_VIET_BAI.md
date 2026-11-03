# Brief hoàn chỉnh để giao cho AI viết bài + tạo ảnh

Đưa nguyên file này cho AI khác. Nó chứa đủ mọi thứ cần biết, không cần đọc thêm tài liệu nào.

---

## Phần 1 — Bối cảnh

Bạn viết bài cho một hệ thống 5 blog tiếng Việt phục vụ chủ tiệm nhỏ ở Việt Nam. Mỗi blog một ngành riêng, **nội dung không được trùng ý nhau**.

| siteId | Blog | Viết cho ai | Chỉ bàn chuyện gì |
|---|---|---|---|
| `quan-nho-fnb` | Quán Nhỏ Vận Hành Gọn | Chủ quán cà phê, trà sữa, quán ăn | Order theo bàn, định lượng nguyên liệu, giờ cao điểm, ca kíp, hao hụt bếp |
| `tap-hoa-retail` | Tạp Hóa Thông Minh | Chủ tiệm tạp hóa, cửa hàng bán lẻ | Hàng nghìn mã hàng, hạn sử dụng, giá nhập đổi liên tục, sổ nợ khách quen |
| `spa-beauty` | Spa Vận Hành Chuẩn | Chủ spa, tiệm nail, tiệm tóc | Đặt lịch, liệu trình nhiều buổi, hoa hồng thợ, giữ chân khách cũ |
| `ban-online-ecom` | Bán Online Không Rối | Người bán Shopee, TikTok Shop, livestream | Đối soát sàn, hàng hoàn, đồng bộ tồn nhiều kênh, chốt đơn livestream |
| `autotax-blogger-pilot` | Tiệm Nhỏ Chạy Êm | Chủ tiệm nói chung | Checklist vận hành chung |

Giọng văn: xưng "bạn", câu ngắn, hướng dẫn làm được ngay trong ngày. Viết như người trong nghề nói với đồng nghiệp, không giảng lý thuyết.

---

## Phần 2 — Định dạng nộp

Mỗi blog nộp **một file JSON chứa mảng 30 bài**, đặt tại `content-bank/blogger/<siteId>/goi-30-bai.json`.

Ảnh (nếu có) để **cùng thư mục** với file JSON.

```json
[
  {
    "topicId": "quan-nho-fnb-kiem-hang-sang",
    "title": "Kiểm hàng trước khi mở quán",
    "intent": "morning-stock-check",
    "cluster": "pos-operations",
    "sourceFactIds": ["fact_005"],
    "labels": ["vận hành"],
    "image": { "file": "kiem-hang-sang.png", "alt": "Minh họa chủ quán kiểm tra nguyên liệu trước giờ mở cửa" },
    "body": "<p>...</p><h2>...</h2><p>...</p>",
    "factClaims": [
      { "factId": "fact_005", "claim": "chép nguyên văn statement của fact_005" }
    ]
  }
]
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `topicId` | ✓ | Chữ thường không dấu, gạch ngang, bắt đầu bằng `<siteId>-`, duy nhất |
| `title` | ✓ | Không trùng bất kỳ bài nào khác trong cả 5 blog |
| `intent` | ✓ | Chuỗi không dấu mô tả ý định tìm kiếm, mỗi bài một intent khác |
| `cluster` | ✓ | Chọn 1 trong 8 giá trị ở Phần 4 |
| `sourceFactIds` | ✓ | Mã fact bài này dựa vào (Phần 5) |
| `labels` | | Nhãn, để `[]` cũng được |
| `image` | | Ảnh riêng cho bài. Bỏ trống thì hệ thống tự lấy ảnh chung theo cluster |
| `body` | ✓ | HTML, luật ở Phần 3 |
| `factClaims` | ✓ | Mỗi fact dùng trong bài phải khai ở đây, `claim` chép **nguyên văn 100%** |

---

## Phần 3 — Luật viết `body` (chỗ rớt nhiều nhất)

### Cấu trúc
1. **Ký tự đầu tiên phải là `<p>`** — không khoảng trắng, không `<div>`, không heading đứng trước. Đoạn này trả lời thẳng câu hỏi của tiêu đề, tối thiểu 30 ký tự chữ.
2. Sau đó **ít nhất 3 thẻ `<h2>`**. Mỗi `<h2>` tiêu đề ≥8 ký tự, bên dưới có ít nhất một `<p>` hoặc `<li>` dài ≥20 ký tự.
3. Thẻ được phép: `<p> <h2> <h3> <ul> <ol> <li> <strong> <em>`. Cấm `<div> <script> <style> <iframe>`, cấm markdown (`**`, `##`).
4. **Không tự chèn thẻ `<img>` hay `<a>`** — hệ thống tự gắn ảnh và link.

### Luật số liệu — quan trọng nhất

> Ngoài những câu chép nguyên văn từ danh sách fact, **toàn bộ phần còn lại của bài (kể cả tiêu đề `<h2>`) không được chứa chữ số nào**, và không được dùng các từ sau:

```
giá · phí · cước · tháng · năm · ngày · giờ · vnd · vnđ · trăm · nghìn · triệu · tỷ
sms · soạn · đăng ký · hủy · gb · mb · ưu đãi · miễn phí · cam kết · bảo đảm · khuyến mại
```

Cả **chữ số viết bằng chữ** cũng nên tránh: một, hai, ba, bốn, năm, sáu, bảy, tám, chín, mười.

| Đừng viết | Viết là |
|---|---|
| kiểm kê mỗi tháng | kiểm kê theo định kỳ |
| 3 bước sau đây | các bước sau đây |
| giá vốn | mức vốn |
| phí giao hàng | khoản chi giao hàng |
| cuối ngày | khi kết thúc ca |
| sau 2 tuần | sau một thời gian ngắn |
| miễn phí | không mất chi phí |
| soạn dụng cụ | chuẩn bị dụng cụ |
| đăng ký tài khoản | tạo tài khoản |

**Lưu ý:** từ cấm bị bắt ở mọi vị trí, kể cả trong tiêu đề `<h2>`. Ví dụ `<h2>Soạn theo dịch vụ</h2>` sẽ bị loại vì chữ "soạn".

---

## Phần 4 — Giá trị `cluster` hợp lệ

`pos-operations` · `store-closing-operations` · `business-overview` · `revenue-monitoring` · `inventory-management` · `product-management` · `tax-reporting` · `e-invoice`

Chọn cluster đúng nội dung bài — nó quyết định ảnh minh họa nếu bạn không kèm ảnh riêng.

---

## Phần 5 — Danh sách fact được phép dùng

**Chỉ những câu dưới đây mới được chứa số.** Chép nguyên văn 100%, sai một dấu chấm là bài bị loại.

```
fact_001: Hộ kinh doanh, cá nhân kinh doanh có doanh thu từ 1 tỷ đồng/năm trở xuống được miễn thuế giá trị gia tăng và thuế thu nhập cá nhân.
         [căn cứ: Nghị định 141/2026/NĐ-CP sửa đổi Nghị định 68/2026/NĐ-CP, hiệu lực từ 01/01/2026]

fact_002: Giá phần mềm AutoTax POS gói Cơ Bản là 150.000 VNĐ/tháng.

fact_003: Kể từ ngày 1/7/2022, 100% doanh nghiệp và hộ kinh doanh nộp thuế theo phương pháp kê khai bắt buộc phải sử dụng hóa đơn điện tử.
         [căn cứ: Nghị định 123/2020/NĐ-CP]

fact_004: Từ ngày 01/01/2026, hình thức thuế khoán và lệ phí môn bài đối với hộ kinh doanh, cá nhân kinh doanh được xóa bỏ.
         [căn cứ: Điều 10 Nghị quyết 198/2025/QH15]

fact_005: Phần mềm AutoTax POS có chức năng chốt ca cuối ngày và đối chiếu tiền mặt cho cửa hàng.

fact_006: Phần mềm AutoTax POS hỗ trợ quản lý lô hàng theo hạn sử dụng và ưu tiên bán lô sắp hết hạn trước.

fact_007: Phần mềm AutoTax POS cho phép phân quyền nhân viên theo từng nhóm chức năng và ghi lại nhật ký thao tác.

fact_008: Từ năm 2026, hộ kinh doanh và cá nhân kinh doanh chuyển từ phương pháp khoán sang phương pháp kê khai và tự nộp thuế, chỉ còn nộp thuế giá trị gia tăng và thuế thu nhập cá nhân.
         [căn cứ: Nghị quyết 198/2025/QH15 và Nghị định 68/2026/NĐ-CP]
```

**Cách dùng phần "căn cứ":** khi bài cần viện dẫn văn bản pháp luật, chỉ được nhắc đúng những văn bản trong ngoặc vuông ở trên, chép đúng số hiệu. Không nêu tên hay số hiệu văn bản nào khác, kể cả khi bạn nghĩ mình nhớ đúng.

**Lưu ý:** phần trong ngoặc vuông là ghi chú cho người viết, **không chép vào `claim`**. `claim` chỉ chép đúng câu statement.

> Danh sách này chốt ngày 02/08/2026. Nếu file `data/facts.json` đã đổi, chạy lại lệnh sau để lấy bản mới:
> ```bash
> node -e "console.log(require('./data/facts.json').map(f=>f.factId+': '+f.statement).join('\n'))"
> ```

Nếu muốn nói điều gì mà không có fact tương ứng, hãy viết định tính ("tùy ngành nghề", "theo quy định hiện hành") — **tuyệt đối không tự nghĩ ra con số, hạn nộp hay mức phạt**.

---

## Phần 6 — Luật tạo ảnh

Ảnh là **tùy chọn**. Không kèm thì hệ thống dùng ảnh chung theo cluster (đã có sẵn 20 ảnh).

Nếu tạo ảnh:

| Yêu cầu | Chi tiết |
|---|---|
| Định dạng | `.png` hoặc `.jpg` |
| Dung lượng | 5KB – 2MB |
| Kích thước | Khuyên 1200×675 (16:9) |
| Nội dung | **Tranh minh họa bối cảnh** — quầy hàng, kệ hàng, quán, thao tác của người bán |
| `alt` | Mô tả thật nội dung ảnh bằng tiếng Việt, tối thiểu 10 ký tự |

**Tuyệt đối không vẽ giao diện phần mềm.** AI không dựng nổi giao diện thật — chữ sẽ méo, nút bấm vô nghĩa, người đọc nhận ra ngay là giả và bài mất uy tín. Chỉ vẽ bối cảnh đời thường, **không có chữ trong ảnh**.

Prompt mẫu để sinh ảnh:
```
<mô tả cảnh bằng tiếng Anh>, flat vector illustration, clean sharp lines,
warm colors, Vietnamese small business setting, no text, no letters, no numbers,
no user interface
```

---

## Phần 7 — Tự kiểm trước khi nộp

Với **mỗi bài**, kiểm đủ 7 điểm:

1. `body` bắt đầu đúng bằng `<p>`, đoạn đầu ≥30 ký tự chữ
2. Có ≥3 thẻ `<h2>`, mỗi mục có đoạn nội dung ≥20 ký tự
3. Không có `<img>`, `<a>`, `<div>`, không markdown
4. Quét toàn bài (kể cả `<h2>`): ngoài câu fact, **không còn chữ số và không còn từ cấm nào**
5. Mỗi câu fact chép nguyên văn 100%, nằm trong `<p>`, và khai lại y hệt trong `factClaims`
6. `topicId`, `title`, `intent` không trùng bất kỳ bài nào khác
7. Nếu có ảnh: file tồn tại cùng thư mục, đúng đuôi, có `alt` mô tả thật

30 bài trong cùng một blog phải **khác nhau hoàn toàn về ý** — không bài nào diễn đạt lại bài khác.
