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
                    # Use GetElementsByTagName to ignore XML namespaces (uap:VisualElements etc.)
                    $ve = $manifest.GetElementsByTagName("VisualElements")
                    $logoRelative = $null
                    if ($ve.Count -gt 0) {
                        $logoRelative = $ve[0].GetAttribute("Square44x44Logo")
                        if (-not $logoRelative) {
                            $logoRelative = $ve[0].GetAttribute("Square150x150Logo")
                        }
                    }
                    if (-not $logoRelative) {
                        $props = $manifest.GetElementsByTagName("Logo")
                        if ($props.Count -gt 0) { $logoRelative = $props[0].InnerText }
                    }
                    if ($logoRelative) {
                        $logoFull = Join-Path $pkg.InstallLocation $logoRelative
                        if (Test-Path $logoFull) {
                            $iconPath = $logoFull
                        } else {
                            # Look for scale/targetsize variants
                            $dir = Split-Path $logoFull
                            $base = [System.IO.Path]::GetFileNameWithoutExtension($logoFull)
                            if (Test-Path $dir) {
                                $variant = Get-ChildItem -Path $dir -ErrorAction SilentlyContinue |
                                    Where-Object { $_.Name -match "^$([regex]::Escape($base))" -and $_.Extension -match '\.(png|jpg|ico)$' } |
                                    Sort-Object {
                                        $rank = 0
                                        if ($_.Name -match 'altform-unplated') { $rank += 1000 }
                                        if ($_.Name -match 'targetsize-(\d+)') { $rank += [int]$Matches[1] }
                                        elseif ($_.Name -match 'scale-(\d+)') { $rank += [int]$Matches[1] / 10 }
                                        $rank
                                    } -Descending |
                                    Select-Object -First 1
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

# Always output a valid JSON array (PS 5.1 omits brackets for 0 or 1 items)
$sorted = @($results | Sort-Object -Property name)
if ($sorted.Count -eq 0) {
    Write-Output "[]"
} elseif ($sorted.Count -eq 1) {
    Write-Output ("[" + ($sorted[0] | ConvertTo-Json -Compress) + "]")
} else {
    $sorted | ConvertTo-Json -Compress
}
