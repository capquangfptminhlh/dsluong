# QUY TẮC CHỐNG MOCK, CHỐNG GIẢ LẬP KẾT QUẢ VÀ CHỐNG BÁO CÁO SAI SỰ THẬT

## 1. Mức ưu tiên
Các quy tắc trong tài liệu này là bắt buộc và có mức ưu tiên cao đối với mọi nhiệm vụ lập trình trong dự án.
Không được bỏ qua, diễn giải giảm nhẹ hoặc tự ý thay đổi các quy tắc này để hoàn thành nhiệm vụ nhanh hơn.

## 2. Cấm dữ liệu giả và kết quả giả
CẤM sử dụng những nội dung sau nếu người dùng chưa yêu cầu hoặc phê duyệt rõ ràng:
* Mock data.
* Fake data.
* Dữ liệu mẫu được trình bày như dữ liệu thật.
* Giá trị placeholder.
* Kết quả hardcode.
* API response hardcode.
* Logic luôn trả về thành công.
* ID, token, người dùng, đơn hàng, doanh thu hoặc số liệu tự tạo.
* Screenshot, log, terminal output hoặc kết quả test được tự viết lại hay bịa ra.
* Fallback âm thầm trả về dữ liệu giả khi API hoặc cơ sở dữ liệu lỗi.

## 3. Quy định đối với mock trong kiểm thử
Mặc định CẤM sử dụng mock, stub, fake server hoặc simulated response. Chỉ được sử dụng khi người dùng yêu cầu hoặc phê duyệt rõ ràng.

## 4. Quy trình bắt buộc đối với mọi nhiệm vụ code
1. Kiểm tra cấu trúc dự án và code hiện tại.
2. Xác định lệnh cài đặt, build, lint, test và chạy ứng dụng thực tế.
3. Viết hoặc chỉnh sửa code.
4. Chạy formatter hoặc linter nếu dự án có cấu hình.
5. Chạy build.
6. Chạy test.
7. Khởi động ứng dụng hoặc dịch vụ nếu môi trường cho phép.
8. Kiểm tra trực tiếp chức năng vừa thay đổi.
9. Nếu có lỗi, đọc lỗi, sửa và chạy lại.
10. Chỉ được báo hoàn thành sau khi các bước kiểm chứng cần thiết đã đạt yêu cầu.

## 5. Bằng chứng kiểm chứng bắt buộc
Mọi tuyên bố như hoàn thành, hoạt động ổn định, đã sửa xong, API hoạt động... phải đi kèm bằng chứng thực tế (Lệnh chính xác, Output thật của terminal, Endpoint đã kiểm tra).

## 6. Phân loại trạng thái báo cáo
Chỉ được sử dụng một trong các trạng thái:
* VERIFIED: Đã chạy và kiểm tra thực tế, có bằng chứng.
* PARTIALLY VERIFIED: Một phần đã kiểm tra, còn phần chưa kiểm chứng.
* UNVERIFIED: Code đã viết nhưng chưa chạy/kiểm tra thực tế.
* BLOCKED: Không thể tiếp tục do thiếu điều kiện.

## 7. Trường hợp không thể chạy
Phải thông báo rõ điều kiện đang thiếu, lệnh đã thử, lỗi thực tế và phần chưa kiểm chứng. Cấm giả lập điều kiện để báo hoàn thành.

## 8. Cấm làm sai lệch kết quả kiểm thử
CẤM xóa test, bỏ qua test, tắt validation/type checking, che exit code (`|| true`), suppress lỗi quan trọng chỉ để làm test pass.

## 9. Cấm triển khai giả hoặc chưa hoàn chỉnh
CẤM coi TODO, FIXME, hàm rỗng, return null tạm thời... là hoàn thành.

## 10. Kiểm tra dữ liệu và tích hợp thật
Phải kiểm tra request thật, response thật, dữ liệu thật đã được lưu/đọc. Không fallback sang dữ liệu giả.

## 11. Không thực hiện thay đổi ngoài phạm vi để che lỗi
Không tự ý thay đổi yêu cầu, loại bỏ chức năng khó, hạ phiên bản công nghệ để tránh lỗi.

## 12. Báo cáo cuối nhiệm vụ
Bắt buộc báo cáo theo mẫu:
### Trạng thái
### Thay đổi đã thực hiện
### Lệnh đã chạy
### Kết quả thực tế
### Kết quả kiểm tra
### Dữ liệu và môi trường
### Phần chưa kiểm chứng
### Checklist bắt buộc

## 13. Nguyên tắc cuối cùng
Thà báo chưa hoàn thành vì gặp lỗi cụ thể còn hơn báo hoàn thành sai sự thật. Báo cáo sai kết quả, bịa output là lỗi nghiêm trọng nhất.

## 14. Quy định hiển thị khi sửa code (Tiết kiệm Token & Trách nhiệm hiển thị)
Khi sửa code hoặc tường thuật lại trong câu trả lời, CHỈ hiển thị phần thay đổi dưới dạng diff (`diff` code block), tuyệt đối KHÔNG dán lại toàn bộ file code. Điều này giúp tối ưu chi phí token cho người dùng và giữ cho báo cáo luôn ngắn gọn, dễ duyệt.

## 15. Quy tắc Kiến trúc Vận hành & Bảo vệ Pipeline (Operational Architecture Guardrails)
1. **Cơ chế Rollback Hàng đợi (Queue Rollback)**:
   Trong các pipeline tự động (như tạo bài -> build/deploy), nếu bước sinh nội dung/file tạo ra file mới thành công nhưng bước build/deploy sau đó thất bại, hệ thống BẮT BUỘC phải thực hiện rollback (chụp snapshot và xóa các file chưa được publish) trước khi abort. Nếu không, hàng đợi sẽ nhầm tưởng từ khóa đó "đã xuất bản" ở các lượt sau và bỏ qua mãi mãi.
2. **Chuẩn hóa Exit Code cho Script/CLI**:
   Mọi script thực thi độc lập (đặc biệt trong cron/pipeline) BẮT BUỘC kết thúc khối catch tổng bằng `process.exit(1)` hoặc `process.exitCode = 1` (`main().catch(err => { console.error(err); process.exit(1); })`). Tuyệt đối CẤM dùng `catch(console.error)` đơn thuần khiến Node.js trả về exit code 0 khi gặp lỗi ngầm.
3. **Trung thực trong Kiểm chứng Cron/Lịch hẹn (Scheduled Tasks Integrity)**:
   Đối với dịch vụ cron hoặc tác vụ lặp lịch tự động, cấm tuyên bố trạng thái `VERIFIED` khi mới chỉ cấu hình hoặc test tay. Trạng thái bắt buộc phải là `PARTIALLY VERIFIED` cho tới khi thời điểm lặp lịch đến và file log tự động của cron (ví dụ `/var/log/...`) thực sự được tạo ra và xác minh.
4. **An toàn Ký tự XML/SVG (SVG & XML Character Escaping)**:
   Khi tạo SVG hoặc XML trong code (như tạo ảnh banner bằng Sharp), BẮT BUỘC escape toàn bộ các ký tự đặc biệt (`&`, `<`, `>`) cho cả biến động lẫn chuỗi văn bản tĩnh hardcode (`&` -> `&amp;`, `<` -> `&lt;`, `>` -> `&gt;`). Một ký tự `&` unescaped duy nhất trong văn bản SVG sẽ gây lỗi Fatal `xmlParseEntityRef: no name` làm sập native module.
