param([Parameter(Mandatory=$true)][string]$OutputDirectory, [switch]$Server)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
function Read-ClipboardImages {
  if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -eq $image) { throw 'Clipboard image unavailable' }
    try {
      [System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
      $name = 'clipboard-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N') + '.png'
      $file = [System.IO.Path]::Combine($OutputDirectory, $name)
      $image.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
      return @{ paths = @($file) }
    } finally { $image.Dispose() }
  }
  if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
    return @{ paths = @([System.Windows.Forms.Clipboard]::GetFileDropList() | Where-Object { [System.IO.Path]::GetExtension($_) -match '^\.(png|jpg|jpeg|gif|webp|bmp)$' }) }
  }
  return @{ paths = @() }
}
if ($Server) {
  [Console]::Out.WriteLine('{"ready":true}')
  while ($null -ne ($request = [Console]::ReadLine())) {
    try { Read-ClipboardImages | ConvertTo-Json -Compress }
    catch { [Console]::Out.WriteLine('{"error":"Clipboard read failed"}') }
    [Console]::Out.Flush()
  }
} else {
  try { Read-ClipboardImages | ConvertTo-Json -Compress }
  catch { [Console]::Error.WriteLine('Clipboard image read failed'); exit 1 }
}
