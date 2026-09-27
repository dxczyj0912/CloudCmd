param(
    [Parameter(Mandatory = $true)][string]$Source
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceImage = [System.Drawing.Bitmap]::new($Source)
try {
    if ($sourceImage.Width -ne 4096 -or $sourceImage.Height -ne 4096) {
        throw 'Expected the supplied 4096×4096 CloudCmd artwork.'
    }
    $mark = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($mark)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new(20, 84, 472, 344), [System.Drawing.Rectangle]::new(690, 710, 2720, 1980), [System.Drawing.GraphicsUnit]::Pixel)
        } finally { $graphics.Dispose() }
        # The supplied artwork has a white canvas. A blue-pixel span on each
        # scanline isolates the cloud while keeping the white terminal glyph.
        for ($y = 0; $y -lt 512; $y++) {
            $left = 512
            $right = -1
            for ($x = 0; $x -lt 512; $x++) {
                $c = $mark.GetPixel($x, $y)
                if (($c.B - $c.R) -gt 14 -and ($c.B - $c.G) -gt 4) {
                    if ($x -lt $left) { $left = $x }
                    $right = $x
                }
            }
            for ($x = 0; $x -lt 512; $x++) {
                if ($x -lt $left -or $x -gt $right) { $mark.SetPixel($x, $y, [System.Drawing.Color]::Transparent) }
            }
        }

        $imageDir = Join-Path $root 'assets\img'
        New-Item -ItemType Directory -Path $imageDir -Force | Out-Null
        $mark.Save((Join-Path $imageDir 'cloudcmd-mark.png'), [System.Drawing.Imaging.ImageFormat]::Png)

        function Save-Icon([int]$size, [string]$target, [bool]$round, [bool]$transparent) {
            $icon = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            try {
                $g = [System.Drawing.Graphics]::FromImage($icon)
                try {
                    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $g.Clear([System.Drawing.Color]::Transparent)
                    if (-not $transparent) {
                        $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
                        try {
                            if ($round) { $g.FillEllipse($white, 0, 0, $size - 1, $size - 1) }
                            else { $g.FillRectangle($white, 0, 0, $size, $size) }
                        } finally { $white.Dispose() }
                    }
                    $margin = if ($transparent -and $size -le 64) { 0 } elseif ($transparent) { [int]($size * 0.175) } else { [int]($size * 0.105) }
                    $width = $size - 2 * $margin
                    $g.DrawImage($mark, $margin, $margin, $width, $width)
                } finally { $g.Dispose() }
                $dir = Split-Path -Parent $target
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
                $icon.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally { $icon.Dispose() }
        }

        Save-Icon 64 (Join-Path $imageDir 'favicon.png') $false $true
        Save-Icon 432 (Join-Path $root 'android\res\drawable-nodpi\ic_launcher_foreground.png') $false $true
        foreach ($entry in @(@('mdpi',48), @('hdpi',72), @('xhdpi',96), @('xxhdpi',144), @('xxxhdpi',192))) {
            $dir = Join-Path $root ('android\res\mipmap-' + $entry[0])
            Save-Icon $entry[1] (Join-Path $dir 'ic_launcher.png') $false $false
            Save-Icon $entry[1] (Join-Path $dir 'ic_launcher_round.png') $true $false
        }
    } finally { $mark.Dispose() }
} finally { $sourceImage.Dispose() }
