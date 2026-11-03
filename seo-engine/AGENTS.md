## Development
*LƯU Ý QUAN TRỌNG: Kiến trúc dự án đã nâng cấp lên v3.2.1 (Evidence-to-Revenue) với 34 Agents. Xin hãy đọc [Kiến trúc v3.2.1](file:///D:/AutoTax/seo-engine/docs/ARCHITECTURE_v3.2.1.md) trước khi chỉnh sửa bất kỳ agent nào.*

**VẬN HÀNH FULL-AUTO — ĐỌC TRƯỚC KHI LÀM BẤT KỲ VIỆC GÌ:**
1. [docs/OPERATIONS_AUTOPILOT.md](file:///D:/AutoTax/seo-engine/docs/OPERATIONS_AUTOPILOT.md) — lịch cron cố định, quy trình auto-publish 2 kênh (web chính + Blogger BOD-32), kill-switch, mục CẤM TUYỆT ĐỐI, checklist xác minh hằng ngày.
2. [docs/CONTENT_STANDARD.md](file:///D:/AutoTax/seo-engine/docs/CONTENT_STANDARD.md) — quy chuẩn bắt buộc cho MỌI bài viết: cấu trúc, C1–C8, S1–S10, tự chấm 10 bước trước publish. Bài không pass → không publish, không có ngoại lệ.

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
