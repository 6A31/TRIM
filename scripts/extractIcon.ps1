param(
    [Parameter(Mandatory=$true)]
    [string]$ExePath
)

Add-Type -AssemblyName System.Drawing

try {
    if (-not (Test-Path $ExePath)) {
        Write-Output ""
        exit
    }

    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($ExePath)
    if ($null -eq $icon) {
        Write-Output ""
        exit
    }

    $bitmap = $icon.ToBitmap()
    $resized = New-Object System.Drawing.Bitmap(32, 32)
    $graphics = [System.Drawing.Graphics]::FromImage($resized)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($bitmap, 0, 0, 32, 32)

    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $base64 = [Convert]::ToBase64String($bytes)

    Write-Output $base64

    $graphics.Dispose()
    $resized.Dispose()
    $bitmap.Dispose()
    $ms.Dispose()
    $icon.Dispose()
} catch {
    Write-Output ""
}
