@echo off
echo ============================================
echo    AutoTax - Khoi dong che do Production
echo ============================================
echo.

echo [1/2] Dang build Frontend (React)...
cd /d "%~dp0frontend"
call npx.cmd vite build
if %ERRORLEVEL% NEQ 0 (
    echo LOI: Build frontend that bai!
    pause
    exit /b 1
)
echo [OK] Frontend build thanh cong!
echo.

echo [2/2] Dang khoi dong Backend Server...
cd /d "%~dp0backend"

rem Nap cau hinh bi mat tu file rieng (khong day len GitHub)
if exist "%~dp0secrets.bat" (
    call "%~dp0secrets.bat"
) else (
    echo.
    echo [CANH BAO] Khong tim thay file secrets.bat
    echo Hay chep secrets.example.bat thanh secrets.bat va dien khoa bi mat.
    echo.
    pause
    exit /b 1
)
echo.
echo ============================================
echo    Server dang chay tai http://localhost:3001
echo    Nhan Ctrl+C de dung server
echo ============================================
node server.js
pause
