[CmdletBinding()]
param()

$services = @(
    @{ Name = 'NetBox'; Url = 'http://localhost:8000/' },
    @{ Name = 'WireGuard'; Url = 'http://localhost:9108/health' }
)
foreach ($service in $services) {
    try {
        $response = Invoke-WebRequest -Uri $service.Url -UseBasicParsing -TimeoutSec 5
        [pscustomobject]@{ Service = $service.Name; Status = $response.StatusCode; Url = $service.Url }
    } catch {
        [pscustomobject]@{ Service = $service.Name; Status = 'unavailable'; Url = $service.Url }
    }
}
