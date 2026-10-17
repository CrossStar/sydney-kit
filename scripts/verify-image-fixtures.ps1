param([string]$Directory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($Directory) | Out-Null
foreach($spec in @(@(64,32,'small'),@(4000,1000,'large'))) {
 $bitmap=[System.Drawing.Bitmap]::new([int]$spec[0],[int]$spec[1])
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 try {
  $graphics.Clear([System.Drawing.Color]::CornflowerBlue)
  $bitmap.Save((Join-Path $Directory ($spec[2]+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  if($spec[2] -eq 'small') {
   $bitmap.Save((Join-Path $Directory 'small.bmp'),[System.Drawing.Imaging.ImageFormat]::Bmp)
   $bitmap.Save((Join-Path $Directory 'small.jpg'),[System.Drawing.Imaging.ImageFormat]::Jpeg)
   $bitmap.Save((Join-Path $Directory 'small.gif'),[System.Drawing.Imaging.ImageFormat]::Gif)
  }
 } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
