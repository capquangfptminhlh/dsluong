# MASTER SEO + AEO + GEO + AI VISIBILITY v3.2.1 — KIẾN TRÚC & LUẬT LỆ TỐI CAO (Evidence-to-Revenue)

Tài liệu này ghi nhớ toàn bộ logic và cấu hình của Hệ thống Tự động hóa SEO v3.2.1 mở rộng.

## 1. MÔ HÌNH NHÀ MÁY (5 WORKERS - 34 AGENTS)
Dự án được tự động hóa qua 5 dây chuyền (Workers) đặt trong thư mục `agents/`:

- **W1 (Orchestrate & Core)**: Điều phối hệ thống, báo cáo (`ORC-0`, `CST-26`, `RPT-27`).
- **W2 (Research & Entity)**: Đồng bộ thực thể, tìm từ khóa, phân tích khoảng trống, đo lường chuyển đổi và thực thi A/B Test (`ING-1`, `REV-33`*, `ENT-28`*, `KW-2`, `INT-3`, `GAP-4`, `CAN-5`, `PRI-6`, `EXP-34`*).
  - *ENT-28: Entity Resolver (quản lý thực thể, giải quyết xung đột).*
  - *REV-33: Revenue & Attribution (quản lý luồng chuyển đổi, bảo mật PII).*
  - *EXP-34: Experimentation Engine (vận hành A/B Test).*
- **W3 (Content)**: Tự động lên dàn ý, viết bài chuẩn Answer-First, chèn Fact ID, kiểm duyệt nội dung gắt gao (`SRC-7`, `BRF-8`, `WRT-9`, `DAT-10`, `EDT-11`, `VER-12`).
- **W4 (Media & Package)**: Tạo Ảnh Cover, bọc schema JSON-LD, tạo cấu trúc on-page H1/Slug/Canonical, rải internal link, tối ưu Local/Maps (`IMG-13`, `ONP-14`, `LNK-15`, `SCH-16`, `LOC-32`*).
  - *LOC-32: Local/Maps Manager (chống Fake Engagement và tối ưu Local).*
- **W5 (Release & Monitor)**: Kiểm toán mã nguồn, đẩy Push/PR, Submit URL, kiểm soát Bot AI và đo lường hiển thị AI (`TEC-17`, `AUD-18`, `PUB-19`, `PVF-20`, `IDX-21`, `RNK-22`, `ALM-23`, `RFR-24`, `CTR-25`, `AIV-29`*, `CPG-30`*, `AGT-31`*).
  - *AIV-29: AI Visibility Monitor (đo lường trích dẫn AI).*
  - *CPG-30: Crawler Policy Governance (kiểm soát Bot AI).*
  - *AGT-31: Agentic Readiness (chuẩn bị HTML cho AI Agents).*

## 2. QUY TẮC ĐIỀU HÀNH BÀI VIẾT (RAMP SCHEDULE)
- **Tuyệt đối tuân thủ nhịp độ (Velocity)**: 
  - Giai đoạn Canary (1-14 ngày): Tối đa **1 bài mới/ngày**.
  - Không bao giờ spam nhiều bài cùng lúc để tránh dính Sandbox của Google và dính lỗi `RESOURCE_EXHAUSTED`.
- Không sử dụng Dummy/Mock Data. Mọi dữ liệu phải lấy thực tế từ `fs` (Node.js) hoặc qua file cấu hình `data/packages.ts`, `data/facts.json`.

## 3. CHẤT LƯỢNG CONTENT ("HIGH-END SHOWROOM" & GEO)
- **Thẩm mỹ & Chuyển đổi**: Content không phải là rác SEO. Nó phải đóng vai trò như một Showroom 5 Sao.
- **Answer-First & AI Grounding (GEO)**: Nội dung phải trả lời trực diện để các AI dễ dàng trích xuất và hiển thị trích dẫn chính xác.
- **Claim Ledger**: Mọi con số/giá cước phải được tag chính xác mã `fact_id`.

## 4. QUY TRÌNH AUTO PUBLISH & MEDIA (ĐÃ CẬP NHẬT)
- **Tạo Content & Banner Tự động:** Các bài viết được sinh ra bởi script `generate-content.js` sẽ tự động dùng `sharp` để tạo ra Banner ảnh nền gradient có chèn sẵn cú pháp đăng ký, sau đó đường dẫn Banner được LLM chèn trực tiếp vào dưới thẻ H1 của Markdown.
- **Xoay vòng LLM API (Round-Robin):** Luôn dùng mảng cấu hình có nhiều API keys (ví dụ 7 Keys Gemini) trong `generate-content.js`. Nếu Key 1 lỗi Quota/Rate Limit, tự động Catch và Switch sang Key 2 để hệ thống không bao giờ sập (Fault-tolerant).
- **Lịch trình Đăng Bài:** Github Action (`daily-publish.yml`) được cài đặt chạy cron hằng ngày tự trigger `generate-content.js` để pick 1 keyword chưa viết và xuất bản. 

## 5. QUY TRÌNH DEPLOY LÊN VPS
- BẮT BUỘC dùng lệnh `node deploy_v32.cjs` để tự động nén mã nguồn, upload, và build trên VPS. Tuyệt đối không nén thủ công.
- Fallback ảnh bài viết cũ/không có ảnh đã được xử lý qua `pollinations.ai` (sinh động tự động).
