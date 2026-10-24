param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$backendPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimePath = Join-Path $backendPath '.runtime'
$envPath = Join-Path $backendPath '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Configure backend/.env antes de iniciar a API.' }
$apiPort = 3001
$apiHost = '127.0.0.1'
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^PORT=(\d+)\s*$') { $apiPort = [int]$Matches[1] }
    if ($line -match '^HOST=([a-zA-Z0-9.:-]+)\s*$') { $apiHost = $Matches[1] }
}
$probeHost = if ($apiHost -eq '0.0.0.0' -or $apiHost -eq '::') { '127.0.0.1' } else { $apiHost }
$probe = "http://${probeHost}:${apiPort}/api/v1/health"
if ($Restart) {
    $pidPath = Join-Path $runtimePath 'api.pid'
    if (Test-Path -LiteralPath $pidPath) {
        $ownedPid = [int](Get-Content -LiteralPath $pidPath -Raw)
        $ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownedPid"
        if ($ownedProcess) {
            if ($ownedProcess.Name -ne 'node.exe' -or $ownedProcess.CommandLine -notmatch '--env-file=\.env.*server\.mjs') { throw 'PID nao corresponde ao processo esperado da API; reinicio cancelado.' }
            Stop-Process -Id $ownedPid -Force
            Start-Sleep -Milliseconds 500
        }
    }
}
try {
    $health = Invoke-RestMethod -Uri $probe -TimeoutSec 5
    if ($health.data.database -eq 'oracle' -and $health.data.status -eq 'ok') {
        Write-Output "API e Oracle ja disponiveis: $probe"
        exit 0
    }
} catch { }
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
$nodePath = (Get-Command node.exe).Source
$apiProcess = Start-Process -FilePath $nodePath -ArgumentList '--env-file=.env', 'server.mjs' -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'api.stdout.log') -RedirectStandardError (Join-Path $runtimePath 'api.stderr.log') -PassThru
$apiProcess.Id | Set-Content -LiteralPath (Join-Path $runtimePath 'api.pid')
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    Start-Sleep -Milliseconds 1000
    $apiProcess.Refresh()
    if ($apiProcess.HasExited) { throw 'API encerrou ao iniciar. Consulte backend/.runtime/api.stderr.log.' }
    try {
        $health = Invoke-RestMethod -Uri $probe -TimeoutSec 5
        if ($health.data.database -eq 'oracle' -and $health.data.status -eq 'ok') {
            Write-Output "API iniciada em segundo plano (PID $($apiProcess.Id)); Oracle conectado: $probe"
            exit 0
        }
    } catch { }
}
throw 'API iniciou, mas Oracle nao respondeu ao health check. Consulte backend/.runtime/api.stderr.log.'
