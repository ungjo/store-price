param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [int]$Left = -1,
  [int]$Top = -1,
  [int]$Width = -1,
  [int]$Height = -1,
  [switch]$AutoCrop
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IBuffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.PixelDataProvider, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

# WinRT 지원이 있는 Windows PowerShell 5.1에서만 실행하며 외부 OCR 서비스로 사진을 보내지 않는다.
function Wait-WinRt($Operation, [Type]$ResultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Length -eq 1 -and
      $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  if (-not $task.Wait(20000)) { throw 'Local OCR operation timed out.' }
  return $task.Result
}

$stream = $null
$bitmap = $null
try {
  $file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
  $stream = Wait-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Wait-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $cropDetection = $null
  if ($AutoCrop) {
    if ($Left -ne -1 -or $Top -ne -1 -or $Width -ne -1 -or $Height -ne -1) { throw 'Explicit crop and automatic crop cannot be combined.' }
    # TalkBack 표시의 중앙 정렬·짙은 반투명 직사각형 경계를 검증한다. 전체 화면 OCR은 하지 않는다.
    Add-Type -TypeDefinition @'
using System;
public static class TalkBackSpeechRectangle {
  static bool Dark(byte[] b, int i) { int min=Math.Min(b[i],Math.Min(b[i+1],b[i+2])); int max=Math.Max(b[i],Math.Max(b[i+1],b[i+2])); return min>=30 && max<=140 && max-min<=20; }
  // 반투명 표시 밑에 있는 아이콘은 경계 색을 바꾼다. 표시는 모든 채널을 어둡게 하므로 무채색 동일성 대신 밝기 상한을 확인한다.
  static bool Shaded(byte[] b,int i) { return Math.Max(b[i],Math.Max(b[i+1],b[i+2]))<=140; }
  public static int[] Find(byte[] b,int w,int h) {
    int[] best=null; int bestArea=0;
    for(int y=0;y<h-35;y++) for(int x=0;x<w;x++) {
      if(!Dark(b,(y*w+x)*4)) continue;
      int left=x; while(x<w && Dark(b,(y*w+x)*4)) x++; int right=x-1; int width=right-left+1;
      if(width<100 || width>w*0.96 || Math.Abs((left+right)/2.0-w/2.0)>Math.Max(32,w*0.06)) continue;
      int i=(y*w+left)*4; byte[] color={b[i],b[i+1],b[i+2]}; int last=y, matches=0, misses=0;
      for(int yy=y;yy<h && yy-y<270;yy++) {
        bool ok=Shaded(b,(yy*w+left)*4) && Shaded(b,(yy*w+right)*4);
        if(ok) { last=yy; matches++; misses=0; } else if(++misses>=3) break;
      }
      int height=last-y+1; if(height<35 || matches<height*0.85 || last<h-220) continue;
      int dark=0; for(int yy=y;yy<=last;yy+=3) for(int xx=left;xx<=right;xx+=3) if(Dark(b,(yy*w+xx)*4)) dark++;
      if(dark<Math.Ceiling(width/3.0)*Math.Ceiling(height/3.0)*0.30) continue;
      int area=width*height; if(area>bestArea) { bestArea=area; best=new int[]{left,y,width,height,color[2],color[1],color[0]}; }
    }
    if(best==null) throw new InvalidOperationException("A centered dark TalkBack speech rectangle was not found.");
    return best;
  }
}
'@
    $searchHeight = [Math]::Min(300, [Math]::Floor($decoder.PixelHeight * 0.25))
    $searchTop = $decoder.PixelHeight - $searchHeight
    $searchBounds = New-Object Windows.Graphics.Imaging.BitmapBounds
    $searchBounds.X = 0; $searchBounds.Y = $searchTop; $searchBounds.Width = $decoder.PixelWidth; $searchBounds.Height = $searchHeight
    $searchTransform = New-Object Windows.Graphics.Imaging.BitmapTransform
    $searchTransform.Bounds = $searchBounds
    $searchData = Wait-WinRt ($decoder.GetPixelDataAsync(
      [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
      $searchTransform, [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
      [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.PixelDataProvider])
    $rectangle = [TalkBackSpeechRectangle]::Find($searchData.DetachPixelData(), $decoder.PixelWidth, $searchHeight)
    $Left = $rectangle[0]; $Top = $searchTop + $rectangle[1]; $Width = $rectangle[2]; $Height = $rectangle[3]
    $cropDetection = @{ kind = 'centered-dark-bottom-rectangle'; verticalEdgesVerified = $true;
      searchHeight = $searchHeight; backgroundRgb = @($rectangle[4], $rectangle[5], $rectangle[6]) }
  }
  if ($Left -lt 0 -or $Top -lt 0 -or $Width -le 0 -or $Height -le 0 -or
    ($Left + $Width) -gt $decoder.PixelWidth -or ($Top + $Height) -gt $decoder.PixelHeight -or
    $Top -lt [Math]::Floor($decoder.PixelHeight * 0.75) -or
    ($Width * 2) -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or ($Height * 2) -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) {
    throw 'Only an explicit crop within the bottom quarter of the screenshot is allowed.'
  }
  $scale = 2
  $bounds = New-Object Windows.Graphics.Imaging.BitmapBounds
  $bounds.X = $Left * $scale; $bounds.Y = $Top * $scale; $bounds.Width = $Width * $scale; $bounds.Height = $Height * $scale
  $transform = New-Object Windows.Graphics.Imaging.BitmapTransform
  $transform.ScaledWidth = $decoder.PixelWidth * $scale
  $transform.ScaledHeight = $decoder.PixelHeight * $scale
  $transform.InterpolationMode = [Windows.Graphics.Imaging.BitmapInterpolationMode]::NearestNeighbor
  $transform.Bounds = $bounds
  $pixelData = Wait-WinRt ($decoder.GetPixelDataAsync(
    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
    $transform, [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
    [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.PixelDataProvider])
  $pixels = $pixelData.DetachPixelData()
  # 반투명 표시 뒤 아이콘은 약 85 이하로 어두워진다. 85~255를 선형 반전해 한글 획과 숫자 쉼표의 회색 경계를 보존한다.
  for ($index = 0; $index -lt $pixels.Length; $index += 4) {
    $minimum = [Math]::Min($pixels[$index], [Math]::Min($pixels[$index + 1], $pixels[$index + 2]))
    $maximum = [Math]::Max($pixels[$index], [Math]::Max($pixels[$index + 1], $pixels[$index + 2]))
    $value = if (($maximum - $minimum) -le 45) { [int][Math]::Max(0, [Math]::Min(255, 255 - ($minimum - 85) * 1.5)) } else { 255 }
    $pixels[$index] = $value; $pixels[$index + 1] = $value; $pixels[$index + 2] = $value; $pixels[$index + 3] = 255
  }
  $bitmap = New-Object Windows.Graphics.Imaging.SoftwareBitmap(
    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, ($Width * $scale), ($Height * $scale),
    [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore)
  $bitmap.CopyFromBuffer([System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer([byte[]]$pixels))
  $language = New-Object Windows.Globalization.Language('ko')
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  if ($null -eq $engine) { throw 'The Korean Windows OCR language pack is unavailable.' }
  $result = Wait-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  # 잘라낸 영역만 OCR한다. 발화 출처 확인은 같은 단계의 TalkBack 서비스·실제 포커스 증거와 결합한다.
  $lines = @($result.Lines | ForEach-Object {
    @{ text = $_.Text; words = @($_.Words | ForEach-Object {
      @{ text = $_.Text; bounds = @($_.BoundingRect.X, $_.BoundingRect.Y, $_.BoundingRect.Width, $_.BoundingRect.Height) }
    }) }
  })
  @{ schemaVersion = 1; engine = 'Windows.Media.Ocr'; language = $engine.RecognizerLanguage.LanguageTag;
    imageWidth = $decoder.PixelWidth; imageHeight = $decoder.PixelHeight;
    crop = @($Left, $Top, $Width, $Height); cropDetection = $cropDetection; scale = $scale;
    preprocessing = 'inverted-neutral-grayscale-85-255'; text = $result.Text; lines = $lines
  } | ConvertTo-Json -Depth 8 -Compress
} finally {
  if ($null -ne $bitmap) { $bitmap.Dispose() }
  if ($null -ne $stream) { $stream.Dispose() }
}
