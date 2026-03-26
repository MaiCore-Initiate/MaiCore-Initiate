$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptDir
$metaFile = Join-Path $scriptDir "mcsb.env"
$mainScript = Join-Path $parentDir "main_refactored.py"
$venvPython = Join-Path $parentDir "venv\Scripts\python.exe"
$meta = @{
    APP_NAME = "MaiCoreStart"
    APP_VERSION = "v5.0.0-beta"
    APP_EXE = "MaiCoreStart-v5.0.0-beta.exe"
    BUILD_DATE = "2025-12-13"
}

if (Test-Path $metaFile) {
    foreach ($line in Get-Content $metaFile) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $meta[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

$appExe = Join-Path $parentDir $meta["APP_EXE"]

function Show-Usage {
    Write-Host "Usage: mcsb -d <DeploymentMOD path>"
    Write-Host "       mcsb -l <DeploymentMOD path>"
    Write-Host "       mcsb -c <DeploymentMOD path>"
    Write-Host "       mcsb -com <DeploymentMOD path>"
    Write-Host "       mcsb deploy <DeploymentMOD path>"
    Write-Host "       mcsb launch <DeploymentMOD path>"
    Write-Host "       mcsb config <DeploymentMOD path>"
    Write-Host "       mcsb component <DeploymentMOD path>"
    Write-Host ""
    Write-Host "You can pass either a template directory or a DeploymentMOD.toml file path."
}

function Show-Version {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "          $($meta["APP_NAME"]) $($meta["APP_VERSION"])"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  mcsb                    - Start launcher"
    Write-Host "  mcsb -d PATH            - Execute full template deployment"
    Write-Host "  mcsb -l PATH            - Execute template launch stage"
    Write-Host "  mcsb -c PATH            - Execute template config stage"
    Write-Host "  mcsb -com PATH          - Execute template component stage"
    Write-Host "  mcsb deploy PATH        - Execute full template deployment"
    Write-Host "  mcsb launch PATH        - Execute template launch stage"
    Write-Host "  mcsb config PATH        - Execute template config stage"
    Write-Host "  mcsb component PATH     - Execute template component stage"
    Write-Host "  mcsb -v|version         - Show version"
    Write-Host ""
}

function Resolve-Python {
    if (Test-Path $venvPython) {
        return $venvPython
    }
    return "python"
}

function Invoke-TemplateMode([string]$mode, [string]$templatePath) {
    if ([string]::IsNullOrWhiteSpace($templatePath)) {
        Show-Usage
        exit 1
    }

    $pythonExe = Resolve-Python
    $env:MCSB_CALLER_CWD = (Get-Location).Path
    Write-Host "Starting template action $mode..."
    & $pythonExe $mainScript $mode $templatePath
    exit $LASTEXITCODE
}

if ($args.Count -gt 0) {
    $first = [string]$args[0]
    switch -Regex ($first.ToLowerInvariant()) {
        '^-d$' { Invoke-TemplateMode $first $args[1] }
        '^-l$' { Invoke-TemplateMode $first $args[1] }
        '^-c$' { Invoke-TemplateMode $first $args[1] }
        '^-com$' { Invoke-TemplateMode $first $args[1] }
        '^deploy$' { Invoke-TemplateMode $first $args[1] }
        '^launch$' { Invoke-TemplateMode $first $args[1] }
        '^config$' { Invoke-TemplateMode $first $args[1] }
        '^component$' { Invoke-TemplateMode $first $args[1] }
        '^--version$' {
            Write-Host "$($meta["APP_NAME"]) version $($meta["APP_VERSION"])"
            exit 0
        }
        '^(-v|version)$' {
            Show-Version
            exit 0
        }
    }
}

if (Test-Path $appExe) {
    Write-Host "Starting $($meta["APP_EXE"])..."
    & $appExe
    exit $LASTEXITCODE
}

$pythonExe = Resolve-Python
Write-Host "Executable not found, fallback to Python entry..."
& $pythonExe $mainScript
exit $LASTEXITCODE
