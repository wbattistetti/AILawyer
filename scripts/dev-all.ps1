# Free app ports, start API first (wait until healthy), then worker + frontend.
# Ports: 3001 (backend API), 6500 (Vite frontend).

$ErrorActionPreference = 'Continue'
$ports = @(3001, 6500)
$healthUrl = 'http://127.0.0.1:3001/health'
$healthTimeoutSec = 60
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Stop-PortListeners {
  param([int[]]$Ports)

  foreach ($port in $Ports) {
    $pids = @(
      Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )

    if ($pids.Count -eq 0) {
      Write-Host "[free] Port $port is free"
      continue
    }

    foreach ($processId in $pids) {
      if (-not $processId -or $processId -eq 0) { continue }
      $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
      Write-Host "[free] Killing PID $processId ($name) on port $port"
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Wait-ApiHealthy {
  param([string]$Url, [int]$TimeoutSec)

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 2
      if ($res.status -eq 'ok') {
        Write-Host "[dev:all] API healthy at $Url"
        return $true
      }
    } catch {
      # still starting
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if (-not $ProcessId) { return }
  try {
    & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
  } catch {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "[dev:all] Freeing ports $($ports -join ', ')..."
Stop-PortListeners -Ports $ports
Start-Sleep -Milliseconds 500

Write-Host "[dev:all] Starting API..."
$api = Start-Process -FilePath "npm.cmd" `
  -ArgumentList @('--prefix', 'backend', 'run', 'dev') `
  -WorkingDirectory $root `
  -PassThru `
  -NoNewWindow

if (-not (Wait-ApiHealthy -Url $healthUrl -TimeoutSec $healthTimeoutSec)) {
  Write-Host "[dev:all] ERROR: API did not become healthy within ${healthTimeoutSec}s ($healthUrl)"
  if ($api) { Stop-ProcessTree -ProcessId $api.Id }
  exit 1
}

try {
  Write-Host "[dev:all] Starting worker + frontend..."
  npx concurrently -n worker,web -c cyan,magenta `
    "npm --prefix backend run worker" `
    "npm run dev"
} finally {
  Write-Host "[dev:all] Shutting down API..."
  if ($api) { Stop-ProcessTree -ProcessId $api.Id }
  Stop-PortListeners -Ports $ports
}
