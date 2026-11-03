@echo off
rem ============================================================
rem  MAU CAU HINH BI MAT
rem
rem  Cach dung: chep file nay thanh "secrets.bat" (cung thu muc),
rem  roi thay cac gia tri ben duoi bang chuoi ngau nhien cua rieng ban.
rem  File secrets.bat KHONG duoc day len GitHub.
rem ============================================================

rem Khoa ky token dang nhap — dat chuoi ngau nhien dai >= 32 ky tu
set JWT_SECRET=THAY_BANG_CHUOI_NGAU_NHIEN_CUA_BAN

rem So dien thoai tai khoan quan tri he thong
set SUPERADMIN_PHONE=0900000000

rem Khoa cho webhook ngan hang / san TMDT
rem De trong = chan hoan toan webhook (an toan mac dinh)
set WEBHOOK_SECRET=THAY_BANG_CHUOI_NGAU_NHIEN_KHAC
