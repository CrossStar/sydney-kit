param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Drawing
  $image = [System.Drawing.Image]::FromFile($Source)
  try { $image.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png) }
  finally { $image.Dispose() }
} catch { [Console]::Error.WriteLine('Image conversion failed'); exit 1 }
