# BOD-32 — Quy trình xuất bản Blogger an toàn cho AutoTax

Mục tiêu: chỉ tạo nội dung hữu ích, khác với web chính `autotaxpos.com/blog` và đã được kiểm chứng. Blogger không được dùng để đăng hàng loạt, lặp nội dung hoặc ép link.

## Quy tắc không được phá vỡ

1. BOD-32 chỉ tạo **Draft**. Không gọi Blogger publish API; người phụ trách tự bấm Publish trong Blogger.
2. Mỗi lần chạy tạo tối đa một draft cho một blog.
3. Không có fact hợp lệ, topic hợp lệ, ảnh thật AutoTax phù hợp, hoặc nội dung đủ khác web chính: `HOLD`; không được lách gate.
4. Link về `https://autotaxpos.com/` chỉ khi có ngữ cảnh trực tiếp, tối đa một link/bài; bắt buộc HTTPS, UTM và `rel="nofollow noopener noreferrer"`.
5. Không bật cron trước khi các draft thực tế được review đạt chất lượng.

## Trước khi thêm topic

- Xác định intent riêng của Blogger; không trùng title/intent với bài web chính.
- Thêm fact vào `data/facts.json`: ID, nội dung, nguồn, thời điểm kiểm tra, hiệu lực và thời điểm review lại.
- Với claim quan trọng, dùng nguồn chính thống; không lấy web chính AutoTax làm nguồn duy nhất.
- Thêm topic ID duy nhất vào `config/topics.json` với site/blog đích, tiêu đề, intent, cluster, `contentVersion`, `sourceFactIds` và trạng thái `PENDING`.
- Chọn ảnh screenshot AutoTax đúng cluster theo `docs/content-image-policy.md`; thiếu ảnh thì không tạo draft.

## Tiêu chuẩn một draft đạt chất lượng

- Tiêu đề đúng topic, không giật gân; mở đầu trả lời trực tiếp câu hỏi.
- Có tối thiểu ba phần hướng dẫn hoặc giải thích có ích, cùng điều kiện áp dụng/lưu ý khi có fact.
- FAQ ngắn khi phù hợp.
- Không chứa số liệu, mức giá, thời hạn, cam kết hoặc claim nếu không có fact ID còn hiệu lực.
- Không sao chép bài web chính, boilerplate hay thay từ khóa.
- Dùng đúng một ảnh thật AutoTax phù hợp; không ảnh mặc định, AI hoặc stock.
- Nếu có link, chỉ một link liên quan trực tiếp với anchor tự nhiên và đúng policy.

## Quy trình mỗi lần chạy

1. Chạy worker Blogger thủ công trong Pilot.
2. Chỉ coi là thành công khi status `COMPLETED`, post read-back là `DRAFT`, ledger có `postId`, và log không có secret.
3. Mở draft trong Blogger, review theo tiêu chuẩn trên.
4. Nếu đạt, người phụ trách tự bấm Publish; nếu không, giữ/xóa draft và sửa topic, fact, ảnh hoặc generator trước lượt sau.
5. Ghi audit: topic, post ID, review URL, quyết định Publish/HOLD và lý do.

## Trạng thái và hành động

| Trạng thái | Hành động |
| --- | --- |
| `COMPLETED` | Review thủ công trước Publish. |
| `NO_WORK` | Bổ sung topic/fact đã review; không chạy lại để ép số lượng. |
| `HOLD` / `REGENERATE` | Sửa đầu vào; không bypass gate. |
| `INSERT_RECONCILIATION_REQUIRED` | Kiểm tra ledger và Blogger; không tạo lại mù. |
| `VERIFY_FAILED` / `BLOGGER_INSERT_FAILED` | Kiểm tra post ID/ledger/API trước khi thử lại. |

## Điều kiện bật cron

- Có ít nhất 5 topic đã fact-check và review riêng.
- Có ít nhất 3 draft chất lượng đã được duyệt thủ công.
- Không có draft trùng, post public ngoài ý muốn hoặc secret trong log.
- Ledger/read-back chạy ổn ở mọi lượt Pilot.
- Có người chịu trách nhiệm review fact hết hạn và chất lượng draft.

Khi bật cron, vẫn chỉ một draft/lần chạy. Hai lượt liên tiếp `HOLD`, lỗi, hoặc chất lượng giảm thì tắt cron và quay về workflow thủ công.

## Checklist trước Publish

- [ ] Khác rõ ràng với web chính AutoTax.
- [ ] Fact quan trọng còn hiệu lực và có nguồn.
- [ ] Ảnh thật AutoTax đúng chủ đề.
- [ ] Link (nếu có) hữu ích và đúng policy.
- [ ] Đã đọc ở desktop/mobile trong Blogger preview.
- [ ] Không có mục tiêu phủ keyword hoặc đủ số lượng.
