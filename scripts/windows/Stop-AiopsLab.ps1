[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$marker = 'enterprise-aiops-wsl-keepalive.sh'
$processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'wsl.exe' -and $_.CommandLine -like "*$marker*"
}
foreach ($process in $processes) {
    if ($PSCmdlet.ShouldProcess("WSL keepalive process $($process.ProcessId)", 'Stop')) {
        Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
    }
}
[pscustomobject]@{
    Result = if ($processes) { 'keepalive-client-chain-stopped' } else { 'already-stopped' }
    Boundary = 'Systemd performs clean service shutdown when Ubuntu WSL exits; no volumes or keys are deleted.'
}
