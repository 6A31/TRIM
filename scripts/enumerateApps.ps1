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
# Build package lookup once for fast icon resolution
$appxLookup = @{}
try {
    Get-AppxPackage | ForEach-Object { $appxLookup[$_.PackageFamilyName] = $_ }
} catch {}

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

        $iconPath = ""
        # Resolve UWP icon from AppxManifest
        try {
            $familyName = ($app.AppID -split '!')[0]
            if ($appxLookup.ContainsKey($familyName)) {
                $pkg = $appxLookup[$familyName]
                $manifestFile = Join-Path $pkg.InstallLocation "AppxManifest.xml"
                if (Test-Path $manifestFile) {
                    [xml]$manifest = Get-Content $manifestFile -ErrorAction SilentlyContinue
                    $logoRelative = $manifest.Package.Applications.Application.VisualElements.Square44x44Logo
                    if (-not $logoRelative) {
                        $logoRelative = $manifest.Package.Properties.Logo
                    }
                    if ($logoRelative) {
                        $logoFull = Join-Path $pkg.InstallLocation $logoRelative
                        if (Test-Path $logoFull) {
                            $iconPath = $logoFull
                        } else {
                            # Look for scale variants (e.g. Logo.scale-200.png)
                            $dir = Split-Path $logoFull
                            $base = [System.IO.Path]::GetFileNameWithoutExtension($logoFull)
                            $ext = [System.IO.Path]::GetExtension($logoFull)
                            if (Test-Path $dir) {
                                $variant = Get-ChildItem -Path $dir -Filter "$base*$ext" -ErrorAction SilentlyContinue |
                                    Sort-Object Name | Select-Object -First 1
                                if ($variant) { $iconPath = $variant.FullName }
                            }
                        }
                    }
                }
            }
        } catch {}

        $results += [PSCustomObject]@{
            name     = $app.Name
            target   = ""
            lnkPath  = ""
            appId    = $app.AppID
            iconPath = $iconPath
        }
    }
} catch {
    # Get-StartApps may not be available on all systems
}

$results | Sort-Object -Property name | ConvertTo-Json -Compress
