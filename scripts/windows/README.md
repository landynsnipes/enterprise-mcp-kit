# Windows lab launcher

Run from PowerShell:

```powershell
.\scripts\windows\Start-AiopsLab.ps1 -OpenBrowser
.\scripts\windows\Get-AiopsLabStatus.ps1
.\scripts\windows\Stop-AiopsLab.ps1
```

Because the repository scripts are unsigned, Windows may enforce its execution
policy. The adjacent `.cmd` wrappers use a per-process policy bypass and do not
change the machine or user execution policy. Double-click `Start-AiopsLab.cmd`
to start the lab and open both review pages.

The start script launches one hidden WSL client chain using the fixed
`enterprise-aiops-wsl-keepalive.sh` command. Ubuntu systemd remains responsible for
NetBox, the native WireGuard namespaces, and the observer. It waits for both
localhost review surfaces before optionally opening them.

The stop script targets only that marked `wsl.exe` client. It does not use
`wsl --shutdown`, delete containers, remove volumes, delete namespaces, or
destroy key files. WSL may remain active when another application is using it.
