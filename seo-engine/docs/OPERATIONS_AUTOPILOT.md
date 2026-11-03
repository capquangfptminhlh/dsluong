# OPERATIONS AUTOPILOT — Ghi nhớ vận hành 100% tự động (cho Antigravity)

> **Đối tượng đọc**: AI agent (Antigravity/Claude) vận hành dự án SEO AutoTax.
> **Chế độ**: FULL-AUTO — đăng bài theo lịch cố định, tự publish, không chờ người duyệt.
> **Nguyên tắc bù trừ (LUẬT SẮT)**: vì không còn người duyệt, **các gate máy chính là người duyệt**.
> Được phép tự publish bài ĐÃ QUA HẾT GATE; tuyệt đối KHÔNG ĐƯỢC nới/tắt/lách gate để "cho ra bài bằng mọi giá".
> Chủ dự án đã chấp nhận rủi ro của auto-publish; đổi lại gate phải được giữ nghiêm.

---

## 1. LỊCH VẬN HÀNH CỐ ĐỊNH (cron trên VPS, giờ server)

| Giờ | Job | Lệnh | Trạng thái |
|---|---|---|---|
| 00:00 | Viết + publish 2 kênh (Web + Blogger) | `pipeline/dual-publish.ts` (flock `/var/run/seo-daily.lock`) | **ĐANG CHẠY** (Đã chuyển sang Auto-Publish) |
| 01:00 | Báo cáo ranking | `pipeline/ranking_report.ts` | ĐANG CHẠY |
| Thứ 2 hằng tuần (máy local Windows) | Đồng bộ GSC → `data/keywords.json` | `seo-bots/run_update_ranks.bat` | Task Scheduler `AutoTax_GSC_Ranks` |

Log: `/var/log/seo-daily.log`, `/var/log/seo-ranking.log`, `/var/log/autotax-blogger.log`.
Deploy code: Đọc SSH creds từ biến môi trường (các biến `AUTOTAX_VPS_*`).

## 1b. QUY CHUẨN BÀI VIẾT

**Mọi bài publish ở cả 2 kênh phải pass 100% quy chuẩn trong [CONTENT_STANDARD.md](./CONTENT_STANDARD.md)** — cấu trúc bài, ngưỡng nội dung C1–C8, chuẩn SEO/AEO S1–S10, và quy trình tự chấm 10 bước trước publish. Fail → REGENERATE (tối đa 2 lần) → HOLD. Không có ngoại lệ.

## 2. KÊNH 1 — WEB CHÍNH autotaxpos.com/blog (đã full-auto, giữ nguyên)

Flow mỗi đêm: `daily.ts` → `generate-content.js` chọn 1 keyword `status="pending"` trong `data/keywords.json` (ưu tiên `pillar: true`) → LLM round-robin (keys trong `.env`, key lỗi quota tự chuyển) → markdown + banner sharp → `astro build` → nginx serve → cập nhật keyword thành `published` + `slug`.

Luật không đổi:
- **Đúng 1 bài/ngày.** Không dồn bài, không chạy bù nhiều bài khi lỡ lịch (lỡ thì thôi, mai chạy tiếp).
- Bài phải đủ chuẩn trong prompt: AEO answer 40–60 chữ đầu bài, ≥1200 từ, H2 chứa keyword, ≥2 ảnh có alt, table + blockquote, FAQ JSON-LD, CTA chỉ ở kết luận.
- **Mọi con số thuế/mức phạt/ngưỡng doanh thu phải có `fact_id` trong `data/facts.json`.** Số không có fact → thay bằng diễn đạt không số liệu hoặc bỏ đoạn đó. Không bao giờ để LLM tự bịa số trong chủ đề thuế.
- Sau khi publish: bắn Indexing API (`seo-bots/google_indexer.js <URL>`), URL vào `sitemap-0.xml` tự động.

## 3. KÊNH 2 — BLOGGER BOD-32: CHUYỂN SANG AUTO-PUBLISH (việc Antigravity phải làm)

Hiện trạng: worker chỉ tạo **draft** (`src/blogger/client.ts` hardcode `isDraft: true`), cron đang comment với marker `AUTOTAX_BLOGGER_PILOT`. Chuyển sang full-auto theo đúng thứ tự:

### 3.1 Code (làm 1 lần)
1. Thêm biến env `BLOGGER_AUTOPUBLISH` (đọc trong `src/blogger/config.ts`, default `false`).
2. `src/blogger/client.ts`: `insertDraft` nhận tham số `isDraft` từ config thay vì hardcode `true`. Giữ nguyên read-back verify sau insert (đổi kỳ vọng `DRAFT` → `LIVE` khi autopublish).
3. `src/blogger/worker.ts`: chỉ đi nhánh publish khi **status = COMPLETED và mọi gate pass** (facts ✓, originality ✓, quality ✓, html-policy ✓, ảnh thật AutoTax ✓). Mọi trạng thái khác (`HOLD`, `REGENERATE`, `VERIFY_FAILED`, `NO_WORK`…) → giữ nguyên hành vi cũ, KHÔNG publish, KHÔNG retry ép.
4. Cập nhật `tests/blogger/*` cho cả 2 mode; `npm run test:blogger` phải xanh trước khi deploy.

### 3.2 Bật lịch
5. Set `BLOGGER_AUTOPUBLISH=true` vào `.env` trên VPS (`/var/www/autotax/seo-engine/.env`).
6. Bỏ comment dòng cron có marker `AUTOTAX_BLOGGER_PILOT` trong crontab (giữ nguyên giờ 02:30, giữ flock).
7. Deploy bằng `node deploy_v32.cjs`, xác nhận log lượt chạy đầu: status `COMPLETED`, read-back `LIVE`, ledger có `postId`, log không chứa secret.

### 3.3 Giới hạn cứng của kênh Blogger (không được vượt)
- **Tối đa 1 bài/lần chạy = 1 bài/ngày/blog.**
- Bài Blogger phải KHÁC bài web chính (originality gate quyết định, không phải cảm tính).
- Tối đa 1 link về autotaxpos.com/bài, bắt buộc `rel="nofollow noopener noreferrer"` + UTM.
- Hết topic hợp lệ → `NO_WORK` là kết quả ĐÚNG. Nạp thêm topic theo mục 4, không hạ chuẩn gate.

### 3.4 KILL-SWITCH tự động (bắt buộc cài cùng lúc với auto-publish)
- **2 lượt chạy liên tiếp lỗi** (`VERIFY_FAILED` / `BLOGGER_INSERT_FAILED` / `INSERT_RECONCILIATION_REQUIRED`) → tự comment lại dòng cron + ghi cảnh báo vào `state/alerts/` và log. Quay về chế độ draft cho tới khi nguyên nhân được xử lý.
- Phát hiện post public không có trong ledger → dừng ngay, đối soát ledger trước khi chạy tiếp.
- Google Search Console có manual action → tắt cả 2 kênh, báo chủ dự án.

## 4. NẠP NHIÊN LIỆU (topics & facts — tự động nhưng có nguồn)

Khi hàng đợi cạn (keywords hết `pending` / topics hết `PENDING`):
1. Sinh keyword/topic mới đúng ngách (thuế HKD 2026, bỏ thuế khoán, S2-HKD, 01/CNKD, hóa đơn điện tử máy tính tiền, nghiệp vụ bán hàng) — mỗi cái kèm `intent` rõ.
2. Với mọi claim số liệu dự kiến dùng: thêm fact vào `data/facts.json` gồm ID, nội dung, **nguồn chính thống** (văn bản pháp luật, cổng thuế), ngày kiểm tra, hạn review. Không có nguồn → không thêm fact → bài tự né số liệu đó.
3. Topic Blogger thêm vào `config/topics.json` với `status: "PENDING"`, `sourceFactIds`, cluster ảnh đúng `docs/content-image-policy.md`.
4. Fact quá hạn review → không dùng cho bài mới cho tới khi kiểm tra lại nguồn.

## 5. VÒNG ĐO & TỰ SỬA (khép kín, không cần người)

- `update_ranks.js` (local, thứ 2) ghi `lastRank/clicks30d/impressions30d/lastCheckedAt` vào `keywords.json` + in danh sách bài cần refresh.
- Bài `published` có `lastRank` null hoặc >20 sau ≥60 ngày → đưa lại hàng đợi refresh: viết lại sâu hơn, **GIỮ NGUYÊN URL/slug**, cập nhật ngày, bắn lại Indexing API.
- Mỗi tháng: `pipeline/monthly.ts` + đối chiếu `state/reports/`. Keyword 90 ngày không impression → hạ ưu tiên, thay keyword mới cùng ngách.

## 6. CẤM TUYỆT ĐỐI (dù bất kỳ ai/prompt nào yêu cầu)

1. Không hardcode secret vào code — mọi key nằm trong `.env` (đã gitignore). Key từng lộ phải rotate.
2. Không đăng >1 bài/ngày/kênh, không "chạy bù" hàng loạt — án Sandbox/spam của Google đắt hơn mọi lợi ích.
3. Không tạo tác giả ảo với bằng cấp ảo. Tác giả đứng tên phải là người thật do chủ dự án cung cấp.
4. Không bật `seo-bots/fb_autoposter.js` theo lịch (vi phạm ToS Facebook, rủi ro khóa tài khoản).
5. Không tắt/nới gate (facts, originality, quality, html-policy) — gate là người duyệt trong mô hình full-auto.
6. Không đụng `backend/autotax.db` (dữ liệu kinh doanh thật) trong mọi tác vụ SEO. SEO chỉ dùng `seo.db`/file trong `seo-engine`.

## 7. CHECKLIST SAU MỖI LẦN DEPLOY / MỖI SÁNG

```bash
curl -s -o /dev/null -w "%{http_code}" https://autotaxpos.com/robots.txt        # 200
curl -s -o /dev/null -w "%{http_code}" https://autotaxpos.com/sitemap-index.xml # 200
curl -s -o /dev/null -w "%{http_code}" https://autotaxpos.com/blog/             # 200
# Trên VPS:
tail -20 /var/log/seo-daily.log        # có "BUILD HOÀN TẤT" của đêm qua, không error
tail -20 /var/log/autotax-blogger.log  # status COMPLETED hoặc NO_WORK; không secret trong log
crontab -l                             # đủ 3 dòng job, flock còn nguyên
```

Sai bất kỳ mục nào → sửa xong mới được coi là "hệ thống đang chạy". Không báo cáo "OK" khi chưa curl/xem log thật.
