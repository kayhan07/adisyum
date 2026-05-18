param([string]$ServiceName = 'AdisyumDesktopBridge')

$ErrorActionPreference = 'Stop'
$startupPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $ServiceName -Force
  sc.exe delete $ServiceName | Out-Null
}

Remove-ItemProperty -Path $startupPath -Name 'AdisyumDesktopBridge' -ErrorAction SilentlyContinue
Write-Host 'Adisyum Desktop Bridge startup registration removed.'
