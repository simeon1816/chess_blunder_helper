# setup.ps1 — downloads Stockfish.js and chess.js into extension/lib/
# Run once from the extension/ directory:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"
$libDir = Join-Path $PSScriptRoot "lib"
New-Item -ItemType Directory -Force -Path $libDir | Out-Null

Write-Host "Downloading chess.js 0.12.0 ..."
Invoke-WebRequest `
  -Uri "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.12.0/chess.min.js" `
  -OutFile (Join-Path $libDir "chess.min.js")

Write-Host "Downloading Stockfish.js (single-file build, works as Web Worker) ..."
# Stockfish 10 — confirmed single-file UCI Web Worker from cdnjs (~2 MB, fast)
# For Stockfish 18 strength swap the URL for:
#   https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-asm.js
Invoke-WebRequest `
  -Uri "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js" `
  -OutFile (Join-Path $libDir "stockfish.js")

Write-Host ""
Write-Host "Done. Files in $libDir :"
Get-ChildItem $libDir | ForEach-Object { Write-Host "  $($_.Name)  ($([math]::Round($_.Length/1KB, 1)) KB)" }

Write-Host ""
Write-Host "Load the extension in Chrome:"
Write-Host "  1. Go to chrome://extensions"
Write-Host "  2. Enable Developer mode (top right)"
Write-Host "  3. Click 'Load unpacked' -> select this folder"
