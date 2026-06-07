$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$e      = [char]27
$reset  = "$e[0m"
$bold   = "$e[1m"
$dim    = "$e[2m"
$red    = "$e[31m"
$green  = "$e[32m"
$yellow = "$e[33m"
$cyan   = "$e[36m"
$gray   = "$e[90m"

$check  = [char]0x2714
$cross  = [char]0x2718
$arrow  = [char]0x2192
$rule   = ([char]0x2500).ToString() * 32

function Write-Step($num, $total, $label) {
    Write-Host ""
    Write-Host "  ${gray}[$num/$total]${reset} ${bold}$label${reset}"
}

function Write-Ok($msg) {
    Write-Host "        ${green}${check}${reset} $msg"
}

function Write-Fail($msg) {
    Write-Host "        ${red}${cross}${reset} ${red}$msg${reset}"
}

$startTime = Get-Date

Write-Host ""
Write-Host "  ${bold}${cyan}MarkpadX${reset} ${dim}debug build${reset}"
Write-Host "  ${cyan}$rule${reset}"
Write-Host "  ${gray}start${reset}  $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))"

$running = Get-Process -Name "Markpad" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "  ${yellow}!${reset} killing $($running.Count) running Markpad instance(s)"
    $running | Stop-Process -Force
    Start-Sleep -Milliseconds 300
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Invoke-Quiet {
    param([int]$Num, [int]$Total, [string]$Label, [string]$Command)
    Write-Step $Num $Total $Label
    $step = [System.Diagnostics.Stopwatch]::StartNew()
    $output = & cmd /c "$Command 2>&1"
    $code = $LASTEXITCODE
    $step.Stop()
    if ($code -ne 0) {
        Write-Fail "FAILED (exit $code)"
        Write-Host ""
        $output | ForEach-Object { Write-Host "    $_" }
        exit 1
    }
    Write-Ok ("done in {0:N1}s" -f $step.Elapsed.TotalSeconds)
}

Invoke-Quiet 1 2 "Frontend (vite)"      "npm run build --silent"
Invoke-Quiet 2 2 "Tauri (cargo, debug)" "npx tauri build --debug --no-bundle"

$sw.Stop()
$endTime = Get-Date
$elapsed = "{0:mm\:ss}" -f $sw.Elapsed

$exe = Join-Path $PSScriptRoot "src-tauri\target\debug\Markpad.exe"
$size = if (Test-Path $exe) { "{0:N1} MB" -f ((Get-Item $exe).Length / 1MB) } else { "?" }

Write-Host ""
Write-Host "  ${cyan}$rule${reset}"
Write-Host "  ${gray}start${reset}     $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "  ${gray}end${reset}       $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "  ${gray}duration${reset}  ${bold}${elapsed}${reset}"
Write-Host "  ${green}${check}${reset} ${bold}Build complete${reset}  ${dim}$size${reset}"
Write-Host "  ${gray}${arrow}${reset} ${cyan}$exe${reset}"
Write-Host ""
