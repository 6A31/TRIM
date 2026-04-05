Add-Type -AssemblyName System.Drawing

# ── Part 1: Traditional .lnk shortcuts ──
$lnkPaths = @(
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
)

$shell = New-Object -ComObject WScript.Shell
$results = @()
$seenNames = @{}

foreach ($root in $lnkPaths) {
    if (-not (Test-Path $root)) { continue }
    $lnks = Get-ChildItem -Path $root -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue
    foreach ($lnk in $lnks) {
        try {
            $shortcut = $shell.CreateShortcut($lnk.FullName)
            $target = $shortcut.TargetPath
            $name = [System.IO.Path]::GetFileNameWithoutExtension($lnk.Name)

            if (-not $target -or $target -eq "") { continue }
            if ($target -match "unins|setup|update|helper" -and $name -match "unins|setup|update|helper") { continue }

            $key = $name.ToLower()
            if ($seenNames.ContainsKey($key)) { continue }
            $seenNames[$key] = $true

            $results += [PSCustomObject]@{
                name    = $name
                target  = $target
                lnkPath = $lnk.FullName
                appId   = ""
            }
        } catch {
            continue
        }
    }
}

# ── Part 2: UWP / Store apps via Get-StartApps ──
try {
    $startApps = Get-StartApps | Where-Object {
        $_.Name -and $_.AppID -and
        $_.AppID -notmatch "Microsoft\.Windows\." -and
        $_.Name -notmatch "uninstall|setup"
    }
    foreach ($app in $startApps) {
        $key = $app.Name.ToLower()
        if ($seenNames.ContainsKey($key)) { continue }
        $seenNames[$key] = $true

        $results += [PSCustomObject]@{
            name    = $app.Name
            target  = ""
            lnkPath = ""
            appId   = $app.AppID
        }
    }
} catch {
    # Get-StartApps may not be available on all systems
}

$results | Sort-Object -Property name | ConvertTo-Json -Compress
