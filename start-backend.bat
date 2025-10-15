@echo off
setlocal
cd /d "%~dp0backend"

rem Default: OCR inline, zero queue/worker, locale/offline
set "PORT=3001"
set "ENABLE_QUEUE=false"
set "OCR_ENGINE=poppler"
set "OCR_LANG=ita+eng"
set "STORAGE_MODE=local"

rem Assicura i dati lingua localmente (prima volta prova auto-download)
if not exist "tessdata" mkdir "tessdata"
if not exist "tessdata\ita.traineddata" (
  echo [Setup OCR] Scarico ita.traineddata (una volta sola)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $url='https://github.com/tesseract-ocr/tessdata_fast/raw/main/ita.traineddata'; ^
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile 'tessdata\ita.traineddata'; ^
            Write-Host '[Setup OCR] OK' } ^
     catch { Write-Host '[Setup OCR] Impossibile scaricare. Copia manualmente il file in backend\tessdata e riavvia.' }"
)

npm run dev
endlocal


