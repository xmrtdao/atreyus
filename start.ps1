# Start the installed application without duplicating listeners.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logs = Join-Path $root 'backend_ai\results'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

if (-not (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath 'py' -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8000','--no-access-log' -WorkingDirectory "$root\backend_ai" -RedirectStandardOutput "$logs\server-out.log" -RedirectStandardError "$logs\server-error.log" -WindowStyle Hidden
}
if (-not (Get-NetTCPConnection -State Listen -LocalPort 5174 -ErrorAction SilentlyContinue)) {
    if (-not (Test-Path "$root\dist\index.html")) {
        Push-Location $root
        try {
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
        } finally { Pop-Location }
    }
    Start-Process -FilePath 'node' -ArgumentList 'node_modules/vite/bin/vite.js','preview','--host','0.0.0.0','--port','5174','--strictPort' -WorkingDirectory $root -RedirectStandardOutput "$logs\frontend-out.log" -RedirectStandardError "$logs\frontend-error.log" -WindowStyle Hidden
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        if ($health.version -like '3.*') { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw "Atreyus API is not ready. See $logs\server-error.log" }
Write-Host 'Atreyus frontend: http://localhost:5174'
Write-Host 'Hosted frontend uses the compiled dist build. Rebuild after frontend changes.'
Write-Host "Atreyus API: version $($health.version), build $($health.build)"
Write-Host 'Public URL: https://atreyus.mobilemonero.com (existing Cloudflare tunnel required)'
