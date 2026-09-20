param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$mysqlRoot = Join-Path $workspace '.local/mysql'
$serverBinary = Join-Path $mysqlRoot 'mysql-8.4.11-winx64/bin/mysqld.exe'
$adminBinary = Join-Path $mysqlRoot 'mysql-8.4.11-winx64/bin/mysqladmin.exe'
$configPath = Join-Path $mysqlRoot 'my.ini'
$clientConfig = Join-Path $mysqlRoot 'admin.cnf'
foreach ($requiredPath in @($serverBinary, $adminBinary, $configPath, $clientConfig)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw 'The workspace-local MySQL installation is missing. See server/prisma/README.md for setup with your own MySQL instance.'
    }
}

if ($Action -eq 'stop') {
    & $adminBinary "--defaults-file=$clientConfig" --connect-timeout=3 shutdown
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the workspace database.' }
    Write-Output 'Workspace MySQL stopped.'
    exit
}

function Test-WorkspaceMysql {
    $ErrorActionPreference = 'SilentlyContinue'
    & $adminBinary "--defaults-file=$clientConfig" --connect-timeout=2 ping *> $null
    return ($LASTEXITCODE -eq 0)
}

if (Test-WorkspaceMysql) { Write-Output 'Workspace MySQL is running at 127.0.0.1:3307.'; exit }
if ($Action -eq 'status') { Write-Output 'Workspace MySQL is not running.'; exit 1 }

Start-Process -FilePath $serverBinary -ArgumentList @('--defaults-file="' + $configPath + '"') -WindowStyle Hidden | Out-Null
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-WorkspaceMysql) { Write-Output 'Workspace MySQL is ready at 127.0.0.1:3307.'; exit }
}
throw 'MySQL did not become ready. Inspect .local/mysql/mysql-error.log.'
