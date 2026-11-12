$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$archivePath = Join-Path $root 'voice-account-build.zip'

# Verify prepared native assets; never download models/SDKs during packaging.
& (Join-Path $PSScriptRoot 'prepare-android-whisper.ps1') -VerifyOnly
# Prepare only web resources: no SDK download, Gradle or native build.
Push-Location -LiteralPath $root
try {
    & node 'scripts/prepare-web.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'Web resource preparation failed.' }
} finally {
    Pop-Location
}

$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
# Only the upload copy gets cloud hooks; the local Android project stays unchanged.
$package.scripts = [ordered]@{
    'prepare' = 'node scripts/prepare-web.cjs'
    'build' = 'node scripts/prepare-web.cjs'
    'capacitor:copy:before' = 'node scripts/prepare-web.cjs'
    'capacitor:copy:after' = 'node scripts/configure-cloud-android.cjs'
    'capacitor:update:after' = 'node scripts/configure-cloud-android.cjs'
}
$packageJson = ($package | ConvertTo-Json -Depth 20) + "`n"
$assets = @(
    'index.html', 'css', 'js', 'manifest.json', 'sw.js', 'capacitor.js', 'capacitor.js.map',
    'capacitor.config.json', 'voltbuilder.json', 'package-lock.json', 'README.md', 'www',
    'scripts/prepare-web.cjs', 'scripts/configure-cloud-android.cjs'
)
$files = foreach ($asset in $assets) {
    $item = Get-Item -LiteralPath (Join-Path $root $asset)
    if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $item.FullName -Recurse -File }
    else { $item }
}
$androidFiles = Get-ChildItem -LiteralPath (Join-Path $root 'android') -Recurse -File -Force | Where-Object {
    $relative = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    $relative -notmatch '(^|/)(\.git|\.gradle|\.cxx|\.externalNativeBuild|\.idea|\.kotlin|build|captures|node_modules|capacitor-cordova-android-plugins)(/|$)' -and
    $relative -notmatch '^android/local\.properties$' -and
    $relative -notmatch '^android/app/src/main/assets/(public/|capacitor\.(config|plugins)\.json$)' -and
    $relative -notmatch '^android/app/src/main/res/xml/config\.xml$' -and
    ($relative -notmatch '^android/app/src/main/cpp/third_party/whisper\.cpp/' -or
        $relative -match '^android/app/src/main/cpp/third_party/whisper\.cpp/(CMakeLists\.txt|LICENSE|voice-account-revision\.txt|cmake/|include/|src/|ggml/(CMakeLists\.txt|cmake/|include/|src/))') -and
    $relative -notmatch '\.(apk|aab|keystore|jks|log|hprof)$'
}
$files += $androidFiles

Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
try {
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
            $entry = $zip.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
            $output = $entry.Open()
            try {
                if ($relative -eq 'android/gradle.properties') {
                    # Local JDK paths cannot be used by cloud Linux build workers.
                    $portable = (Get-Content -LiteralPath $file.FullName | Where-Object {
                        $_ -notmatch '^\s*org\.gradle\.java\.home\s*=' -and
                        $_ -notmatch '^# Use the verified local JDK'
                    }) -join "`n"
                    $bytes = [Text.Encoding]::UTF8.GetBytes($portable + "`n")
                    $output.Write($bytes, 0, $bytes.Length)
                } else {
                    $input = [System.IO.File]::OpenRead($file.FullName)
                    try { $input.CopyTo($output) } finally { $input.Dispose() }
                }
            } finally { $output.Dispose() }
        }
        $entry = $zip.CreateEntry('package.json', [System.IO.Compression.CompressionLevel]::Optimal)
        $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
        try { $writer.Write($packageJson) } finally { $writer.Dispose() }
    } finally {
        $zip.Dispose()
    }
} finally {
    $stream.Dispose()
}
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
