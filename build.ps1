$ErrorActionPreference = "Stop"

$green  = "`e[32m"
$cyan   = "`e[36m"
$red    = "`e[31m"
$bold   = "`e[1m"
$reset  = "`e[0m"
$check  = [char]0x2714
$cross  = [char]0x2718

Write-Host ""
Write-Host "${bold}${cyan}  MarkpadX Build${reset}"
Write-Host "${cyan}  ──────────────────────────────${reset}"
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "  [1/2] Building frontend...  " -NoNewline
try {
    npm run build 2>&1 | Out-Null
    Write-Host "${green}${check}${reset}"
} catch {
    Write-Host "${red}${cross} FAILED${reset}"
    Write-Host "${red}  $($_.Exception.Message)${reset}"
    exit 1
}

Write-Host "  [2/2] Building Tauri app...  " -NoNewline
try {
    $output = npx tauri build --no-bundle 2>&1
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
    Write-Host "${green}${check}${reset}"
} catch {
    Write-Host "${red}${cross} FAILED${reset}"
    Write-Host "${red}  $($_.Exception.Message)${reset}"
    Write-Host $output
    exit 1
}

$sw.Stop()
$elapsed = $sw.Elapsed.ToString("mm\:ss")

$exe = Join-Path $PSScriptRoot "src-tauri\target\release\Markpad.exe"
$size = "{0:N1} MB" -f ((Get-Item $exe).Length / 1MB)

Write-Host ""
Write-Host "${cyan}  ──────────────────────────────${reset}"
Write-Host "  ${green}${check} Build complete${reset}  ${elapsed}  ${size}"
Write-Host "  ${cyan}$exe${reset}"
Write-Host ""
