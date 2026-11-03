# Vòng đo thứ hạng (đã nối khép kín)

- `update_ranks.js` — kéo GSC 30 ngày → ghi `lastRank`, `clicks30d`, `impressions30d`, `lastCheckedAt` vào `seo-engine/data/keywords.json`, append lịch sử vào `rank_history.jsonl`, in danh sách bài cần refresh (published nhưng rank null hoặc >20).
- `run_update_ranks.bat` — wrapper ghi log `rank_update.log`.

## Đặt lịch chạy mỗi tuần (Windows Task Scheduler)

Chạy 1 lần trong terminal (quyền user thường là đủ):

```bat
schtasks /Create /SC WEEKLY /D MON /ST 08:00 /TN "AutoTax_GSC_Ranks" /TR "D:\AutoTax\seo-bots\run_update_ranks.bat"
```

Xóa lịch: `schtasks /Delete /TN "AutoTax_GSC_Ranks" /F`

## Yêu cầu

- `google_credentials.json` (service account) nằm cùng thư mục, **không commit lên git** (đã gitignore).
- Service account phải được thêm vào Google Search Console property `autotaxpos.com` với quyền Restricted trở lên.
