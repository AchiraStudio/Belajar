@echo off
setlocal
cd /d "%~dp0"
title Belajar - Agent lokal

if not exist ".env" (
  echo File .env belum ada. Salin .env.example menjadi .env lalu isi nilainya.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Menyiapkan lingkungan Python untuk pertama kali, mohon tunggu...
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Python 3 belum terpasang. Pasang dari python.org ^(centang "Add to PATH"^) lalu jalankan lagi.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Gagal memasang dependensi. Periksa koneksi internet.
    pause
    exit /b 1
  )
)

:loop
".venv\Scripts\python.exe" agent.py
if errorlevel 2 (
  echo Konfigurasi belum lengkap. Periksa file .env.
  pause
  exit /b 2
)
echo Agent berhenti. Menyala ulang dalam 5 detik... ^(tutup jendela ini untuk berhenti^)
timeout /t 5 /nobreak >nul
goto loop
