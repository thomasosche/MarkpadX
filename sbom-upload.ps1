# Generates SBOMs for frontend (npm) and Rust (Cargo), merges them,
# and uploads a single combined SBOM to Dependency Track.
#
# Prerequisites:
#   npm install --save-dev @cyclonedx/cyclonedx-npm
#   cargo install cyclonedx-bom
#
# Configuration via .env.local:
#   DT_URL=https://dt.carrybit.de
#   DT_API_KEY=<your token>
#   DT_PROJECT_ID=<markpadx project uuid from dt.carrybit.de>

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot

# Load .env.local
$EnvFile = Join-Path $ScriptDir ".env.local"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
        }
    }
}

$DT_URL        = $env:DT_URL
$DT_API_KEY    = $env:DT_API_KEY
$DT_PROJECT_ID = $env:DT_PROJECT_ID

if (-not $DT_URL)        { throw "DT_URL not set in .env.local" }
if (-not $DT_API_KEY)    { throw "DT_API_KEY not set in .env.local" }
if (-not $DT_PROJECT_ID) { throw "DT_PROJECT_ID not set in .env.local" }

$SbomNpm    = Join-Path $ScriptDir "sbom-npm.json"
$SbomRust   = Join-Path $ScriptDir "src-tauri\Markpad.cdx.json"
$SbomMerged = Join-Path $ScriptDir "sbom-merged.json"

# --- npm ---
Write-Host "Generating npm SBOM..."
Push-Location $ScriptDir
npx @cyclonedx/cyclonedx-npm --output-format JSON --output-file $SbomNpm
Pop-Location

# --- Rust (Cargo) ---
Write-Host "Generating Rust SBOM..."
Push-Location (Join-Path $ScriptDir "src-tauri")
cargo cyclonedx --format json
Pop-Location

# --- Merge ---
Write-Host "Merging SBOMs..."
$npm  = Get-Content $SbomNpm  -Raw | ConvertFrom-Json
$rust = Get-Content $SbomRust -Raw | ConvertFrom-Json

$mergedComponents = @($npm.components) + @($rust.components)
$npm.components = $mergedComponents
$npm | ConvertTo-Json -Depth 20 | Out-File -Encoding utf8 $SbomMerged

Write-Host "Merged: $($mergedComponents.Count) components total"

# --- Upload ---
Write-Host "Uploading merged SBOM..."
$bomBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($SbomMerged))
$body = @{ project = $DT_PROJECT_ID; bom = $bomBase64 } | ConvertTo-Json
Invoke-RestMethod -Uri "$DT_URL/api/v1/bom" `
    -Method Put `
    -Headers @{ "X-Api-Key" = $DT_API_KEY } `
    -ContentType "application/json" `
    -Body $body | Out-Null

Write-Host "Uploaded."
Write-Host ""
Write-Host "Done. View results at: $DT_URL/projects/$DT_PROJECT_ID"

# Clean up
Remove-Item -Force $SbomNpm, $SbomRust, $SbomMerged -ErrorAction SilentlyContinue
