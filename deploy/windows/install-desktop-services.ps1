param(
  [string]$InstallRoot = "$env:ProgramFiles\Adisyum",
  [string]$BridgeExecutable = "$InstallRoot\DesktopBridge\AdisyumPosAgent.exe"
)

$ErrorActionPreference = 'Stop'
$startupPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$serviceName = 'AdisyumDesktopBridge'

if (-not (Test-Path -LiteralPath $BridgeExecutable)) {
  throw "Bridge executable not found: $BridgeExecutable"
}

New-Item -ItemType Directory -Force -Path "$InstallRoot\Logs" | Out-Null
Set-ItemProperty -Path $startupPath -Name 'AdisyumDesktopBridge' -Value "`"$BridgeExecutable`""

if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
  New-Service -Name $serviceName -BinaryPathName "`"$BridgeExecutable`"" -DisplayName 'Adisyum Desktop Bridge' -StartupType Automatic
}

Start-Service -Name $serviceName
Write-Host 'Adisyum Desktop Bridge startup registration completed.'
