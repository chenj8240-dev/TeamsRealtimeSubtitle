#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [ValidateSet('arm64', 'x64')]
    [string]$Architecture = 'arm64',

    [string]$Version
)

$ErrorActionPreference = 'Stop'

$repository = Split-Path -Parent $PSScriptRoot

# The bundler stamps the manifest's Version from tauri.conf.json, and that is what ends up in
# the .msix filename — so read it from there rather than hardcoding a release that goes stale
# and silently signs the previous version still sitting in target/msix/.
if (-not $Version) {
    $tauriConfig = Join-Path $repository 'src-tauri\tauri.conf.json'
    if (-not (Test-Path -LiteralPath $tauriConfig -PathType Leaf)) {
        throw "tauri.conf.json not found at $tauriConfig. Pass -Version explicitly."
    }
    $Version = (Get-Content -LiteralPath $tauriConfig -Raw | ConvertFrom-Json).version
    if (-not $Version) {
        throw "tauri.conf.json declares no version. Pass -Version explicitly."
    }
    Write-Host "Version $Version, from tauri.conf.json." -ForegroundColor Cyan
}
$packageName = "Live Translation & Subtitles_$Version.0_$Architecture.msix"
$packagePath = Join-Path $repository "src-tauri\target\msix\$packageName"
$pfxPath = Join-Path $repository 'live-translation-dev.pfx'
$cerPath = Join-Path $repository 'live-translation-dev.cer'

foreach ($requiredPath in @($packagePath, $pfxPath, $cerPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required file not found: $requiredPath"
    }
}

# Add-AppxPackage reports both of the conflicts this hits as a bare HRESULT, so name them
# here instead. Windows refuses to replace a Store-signed package with a developer-signed one
# of the same identity (0x80073CF3) whatever the versions are, and refuses to install a
# rebuild carrying a version already present (0x80073CFB). The first is fatal to this script
# and is checked before the password prompt; the second is handled after signing.
$identityName = '49346FMadore.LiveTranslationSubtitles'
$conflicting = Get-AppxPackage -Name $identityName -ErrorAction SilentlyContinue

if ($conflicting) {
    Write-Host "Installed already: $($conflicting.PackageFullName), signed as $($conflicting.SignatureKind)." -ForegroundColor Cyan
}

if ($conflicting.SignatureKind -eq 'Store') {
    throw @"
A Store-signed copy of $identityName $($conflicting.Version) is installed, and Windows will not
replace it with a developer-signed package of the same identity (0x80073CF3).

Remove it, run this script again, and reinstall from the Store when the verification round is
done. Credential Manager keys survive the swap; preferences held by the WebView do not.

    Get-AppxPackage $identityName | Remove-AppxPackage
"@
}

$signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
    Sort-Object FullName -Descending |
    Select-Object -First 1
if (-not $signTool) {
    throw 'SignTool.exe was not found. Install the Windows SDK first.'
}

$password = Read-Host -AsSecureString 'Password for live-translation-dev.pfx'
$signingCertificate = Import-PfxCertificate `
    -FilePath $pfxPath `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -Password $password
$trustedCertificate = Import-Certificate `
    -FilePath $cerPath `
    -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'

if ($signingCertificate.Thumbprint -ne $trustedCertificate.Thumbprint) {
    throw "PFX/CER mismatch: $($signingCertificate.Thumbprint) != $($trustedCertificate.Thumbprint)"
}
if (-not $signingCertificate.HasPrivateKey) {
    throw 'The imported PFX does not expose its private signing key.'
}

& $signTool.FullName sign `
    /fd SHA256 `
    /sha1 $signingCertificate.Thumbprint `
    $packagePath
if ($LASTEXITCODE -ne 0) {
    throw "SignTool failed with exit code $LASTEXITCODE"
}

& $signTool.FullName verify /pa $packagePath
if ($LASTEXITCODE -ne 0) {
    throw "Signature verification failed with exit code $LASTEXITCODE"
}

if ($conflicting -and $conflicting.Version.ToString() -eq "$Version.0") {
    Write-Host "Removing $($conflicting.PackageFullName) first: Windows swaps a package in place only when the version increases." -ForegroundColor Yellow
    Remove-AppxPackage -Package $conflicting.PackageFullName
}

Add-AppxPackage -Path $packagePath -ForceApplicationShutdown -ForceUpdateFromAnyVersion

$installed = Get-AppxPackage $identityName
if (-not $installed -or $installed.Version.ToString() -ne "$Version.0") {
    throw "Installation verification failed; expected package version $Version.0"
}

Write-Host "Installed $($installed.Name) $($installed.Version) ($Architecture)." -ForegroundColor Green
Write-Host 'Open Live Translation & Subtitles from the Start menu.' -ForegroundColor Green
