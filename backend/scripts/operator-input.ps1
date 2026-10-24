param([switch]$TestLogin)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')))
$operatorNames = (Read-Host 'Informe os usuarios separados por virgula').Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() }
$securePassword = Read-Host 'Senha (entrada oculta)' -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $payload = @{ usernames = @($operatorNames); password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr) } | ConvertTo-Json -Compress
    if ($TestLogin) { $payload | node --env-file=.env test/auth-oracle.mjs }
    else { $payload | node scripts/prepare-operators.mjs }
    if ($LASTEXITCODE -ne 0) { throw 'Operacao nao concluida.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
    $payload = $null
    $securePassword.Dispose()
}
