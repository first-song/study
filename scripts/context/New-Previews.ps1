param(
  [int]$MaxWidth = 960,
  [long]$Quality = 82
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$sourceDirectory = Join-Path $root 'artifacts'
$outputDirectory = Join-Path $root 'artifacts/previews'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } |
  Select-Object -First 1
$qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  $qualityEncoder,
  [long]$Quality
)

$files = @(
  '27-archipelago-scale.png',
  '28-naval-patrol-ship.png',
  '29-island-crowd.png',
  '30-camera-terrain-clearance.png',
  'v18-mother-armor.png',
  'v18-mother-spout.png',
  'v18-mother-core.png',
  'v18-hud-full.png',
  'v18-pulse-vfx.png',
  'v18-deep-biofilm.png',
  'v18-instinct-reveal.png',
  'v20-echo-key.png'
)
$outputs = @()
foreach ($fileName in $files) {
  $source = Join-Path $sourceDirectory $fileName
  if (-not (Test-Path -LiteralPath $source)) { continue }
  $image = [System.Drawing.Image]::FromFile($source)
  try {
    $scale = [Math]::Min(1.0, $MaxWidth / $image.Width)
    $width = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($image, 0, 0, $width, $height)
      } finally {
        $graphics.Dispose()
      }
      $target = Join-Path $outputDirectory ([IO.Path]::GetFileNameWithoutExtension($fileName) + '.jpg')
      $bitmap.Save($target, $encoder, $encoderParameters)
      $outputs += $target
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $image.Dispose()
  }
}

$artPreviewNames = @(
  'v14-micro-cell-spawn.jpg',
  'v14-seagrass-microecology.jpg',
  'v14-industrial-outfall.jpg',
  'v18-mother-armor.jpg',
  'v18-mother-spout.jpg',
  'v18-mother-core.jpg',
  'v18-hud-full.jpg',
  'v20-echo-key.jpg',
  'v18-deep-biofilm.jpg',
  '28-naval-patrol-ship.jpg'
)
$artPreviews = @($artPreviewNames | ForEach-Object { Join-Path $outputDirectory $_ } | Where-Object { Test-Path -LiteralPath $_ })
$sheetSources = if ($artPreviews.Count -ge 4) { $artPreviews } else { $outputs }

if ($sheetSources.Count -ge 4) {
  $sheet = New-Object System.Drawing.Bitmap(1200, 750)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(7, 22, 28))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      for ($index = 0; $index -lt 4; $index++) {
        $image = [System.Drawing.Image]::FromFile($sheetSources[$index])
        try {
          $x = ($index % 2) * 600
          $y = [Math]::Floor($index / 2) * 375
          $graphics.DrawImage($image, $x, $y, 600, 375)
        } finally {
          $image.Dispose()
        }
      }
    } finally {
      $graphics.Dispose()
    }
    $sheet.Save(
      (Join-Path $outputDirectory 'art-contact-sheet.jpg'),
      $encoder,
      $encoderParameters
    )
  } finally {
    $sheet.Dispose()
  }
}

Get-ChildItem -LiteralPath $outputDirectory -File |
  Sort-Object Name |
  Select-Object Name, Length |
  Format-Table -AutoSize
