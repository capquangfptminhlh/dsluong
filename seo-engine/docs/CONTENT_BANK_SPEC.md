# Đặc tả nhập bài viết sẵn (Content Bank)

Dùng khi bạn viết bài bằng công cụ khác rồi nạp vào hàng đợi, thay vì để pipeline tự sinh lúc 00:00.

**Nguyên tắc không đổi: bài nhập vào vẫn phải qua đủ mọi cổng kiểm định.** Nhập bài không phải là đường vòng để né gate — chỉ là đổi chỗ *sinh* nội dung, còn chỗ *duyệt* giữ nguyên. Bài không đạt sẽ bị từ chối kèm lý do cụ thể để sửa.

---

## 1. Định dạng file

Chấp nhận cả 3 cách sắp xếp, chọn cách nào tiện thì dùng:

| Cách | Đường dẫn | Ghi chú |
|---|---|---|
| Mỗi bài một file | `content-bank/blogger/<siteId>/<bài>.json` | `siteId` lấy từ tên thư mục |
| **Gói nhiều bài (khuyên dùng cho 120 bài)** | `content-bank/blogger/<siteId>/goi.json` | File chứa **mảng** `[ {...}, {...} ]` |
| Một gói cho tất cả | `content-bank/blogger/tat-ca.json` | Mảng, **mỗi bài tự khai `"siteId"`** |

Với 120 bài, gọn nhất là **4 file — mỗi blog một file chứa 30 bài**.

`siteId` hợp lệ (xem `config/blogger-sites.json`):
`quan-nho-fnb` · `tap-hoa-retail` · `spa-beauty` · `ban-online-ecom` · `autotax-blogger-pilot`

```json
{
  "topicId": "quan-nho-fnb-kiem-hang-buoi-sang",
  "title": "Kiểm hàng buổi sáng trước khi mở quán",
  "intent": "morning-stock-check",
  "cluster": "pos-operations",
  "sourceFactIds": ["fact_005"],
  "labels": ["vận hành", "quán ăn"],
  "body": "<p>...</p><h2>...</h2><p>...</p>",
  "factClaims": [
    { "factId": "fact_005", "claim": "Chép nguyên văn statement của fact_005" }
  ]
}
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `topicId` | ✓ | Duy nhất toàn hệ thống. Đặt tiền tố bằng `siteId` cho dễ tra |
| `title` | ✓ | Không trùng bất kỳ bài nào đã có ở mọi kênh |
| `intent` | ✓ | Chuỗi không dấu, mô tả ý định tìm kiếm, duy nhất |
| `cluster` | ✓ | Quyết định ảnh minh họa. Chỉ được dùng 1 trong 8 giá trị ở mục 3 |
| `sourceFactIds` | ✓ | Mã fact trong `data/facts.json` mà bài này dựa vào |
| `labels` | | Nhãn Blogger, để trống cũng được |
| `body` | ✓ | HTML, xem luật ở mục 2 |
| `factClaims` | ✓ | Mỗi fact dùng trong bài phải khai ở đây, `claim` **chép nguyên văn** |

---

## 2. Luật viết `body` — đọc kỹ, đây là chỗ rớt nhiều nhất

### Cấu trúc
- **Ký tự đầu tiên phải là `<p>`** — không khoảng trắng, không `<div>`, không heading đứng trước. Đoạn này là câu trả lời trực tiếp, tối thiểu 30 ký tự chữ.
- Sau đó **ít nhất 3 thẻ `<h2>`**. Mỗi `<h2>` tiêu đề ≥8 ký tự và bên dưới phải có ít nhất một `<p>` hoặc `<li>` dài ≥20 ký tự.
- Thẻ được phép: `<p> <h2> <h3> <ul> <ol> <li> <strong> <em> <a>`. Cấm `<script> <style> <iframe> <div>`, cấm thuộc tính sự kiện (`onclick`…), cấm cú pháp markdown (`**`, `##`).
- **Không tự chèn ảnh** — hệ thống tự gắn ảnh thật của AutoTax theo `cluster`.
- **Không tự chèn link** — hệ thống tự gắn 1 link kèm UTM đúng chuẩn.

### Luật số liệu (nghiêm ngặt nhất)

> Ngoài các câu chép nguyên văn từ fact, **toàn bộ phần còn lại của bài không được chứa chữ số nào**, và không được dùng các từ sau:

`giá` · `phí` · `cước` · `tháng` · `năm` · `ngày` · `giờ` · `vnd` · `vnđ` · `trăm` · `nghìn` · `triệu` · `tỷ` · `sms` · `soạn` · `đăng ký` · `hủy` · `gb` · `mb` · `ưu đãi` · `miễn phí` · `cam kết` · `bảo đảm` · `khuyến mại`

Cách viết thay thế:

| Đừng viết | Viết là |
|---|---|
| "kiểm kê mỗi tháng" | "kiểm kê theo định kỳ" |
| "3 bước sau đây" | "các bước sau đây" |
| "giá vốn" | "mức vốn" |
| "phí giao hàng" | "khoản chi giao hàng" |
| "cuối ngày" | "khi kết thúc ca" |
| "sau 2 tuần" | "sau một thời gian ngắn" |
| "miễn phí" | "không mất chi phí" |

Riêng câu chép từ fact thì giữ nguyên 100%, kể cả số trong đó.

---

## 3. Giá trị `cluster` hợp lệ

| cluster | Ảnh sẽ dùng |
|---|---|
| `pos-operations` | Màn hình bán hàng POS |
| `store-closing-operations` | Màn hình bán hàng POS |
| `business-overview` | Màn hình tổng quan |
| `revenue-monitoring` | Màn hình tổng quan |
| `inventory-management` | Màn hình hàng hóa & kho |
| `product-management` | Màn hình hàng hóa & kho |
| `tax-reporting` | Màn hình thuế & hóa đơn |
| `e-invoice` | Màn hình thuế & hóa đơn |

---

## 4. Cách nạp

```bash
node scripts/import-blogger-articles.mjs content-bank/blogger
```

Script sẽ: kiểm từng bài qua đúng bộ gate của hệ thống → in bảng đạt/trượt kèm lý do → chỉ ghi bài đạt vào hàng đợi. Bài trượt **không** vào hàng đợi, bạn sửa rồi chạy lại (chạy nhiều lần an toàn).

Bài đạt sẽ được worker lấy ra đăng theo lịch bình thường — vẫn 1 bài/đêm luân phiên 5 blog, vẫn qua kiểm tra trùng lặp và đối chiếu ảnh trước khi lên.

---

## 5. Phân chia chủ đề sẵn cho 4 blog

Mỗi blog 30 bài, chia theo 6 nhóm × 5 bài. Cách chia này bám vào **việc thật xảy ra trong ngày** của từng nghề, nên 4 blog không đụng ý nhau — điều kiện sống còn để không bị coi là mạng lưới blog vệ tinh.

Trong mỗi blog, ưu tiên nhóm **"Đang nóng"** trước (5–8 bài đầu) vì đó là thứ người ta đang tìm ngay bây giờ.

### `quan-nho-fnb` — Quán cà phê, trà sữa, quán ăn
| Nhóm | 5 hướng đề tài |
|---|---|
| 🔥 Đang nóng | Quán nhỏ có phải xuất hóa đơn từng ly nước · Bán mang về ghi doanh thu ra sao · Khách quét mã chuyển khoản, đối chiếu thế nào · Thu ngân kiêm pha chế thì kiểm soát tiền ra sao · Quán mở dưới nhà có tính là hộ kinh doanh |
| Giờ cao điểm | Trình tự nhận order lúc đông · Chuẩn bị trước giờ khách đông · Xử lý khi bếp nghẽn món · Chia việc giữa quầy và bếp · Khách chờ lâu thì xoay xở |
| Nguyên liệu | Định lượng cho từng món · Nhận nguyên liệu tươi mỗi sáng · Hao hụt trong bếp · Nguyên liệu sắp hết giữa ca · Đổi nhà cung cấp mà không loạn công thức |
| Bàn và món | Gộp bàn tách bàn · Chuyển món sang bàn khác · Khách hủy món đã báo bếp · Món hết giữa giờ bán · Đặt bàn trước |
| Ca kíp | Bàn giao ca không cãi nhau · Đếm tiền cuối ca · Nhân viên mới ngày đầu · Ai được sửa hóa đơn · Ca đêm ít người |
| Khách quen | Nhớ món quen của khách · Xử lý khách phàn nàn tại chỗ · Giữ khách sáng đi làm · Bán combo · Khách đặt qua điện thoại |

### `tap-hoa-retail` — Tạp hóa, cửa hàng bán lẻ
| Nhóm | 5 hướng đề tài |
|---|---|
| 🔥 Đang nóng | Tiệm tạp hóa có phải chuyển sang kê khai không · Bán hàng không hóa đơn đầu vào thì ghi sổ sao · Máy tính tiền có bắt buộc không · Doanh thu nhỏ có phải làm sổ không · Khách chuyển khoản, có tính vào doanh thu không |
| Hàng nghìn mã | Đặt mã hàng dễ tra · Nhóm hàng theo cách khách hỏi · Rà mã trùng · Đặt tên hàng cho nhân viên mới hiểu · Hàng không mã vạch |
| Date và tồn | Phát hiện hàng cận hạn sớm · Đẩy lô cũ ra trước · Hàng bán chậm chôn vốn · Kiểm kê từng nhóm · Hàng hỏng vỡ trong ca |
| Giá cả | Giá nhập lên xuống liên tục · Nhiều mức giá cho khách sỉ và lẻ · Bán lẻ từ thùng lớn · Làm tròn tiền lẻ · Đổi giá giữa ngày |
| Sổ nợ | Ghi sổ cho khách quen · Nhắc nợ không mất lòng · Khách trả góp từng ít · Nợ lâu không đòi được · Ai được phép cho nợ |
| Quầy đông | Nhiều người cùng bán một quầy · Khách xếp hàng dài · Trả hàng đổi hàng · Mất điện giữa giờ · Trông quầy hộ lúc chủ vắng |

### `spa-beauty` — Spa, nail, tóc
| Nhóm | 5 hướng đề tài |
|---|---|
| 🔥 Đang nóng | Spa bán liệu trình ghi doanh thu khi nào · Tiệm nhỏ có phải xuất hóa đơn dịch vụ không · Khách trả trước cả gói thì tính sao · Thuê thợ theo ca có phải khai không · Bán mỹ phẩm kèm dịch vụ tách doanh thu ra sao |
| Lịch hẹn | Không trùng giờ kỹ thuật viên · Khách đến trễ · Hủy hẹn sát giờ · Xếp phòng và giường · Kỹ thuật viên nghỉ đột xuất |
| Liệu trình | Theo dõi số buổi còn lại · Ghi chú tình trạng khách · Khách đổi kỹ thuật viên giữa liệu trình · Liệu trình bỏ dở lâu ngày · Nhắc lịch buổi tiếp theo |
| Nhân sự | Hoa hồng minh bạch · Thợ mới học việc · Ai được xem hồ sơ khách · Thợ nghỉ mang khách đi · Chấm công theo ca |
| Sản phẩm | Mỹ phẩm dùng trong dịch vụ và bán lẻ · Hàng mở nắp dùng dở · Đặt hàng theo mùa · Sản phẩm khách dị ứng · Bán thẻ thành viên |
| Giữ khách | Nhắc quay lại đúng lúc · Khách im lặng bỏ đi · Chăm khách sinh nhật · Khách giới thiệu khách · Đánh giá sau buổi làm |

### `ban-online-ecom` — Shopee, TikTok Shop, livestream
| Nhóm | 5 hướng đề tài |
|---|---|
| 🔥 Đang nóng | Sàn đã khấu trừ thuế rồi có phải khai nữa không · Bán online có phải đăng ký hộ kinh doanh không · Doanh thu sàn đối chiếu với sổ sách ra sao · Livestream chốt đơn ghi nhận thế nào · Nhiều gian hàng một chủ thì gộp doanh thu sao |
| Đối soát | Tiền sàn về không khớp đơn · Khoản sàn giữ lại · Đơn hoàn sau khi đã đối soát · Nhiều sàn một lúc · Kỳ đối soát lệch nhau |
| Tồn kho | Đồng bộ tồn nhiều kênh · Vượt tồn phải hủy đơn · Hàng hoàn về kho · Mã hàng khác nhau giữa các sàn · Hàng đặt trước |
| Livestream | Chốt đơn không sót khách · Ghi đơn lúc live · Khách bùng đơn sau live · Chuẩn bị hàng trước buổi live · Nhiều người cùng chốt |
| Đóng gói | Hàng chục đơn không nhầm địa chỉ · In tem vận đơn · Kiểm hàng trước khi giao · Hàng dễ vỡ · Giao nhiều đơn cùng khu |
| Giá và khuyến mãi | Giá sỉ và lẻ cùng lúc · Chạy khuyến mãi sàn mà không lỗ · Đối thủ phá giá · Combo bán kèm · Đổi giá hàng loạt |

**Cách bắt trend không rủi ro:** nhóm "Đang nóng" bám vào **quy định thuế đang đổi năm 2026** — đây là chủ đề người kinh doanh thật sự đang tìm, chứ không phải trend giải trí nhất thời. Với chủ đề này, mọi con số phải lấy từ danh sách fact; nếu chưa có fact cho điều muốn nói thì viết định tính, đừng đoán.

---

## 6. Prompt để đưa cho AI viết bài

Dán nguyên khối dưới đây, thay `{CHARTER}`, `{SITE_ID}`, `{DANH_SACH_30_TIEU_DE}`, `{FACTS}`:

```
Bạn viết bài cho một blog tiếng Việt. Chuyên mục: {CHARTER}

Viết 30 bài theo danh sách tiêu đề dưới đây. Trả về DUY NHẤT một MẢNG JSON gồm 30 phần
tử, không kèm giải thích, mỗi phần tử theo mẫu:

{"siteId":"{SITE_ID}","topicId":"...","title":"...","intent":"...","cluster":"...",
 "sourceFactIds":[...],"labels":[],"body":"<p>...</p>",
 "factClaims":[{"factId":"...","claim":"..."}]}

- topicId: chữ thường không dấu, gạch ngang, bắt đầu bằng "{SITE_ID}-", duy nhất
- intent: chuỗi không dấu mô tả ý định tìm kiếm, mỗi bài một intent khác nhau
- cluster: chọn 1 trong 8 giá trị: pos-operations, store-closing-operations,
  business-overview, revenue-monitoring, inventory-management, product-management,
  tax-reporting, e-invoice

LUẬT VỀ body — vi phạm là bài bị loại tự động:
1. Ký tự đầu tiên PHẢI là <p>. Đoạn mở đầu trả lời thẳng câu hỏi của tiêu đề, tối thiểu
   30 ký tự chữ.
2. Sau đó ít nhất 3 thẻ <h2>, mỗi mục có ít nhất một <p> hoặc <li> dài trên 20 ký tự.
3. Chỉ dùng thẻ: <p> <h2> <h3> <ul> <ol> <li> <strong> <em>. Không <div>, không <script>,
   không markdown, KHÔNG tự chèn ảnh hay link (hệ thống tự gắn).
4. QUAN TRỌNG NHẤT — ngoài những câu chép nguyên văn từ danh sách fact bên dưới, TOÀN BỘ
   phần còn lại KHÔNG được chứa bất kỳ chữ số nào (0-9) và KHÔNG được dùng các từ:
   giá, phí, cước, tháng, năm, ngày, giờ, vnd, vnđ, trăm, nghìn, triệu, tỷ, sms, soạn,
   đăng ký, hủy, gb, mb, ưu đãi, miễn phí, cam kết, bảo đảm, khuyến mại.
   Viết thay: "theo định kỳ", "khi kết thúc ca", "mức vốn", "khoản chi", "các bước sau",
   "không mất chi phí", "sau một thời gian ngắn".
5. Mỗi fact dùng trong bài phải chép NGUYÊN VĂN 100% thành một câu riêng nằm trong <p>,
   và khai lại Y HỆT trong factClaims. Sai một dấu chấm cũng bị loại.
6. Giọng văn: xưng "bạn", câu ngắn, hướng dẫn làm được ngay trong ngày, không lý thuyết.
   Viết như người trong nghề nói với đồng nghiệp.
7. 30 bài phải khác nhau hoàn toàn về ý — không bài nào diễn đạt lại bài khác.

DANH SÁCH 30 TIÊU ĐỀ:
{DANH_SACH_30_TIEU_DE}

DANH SÁCH FACT ĐƯỢC PHÉP DÙNG (chỉ những câu này mới được chứa số):
{FACTS}
```

Lấy `{FACTS}` bằng lệnh:

```bash
node -e "console.log(require('./data/facts.json').map(f=>f.factId+': '+f.statement).join('\n'))"
```
