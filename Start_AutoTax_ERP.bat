@echo off
title AutoTax ERP - Server Manager
color 0B

echo ===================================================
echo       KHOI DONG HE THONG AUTOTAX ERP (LOCAL)
echo ===================================================
echo.
rem Nap cau hinh bi mat tu file rieng (khong day len GitHub)
if exist "%~dp0secrets.bat" (
    call "%~dp0secrets.bat"
) else (
    echo [CANH BAO] Khong tim thay secrets.bat
    echo Hay chep secrets.example.bat thanh secrets.bat va dien khoa bi mat.
    pause
    exit /b 1
)

echo [1/3] Dang khoi dong Backend (Database ^& API)...
start "AutoTax Backend" cmd /k "cd backend && set JWT_SECRET=%JWT_SECRET% && set SUPERADMIN_PHONE=%SUPERADMIN_PHONE% && set WEBHOOK_SECRET=%WEBHOOK_SECRET% && node server.js"

echo [2/3] Dang khoi dong Frontend (React UI)...
start "AutoTax Frontend" cmd /k "cd frontend && npm run dev"

echo [3/3] Dang mo trinh duyet web...
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Hoan tat! Ban co the thu nho cua so nay.
echo De tat ung dung, hay dong cac cua so Terminal vua hien ra.
echo ===================================================
pause
