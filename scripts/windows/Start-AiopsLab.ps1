[CmdletBinding()]
param([switch]$OpenBrowser)

$ErrorActionPreference = 'Stop'
$marker = 'enterprise-aiops-wsl-keepalive.sh'
$existing = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'wsl.exe' -and $_.CommandLine -like "*$marker*"
}

if (-not $existing) {
    $repoWindows = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $wslRoot = (wsl.exe -d Ubuntu wslpath -a $repoWindows).Trim()
    $arguments = @('-d', 'Ubuntu', '--', 'sh', "$wslRoot/scripts/windows/enterprise-aiops-wsl-keepalive.sh")
    $process = Start-Process -FilePath 'wsl.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2
    if ($process.HasExited) {
        throw 'The Ubuntu WSL keepalive exited unexpectedly.'
    }
}

$targets = @(
    @{ Name = 'NetBox'; Url = 'http://localhost:8000/'; TimeoutSeconds = 180 },
    @{ Name = 'WireGuard'; Url = 'http://localhost:9108/health'; TimeoutSeconds = 60 }
)
$results = foreach ($target in $targets) {
    $deadline = (Get-Date).AddSeconds($target.TimeoutSeconds)
    $lastError = $null
    do {
        try {
            $response = Invoke-WebRequest -Uri $target.Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                [pscustomobject]@{ Service = $target.Name; Status = 'ready'; Url = $target.Url }
                break
            }
        } catch {
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    if ((Get-Date) -ge $deadline) {
        throw "$($target.Name) did not become ready: $lastError"
    }
}

$results | Format-Table -AutoSize
if ($OpenBrowser) {
    Start-Process 'http://localhost:8000/'
    Start-Process 'http://localhost:9108/'
}
