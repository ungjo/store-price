param(
  [Parameter(Mandatory = $true)][string]$VideoPath,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string]$TimesMs = '300,500,700,900,1200,1600,2200,3000',
  [ValidateRange(1, 4096)][int]$Width = 800
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5) {
  throw 'Run this helper with Windows PowerShell 5.1 (powershell.exe), not PowerShell 7.'
}

# 로컬 원본만 읽고 출력 파일은 새로 만듭니다. UNC·대체 데이터 스트림·junction 경로를 따라가지 않습니다.
function Get-LocalOrdinaryPath([string]$Value, [bool]$AllowMissingLeaf) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z]:[\\/]' -or
    $Value.Substring(2).Contains(':')) { throw 'An absolute local drive path is required.' }
  $full = [System.IO.Path]::GetFullPath($Value)
  if ($full -notmatch '^[A-Za-z]:\\' -or $full.StartsWith('\\')) { throw 'Network paths are not allowed.' }
  $cursor = $full
  $first = $true
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Symbolic links and junctions are not allowed.'
      }
    } elseif (-not ($first -and $AllowMissingLeaf)) {
      throw 'The source and output parent directory must already exist.'
    }
    $first = $false
    $parent = [System.IO.Path]::GetDirectoryName($cursor.TrimEnd('\'))
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
  return $full
}

$sourcePath = Get-LocalOrdinaryPath $VideoPath $false
$targetDirectory = Get-LocalOrdinaryPath $OutputDirectory $true
$sourceInfo = Get-Item -LiteralPath $sourcePath -Force
if ($sourceInfo.PSIsContainer -or [System.IO.Path]::GetExtension($sourcePath) -ine '.mp4' -or
  $sourceInfo.Length -lt 1 -or $sourceInfo.Length -gt 512MB) {
  throw 'A nonempty MP4 file of at most 512 MiB is required.'
}
if ((Test-Path -LiteralPath $targetDirectory) -and
  -not (Get-Item -LiteralPath $targetDirectory -Force).PSIsContainer) { throw 'OutputDirectory is not a directory.' }
$tokens = @($TimesMs.Split(',') | ForEach-Object { $_.Trim() })
if ($tokens.Count -lt 1 -or $tokens.Count -gt 128) { throw 'Request between 1 and 128 frame times.' }
$times = @()
foreach ($token in $tokens) {
  $time = 0
  if ($token -notmatch '^(?:0|[1-9][0-9]*)$' -or -not [int]::TryParse($token, [ref]$time) -or
    $times -contains $time) { throw 'TimesMs must contain distinct nonnegative integer milliseconds separated by commas.' }
  $times += $time
}
$manifestPath = Join-Path $targetDirectory 'frames.json'
if (Test-Path -LiteralPath $manifestPath) { throw 'The output manifest already exists; choose a new output directory.' }
foreach ($time in $times) {
  foreach ($extension in @('jpg', 'png')) {
    if (Test-Path -LiteralPath (Join-Path $targetDirectory ('frame-{0:D7}ms.{1}' -f $time, $extension))) {
      throw 'A requested output frame already exists; no existing frame will be replaced.'
    }
  }
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Editing.MediaComposition, Windows.Media.Editing, ContentType = WindowsRuntime]
$null = [Windows.Media.Editing.MediaClip, Windows.Media.Editing, ContentType = WindowsRuntime]
$null = [Windows.Media.Editing.VideoFramePrecision, Windows.Media.Editing, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.ImageStream, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

# OCR 도우미와 같은 WinRT 비동기 대기 방식이며 영상·프레임을 외부 서비스로 전송하지 않습니다.
function Wait-WinRt($Operation, [Type]$ResultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Length -eq 1 -and
      $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]96 + '1'
  } | Select-Object -First 1
  if ($null -eq $asTask) { throw 'The Windows Runtime task adapter is unavailable.' }
  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  if (-not $task.Wait(30000)) { throw 'Local video frame extraction timed out.' }
  return $task.Result
}

function Get-StreamSha256([System.IO.Stream]$Stream) {
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Stream.Position = 0
    return ([System.BitConverter]::ToString($hash.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $Stream.Position = 0
    $hash.Dispose()
  }
}

$sourceGuard = $null
try {
  # 읽기 전용 핸들을 유지해 추출 도중 원본 변경·교체를 막고, 전후 SHA-256도 함께 기록합니다.
  $sourceGuard = [System.IO.File]::Open($sourcePath, [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  $sourceSha256 = Get-StreamSha256 $sourceGuard
  $file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($sourcePath)) ([Windows.Storage.StorageFile])
  $clip = Wait-WinRt ([Windows.Media.Editing.MediaClip]::CreateFromFileAsync($file)) ([Windows.Media.Editing.MediaClip])
  $composition = New-Object Windows.Media.Editing.MediaComposition
  # PowerShell 5.1에서는 Clips가 COM 객체로 보이므로 투영된 ICollection 인터페이스로 추가합니다.
  [System.Collections.Generic.ICollection[Windows.Media.Editing.MediaClip]].GetMethod('Add').Invoke($composition.Clips, @($clip))
  $durationMs = $composition.Duration.TotalMilliseconds
  if ($durationMs -le 0 -or @($times | Where-Object { $_ -ge $durationMs }).Count -gt 0) {
    throw 'Every requested time must be strictly before the end of the video.'
  }
  if (-not (Test-Path -LiteralPath $targetDirectory)) {
    $null = New-Item -ItemType Directory -Path $targetDirectory
  }
  $null = Get-LocalOrdinaryPath $targetDirectory $false
  $frames = @()
  foreach ($time in $times) {
    $image = $null
    $readStream = $null
    $memory = $null
    $output = $null
    try {
      # NearestFrame은 요청 시점의 가장 가까운 실제 프레임을 읽습니다. 높이 0으로 원본 비율을 보존하며 자르지 않습니다.
      $image = Wait-WinRt ($composition.GetThumbnailAsync([TimeSpan]::FromMilliseconds($time),
        $Width, 0, [Windows.Media.Editing.VideoFramePrecision]::NearestFrame)) ([Windows.Graphics.Imaging.ImageStream])
      $contentType = $image.ContentType
      $extension = switch ($contentType) { 'image/jpeg' { 'jpg' } 'image/png' { 'png' } default { throw 'Unexpected thumbnail content type.' } }
      if ($image.Size -lt 8 -or $image.Size -gt 64MB) { throw 'Unexpected thumbnail byte length.' }
      $decoder = Wait-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($image)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $pixelWidth = $decoder.PixelWidth
      $pixelHeight = $decoder.PixelHeight
      if ($pixelWidth -ne $Width -or $pixelHeight -lt 1) { throw 'Unexpected thumbnail dimensions.' }
      $image.Seek(0)
      $readStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead([Windows.Storage.Streams.IRandomAccessStream]$image)
      $memory = New-Object System.IO.MemoryStream
      $readStream.CopyTo($memory)
      $bytes = $memory.ToArray()
      $isJpeg = $bytes.Length -ge 3 -and $bytes[0] -eq 255 -and $bytes[1] -eq 216 -and $bytes[2] -eq 255
      $isPng = $bytes.Length -ge 8 -and [System.BitConverter]::ToString($bytes, 0, 8) -eq '89-50-4E-47-0D-0A-1A-0A'
      if (($extension -eq 'jpg' -and -not $isJpeg) -or ($extension -eq 'png' -and -not $isPng)) {
        throw 'Thumbnail bytes do not match the reported content type.'
      }
      $outputPath = Join-Path $targetDirectory ('frame-{0:D7}ms.{1}' -f $time, $extension)
      $output = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      $output.Write($bytes, 0, $bytes.Length)
      $output.Dispose()
      $output = $null
      $frames += [ordered]@{
        requestedTimeMs = $time; path = $outputPath; contentType = $contentType;
        width = $pixelWidth; height = $pixelHeight; bytes = $bytes.Length; sha256 = Get-StreamSha256 $memory
      }
    } finally {
      if ($null -ne $output) { $output.Dispose() }
      if ($null -ne $memory) { $memory.Dispose() }
      if ($null -ne $readStream) { $readStream.Dispose() }
      if ($null -ne $image) { $image.Dispose() }
    }
  }
  if ((Get-StreamSha256 $sourceGuard) -ne $sourceSha256) { throw 'Source video changed during frame extraction.' }
  # API는 실제 프레임 타임스탬프를 반환하지 않으므로 요청 시각을 측정값처럼 기록하지 않습니다.
  $report = [ordered]@{
    schemaVersion = 1; engine = 'Windows.Media.Editing.MediaComposition'; sourcePath = $sourcePath;
    sourceSha256 = $sourceSha256; sourceUnchanged = $true; durationMs = $durationMs;
    precision = 'NearestFrame'; requestedWidth = $Width; requestedHeight = 0;
    aspectRatioPreserved = $true; cropped = $false; frames = $frames
  }
  $json = $report | ConvertTo-Json -Depth 6
  $jsonBytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($json + [Environment]::NewLine)
  $manifest = [System.IO.File]::Open($manifestPath, [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try { $manifest.Write($jsonBytes, 0, $jsonBytes.Length) } finally { $manifest.Dispose() }
  $json
} finally {
  if ($null -ne $sourceGuard) { $sourceGuard.Dispose() }
}
