param(
    [string]$SolutionRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$Configuration = 'Release',
    [string]$PublishRoot = (Join-Path $PSScriptRoot '..\artifacts\windows'),
    [string]$Version = '1.0.0',
    [string]$Channel = 'stable',
    [string]$Publisher = 'CN=Adisyum, O=Adisyum',
    [string]$CertificateThumbprint = $env:ADISYUM_SIGNING_THUMBPRINT,
    [string]$CertificatePath = $env:ADISYUM_SIGNING_PFX,
    [string]$CertificatePassword = $env:ADISYUM_SIGNING_PFX_PASSWORD,
    [string]$TimestampServer = 'http://timestamp.digicert.com',
    [string]$DownloadBaseUrl = $env:ADISYUM_DOWNLOAD_BASE_URL,
    [switch]$ReleaseApproved,
    [switch]$PilotApproved,
    [switch]$StagedRolloutApproved,
    [switch]$RequireSigning
)

$ErrorActionPreference = 'Stop'

function Write-Stage([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-SignTool {
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtool) { return $signtool.Source }

    $kits = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "${env:ProgramFiles}\Windows Kits\10\bin"
    )
    foreach ($kit in $kits) {
        if (-not (Test-Path $kit)) { continue }
        $found = Get-ChildItem -Path $kit -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\signtool.exe$' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Invoke-CodeSign([string]$Path) {
    if (-not (Test-Path $Path)) { throw "Signing target missing: $Path" }
    $signtool = Get-SignTool
    if (-not $signtool) {
        if ($RequireSigning) { throw 'signtool.exe not found and signing is required.' }
        Write-Warning "signtool.exe not found; skipping signature for $Path"
        return $false
    }

    $args = @('sign', '/fd', 'SHA256', '/tr', $TimestampServer, '/td', 'SHA256')
    if ($CertificateThumbprint) {
        $args += @('/sha1', $CertificateThumbprint)
    } elseif ($CertificatePath) {
        $args += @('/f', $CertificatePath)
        if ($CertificatePassword) { $args += @('/p', $CertificatePassword) }
    } else {
        if ($RequireSigning) { throw 'No signing certificate thumbprint or PFX configured.' }
        Write-Warning "No signing certificate configured; skipping signature for $Path"
        return $false
    }

    $args += $Path
    & $signtool @args
    if ($LASTEXITCODE -ne 0) { throw "signtool failed for $Path" }
    return $true
}

function Test-CodeSignatureRequired([string]$Path) {
    $signature = Get-AuthenticodeSignature -FilePath $Path
    if ($signature.Status -ne 'Valid') {
        throw "Invalid Authenticode signature for ${Path}: $($signature.Status)"
    }
    return $signature.SignerCertificate.Thumbprint
}

function Get-FileSha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Get-ManifestDigestPayload($Manifest) {
    return @(
        $Manifest.version,
        $Manifest.runtimeVersion,
        $Manifest.buildNumber,
        $Manifest.channel,
        $Manifest.track,
        $Manifest.downloadUrl,
        $Manifest.checksum,
        $Manifest.publisher,
        $Manifest.publisherThumbprint,
        $Manifest.timestampServer,
        [string]$Manifest.signedInstaller,
        [string]$Manifest.signedBinaries,
        [string]$Manifest.signedUpdater,
        [string]$Manifest.stagedRolloutPercent,
        $Manifest.minimumBridgeVersion,
        $Manifest.minimumTrayVersion,
        $Manifest.safeUpdateWindow,
        [string]$Manifest.releaseApproval.required,
        [string]$Manifest.releaseApproval.approved
    ) -join '|'
}

function Get-Sha256Text([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

Write-Stage 'Preparing publish directories'
New-Item -ItemType Directory -Force -Path $PublishRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PublishRoot 'bridge') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PublishRoot 'tray') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PublishRoot 'updater') | Out-Null

Write-Stage 'Publishing bridge runtime'
dotnet publish (Join-Path $SolutionRoot 'tools\adisyum-pos-agent\AdisyumPosAgent.csproj') -c $Configuration -r win-x64 --self-contained false -o (Join-Path $PublishRoot 'bridge')

Write-Stage 'Publishing tray runtime'
dotnet publish (Join-Path $SolutionRoot 'tools\adisyum-tray\AdisyumTray.csproj') -c $Configuration -r win-x64 --self-contained false -o (Join-Path $PublishRoot 'tray')

Write-Stage 'Publishing updater service'
dotnet publish (Join-Path $SolutionRoot 'tools\adisyum-updater\AdisyumUpdater.csproj') -c $Configuration -r win-x64 --self-contained false -o (Join-Path $PublishRoot 'updater')

Write-Stage 'Signing runtime binaries'
$bridgeExe = Join-Path $PublishRoot 'bridge\AdisyumPosAgent.exe'
$trayExe = Join-Path $PublishRoot 'tray\AdisyumTray.exe'
$updaterExe = Join-Path $PublishRoot 'updater\AdisyumUpdater.exe'
$signedBridge = Invoke-CodeSign $bridgeExe
$signedTray = Invoke-CodeSign $trayExe
$signedUpdater = Invoke-CodeSign $updaterExe
$effectivePublisherThumbprint = $CertificateThumbprint

if ($RequireSigning) {
    $bridgeThumbprint = Test-CodeSignatureRequired $bridgeExe
    $trayThumbprint = Test-CodeSignatureRequired $trayExe
    $updaterThumbprint = Test-CodeSignatureRequired $updaterExe
    $unexpectedThumbprints = @($bridgeThumbprint, $trayThumbprint, $updaterThumbprint) | Where-Object { $_ -ne $CertificateThumbprint }
    if ($CertificateThumbprint -and $unexpectedThumbprints) {
        throw 'Runtime signature thumbprint verification failed.'
    }
    $uniqueThumbprints = @($bridgeThumbprint, $trayThumbprint, $updaterThumbprint) | Select-Object -Unique
    if ($uniqueThumbprints.Count -ne 1) {
        throw 'Runtime binaries must be signed with the same publisher certificate.'
    }
    $effectivePublisherThumbprint = $uniqueThumbprints[0]
} elseif (-not $effectivePublisherThumbprint) {
    $updaterSignature = Get-AuthenticodeSignature -FilePath $updaterExe
    if ($updaterSignature.Status -eq 'Valid') {
        $effectivePublisherThumbprint = $updaterSignature.SignerCertificate.Thumbprint
    }
}

Write-Stage 'Preparing signed release manifest'
$installerFileName = "AdisyumSetup-$Version.exe"
$downloadUrl = if ($DownloadBaseUrl) { "$($DownloadBaseUrl.TrimEnd('/'))/$installerFileName" } else { '' }
$manifest = [ordered]@{
    version = $Version
    runtimeVersion = $Version
    buildNumber = (Get-Date).ToString('yyyyMMddHHmm')
    channel = $Channel
    track = $Channel
    changelog = 'See release notes in the enterprise changelog.'
    downloadUrl = $downloadUrl
    checksum = ''
    signature = ''
    manifestDigest = ''
    publisher = $Publisher
    publisherThumbprint = $effectivePublisherThumbprint
    timestampServer = $TimestampServer
    signedInstaller = $false
    signedBinaries = [bool]($signedBridge -and $signedTray)
    signedUpdater = [bool]$signedUpdater
    stagedRolloutPercent = 100
    minimumBridgeVersion = $Version
    minimumTrayVersion = $Version
    targetTenants = @()
    safeUpdateWindow = '02:00-06:00'
    tenantSafeRollout = $true
    rollbackSnapshot = $true
    partialDownloadRecovery = $true
    releaseApproval = [ordered]@{
        required = $true
        approved = [bool]$ReleaseApproved
        approvedBy = ''
        approvedAt = ''
    }
    pilotApproval = [ordered]@{
        required = $Channel -in @('stable', 'hotfix')
        approved = [bool]($PilotApproved -or $Channel -in @('internal', 'pilot'))
    }
    stagedRolloutApproval = [ordered]@{
        required = $true
        approved = [bool]$StagedRolloutApproved
    }
}
$manifest.manifestDigest = Get-Sha256Text (Get-ManifestDigestPayload $manifest)
$manifestPath = Join-Path $PublishRoot 'release-manifest.json'
$manifest | ConvertTo-Json -Depth 10 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Stage 'Validating installer assets'
$required = @(
    $bridgeExe,
    $trayExe,
    $updaterExe,
    (Join-Path $PublishRoot 'release-manifest.json'),
    (Join-Path $SolutionRoot 'deploy\windows\AdisyumSetup.iss'),
    (Join-Path $SolutionRoot 'deploy\windows\shortcuts\Adisyum POS.url'),
    (Join-Path $SolutionRoot 'deploy\windows\shortcuts\Adisyum Admin.url'),
    (Join-Path $SolutionRoot 'deploy\windows\shortcuts\Adisyum Tray.url')
)
foreach ($path in $required) {
    if (-not (Test-Path $path)) {
        throw "Missing installer asset: $path"
    }
}

Write-Stage 'Building setup.exe'
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
    if ($RequireSigning) {
        throw 'ISCC.exe not found. Trust builds require a signed setup.exe; install Inno Setup Compiler on the build agent.'
    }
    Write-Warning 'ISCC.exe not found. Publish outputs are ready; install Inno Setup Compiler to generate setup.exe.'
    exit 0
}

& $iscc.Source (Join-Path $SolutionRoot 'deploy\windows\AdisyumSetup.iss')

$setupPath = Join-Path $PublishRoot 'AdisyumSetup.exe'
if (Test-Path $setupPath) {
    $versionedSetupPath = Join-Path $PublishRoot $installerFileName
    Copy-Item -Path $setupPath -Destination $versionedSetupPath -Force

    Write-Stage 'Signing setup.exe'
    $signedInstaller = Invoke-CodeSign $versionedSetupPath
    if ($RequireSigning) { Test-CodeSignatureRequired $versionedSetupPath | Out-Null }

    $manifest.checksum = 'sha256:' + (Get-FileSha256 $versionedSetupPath)
    $manifest.signedInstaller = [bool]$signedInstaller
    $manifest.signature = if ($signedInstaller) {
        [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("authenticode:$($manifest.publisherThumbprint):$Version"))
    } else {
        ''
    }
    $manifest.manifestDigest = ''
    $manifest.manifestDigest = Get-Sha256Text (Get-ManifestDigestPayload $manifest)
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -Path $manifestPath -Encoding UTF8
}
