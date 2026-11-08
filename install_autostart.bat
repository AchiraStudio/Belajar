@echo off
setlocal
cd /d "%~dp0"
echo Mendaftarkan agent agar otomatis berjalan setiap kali kamu login ke Windows...
schtasks /Create /TN "BelajarAgent" /TR "\"%~dp0start_agent.bat\"" /SC ONLOGON /RL LIMITED /F
if errorlevel 1 (
  echo Gagal mendaftarkan tugas. Coba klik kanan file ini lalu "Run as administrator".
  pause
  exit /b 1
)
echo.
echo Selesai. Agent akan menyala otomatis saat login berikutnya.
echo Untuk menghapus:  schtasks /Delete /TN "BelajarAgent" /F
pause
