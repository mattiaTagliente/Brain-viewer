## Create Brain Viewer icon and taskbar-pinnable shortcut
## Run once: powershell -ExecutionPolicy Bypass -File create_shortcut.ps1

Add-Type -AssemblyName System.Drawing

$projectDir = "C:\Users\matti\Dev\Brain_viewer"
$icoPath    = "$projectDir\scripts\brain_viewer.ico"
$lnkPath    = "$projectDir\scripts\Brain Viewer.lnk"

# ── Generate icon ──────────────────────────────────────────────
function New-BrainIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.Clear([System.Drawing.Color]::Transparent)

    # Background circle — dark (#0d0d1a)
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 13, 13, 26))
    $g.FillEllipse($bgBrush, 0, 0, $size - 1, $size - 1)

    # Subtle ring
    $ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(100, 34, 68, 170)), ([math]::Max(1, [int]($size * 0.04)))
    $inset = [int]($size * 0.06)
    $g.DrawEllipse($ringPen, $inset, $inset, $size - 2 * $inset - 1, $size - 2 * $inset - 1)

    # Node positions (normalised 0-1, centred in circle)
    $nodes = @(
        @(0.50, 0.22),  # top
        @(0.28, 0.38),  # upper-left
        @(0.72, 0.38),  # upper-right
        @(0.35, 0.62),  # lower-left
        @(0.65, 0.62),  # lower-right
        @(0.50, 0.78),  # bottom
        @(0.50, 0.50)   # centre
    )

    # Edges (index pairs)
    $edges = @(
        @(0, 1), @(0, 2), @(0, 6),
        @(1, 3), @(1, 6),
        @(2, 4), @(2, 6),
        @(3, 5), @(3, 6),
        @(4, 5), @(4, 6),
        @(5, 6)
    )

    # Theme colors for nodes
    $nodeColors = @(
        [System.Drawing.Color]::FromArgb(255, 0, 204, 255),   # concept  #00ccff
        [System.Drawing.Color]::FromArgb(255, 255, 102, 0),   # method   #ff6600
        [System.Drawing.Color]::FromArgb(255, 153, 102, 255), # tool     #9966ff
        [System.Drawing.Color]::FromArgb(255, 0, 255, 136),   # param    #00ff88
        [System.Drawing.Color]::FromArgb(255, 255, 204, 0),   # dataset  #ffcc00
        [System.Drawing.Color]::FromArgb(255, 255, 51, 102),  # finding  #ff3366
        [System.Drawing.Color]::FromArgb(255, 51, 204, 204)   # decision #33cccc
    )

    # Draw edges
    $edgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 34, 68, 170)), ([math]::Max(1, [int]($size * 0.025)))
    foreach ($e in $edges) {
        $x1 = [float]($nodes[$e[0]][0] * $size)
        $y1 = [float]($nodes[$e[0]][1] * $size)
        $x2 = [float]($nodes[$e[1]][0] * $size)
        $y2 = [float]($nodes[$e[1]][1] * $size)
        $g.DrawLine($edgePen, $x1, $y1, $x2, $y2)
    }

    # Draw nodes
    $r = [math]::Max(2, [int]($size * 0.07))
    for ($i = 0; $i -lt $nodes.Count; $i++) {
        $cx = [float]($nodes[$i][0] * $size) - $r
        $cy = [float]($nodes[$i][1] * $size) - $r
        # Glow
        $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, $nodeColors[$i].R, $nodeColors[$i].G, $nodeColors[$i].B))
        $g.FillEllipse($glowBrush, $cx - $r * 0.5, $cy - $r * 0.5, $r * 3, $r * 3)
        # Core
        $brush = New-Object System.Drawing.SolidBrush $nodeColors[$i]
        $g.FillEllipse($brush, $cx, $cy, $r * 2, $r * 2)
    }

    $g.Dispose()
    return $bmp
}

# Generate multi-size ICO
$sizes = @(16, 32, 48, 256)
$pngDataList = [System.Collections.ArrayList]::new()

foreach ($s in $sizes) {
    $bmp = New-BrainIcon $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [void]$pngDataList.Add($ms.ToArray())
    $ms.Dispose()
    $bmp.Dispose()
}

# Write ICO format
$icoMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $icoMs

# Header
$bw.Write([uint16]0)                # reserved
$bw.Write([uint16]1)                # type = ICO
$bw.Write([uint16]$sizes.Count)     # image count

# Directory entries
$dataOffset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))  # width
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))  # height
    $bw.Write([byte]0)       # palette
    $bw.Write([byte]0)       # reserved
    $bw.Write([uint16]1)     # color planes
    $bw.Write([uint16]32)    # bits per pixel
    $bw.Write([uint32]$pngDataList[$i].Length)   # data size
    $bw.Write([uint32]$dataOffset)               # data offset
    $dataOffset += $pngDataList[$i].Length
}

# Image data
foreach ($data in $pngDataList) {
    $bw.Write($data)
}

$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $icoMs.ToArray())
$bw.Dispose()
$icoMs.Dispose()

Write-Host "Icon created: $icoPath"

# ── Create .lnk shortcut ──────────────────────────────────────
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = "C:\Users\matti\venvs\brain_viewer\Scripts\pythonw.exe"
$shortcut.Arguments        = "`"$projectDir\scripts\launcher.pyw`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation     = "$icoPath, 0"
$shortcut.Description      = "Brain Viewer - 3D Knowledge Graph"
$shortcut.Save()

Write-Host "Shortcut created: $lnkPath"
Write-Host ""
Write-Host "To pin to taskbar: right-click the shortcut in File Explorer > 'Show more options' > 'Pin to taskbar'"
