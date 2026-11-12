param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$revision = '4979e04f5dcaccb36057e059bbaed8a2f5288315'
$sourceHash = 'ec8e33f4c838ed459ad0a23da255c0262f150a6f54839a17e504ddf1495305d5'
$modelHash = '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
$cache = Join-Path $root '.cache'
$archive = Join-Path $cache 'whisper-v1.8.2.tar.gz'
$vendorParent = Join-Path $root 'android/app/src/main/cpp/third_party'
$vendor = Join-Path $vendorParent 'whisper.cpp'
$model = Join-Path $root 'android/app/src/main/assets/models/ggml-base-q5_1.bin'

function Has-Hash($path, $hash) {
    return (Test-Path -LiteralPath $path -PathType Leaf) -and
        ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $hash)
}

if (-not $VerifyOnly) {
    New-Item -ItemType Directory -Force -Path $cache, $vendorParent, (Split-Path -Parent $model) | Out-Null
    if (-not (Has-Hash $archive $sourceHash)) {
        Write-Host 'Downloading pinned whisper.cpp source (development machine only)...'
        Invoke-WebRequest -Uri "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/$revision" -OutFile $archive
    }
    if (-not (Has-Hash $archive $sourceHash)) { throw 'whisper.cpp archive checksum mismatch.' }
    if (-not (Test-Path -LiteralPath $vendor)) {
        & tar -xzf $archive -C $vendorParent
        if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed.' }
        $extracted = (Resolve-Path -LiteralPath (Join-Path $vendorParent "whisper.cpp-$revision")).Path
        $destination = [IO.Path]::GetFullPath($vendor)
        if (-not $extracted.StartsWith($vendorParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
            -not $destination.StartsWith($vendorParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Source paths must stay inside the native vendor directory.'
        }
        Move-Item -LiteralPath $extracted -Destination $destination
        [IO.File]::WriteAllText((Join-Path $vendor 'voice-account-revision.txt'), $revision + "`n")
    }
    if (-not (Has-Hash $model $modelHash)) {
        Write-Host 'Downloading multilingual base Q5_1 model (59.7 MB; never downloaded by the app)...'
        Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin' -OutFile $model
    }
}

if (-not (Has-Hash $model $modelHash)) { throw 'Model missing or checksum mismatch. Run this script without -VerifyOnly.' }
$marker = Join-Path $vendor 'voice-account-revision.txt'
if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -Raw -LiteralPath $marker).Trim() -ne $revision) {
    throw 'Pinned whisper.cpp source missing or revision mismatch.'
}
foreach ($file in @('include/whisper.h', 'src/whisper.cpp', 'CMakeLists.txt', 'ggml/CMakeLists.txt', 'LICENSE')) {
    if (-not (Test-Path -LiteralPath (Join-Path $vendor $file))) { throw "Missing source file: $file" }
}
if (-not $VerifyOnly) {
    Copy-Item -LiteralPath (Join-Path $vendor 'LICENSE') -Destination (Join-Path (Split-Path -Parent $model) 'whisper-cpp-LICENSE.txt')
}
Write-Host "Whisper source v1.8.2 and base Q5_1 model verified: $model"
