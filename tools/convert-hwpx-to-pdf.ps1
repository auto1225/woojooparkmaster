param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
$source = (Resolve-Path -LiteralPath $InputPath).Path
$target = [System.IO.Path]::GetFullPath($OutputPath)
$hwp = $null

try {
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  $hwp.XHwpWindows.Item(0).Visible = $false
  $null = $hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
  if (-not $hwp.Open($source, "HWPX", "forceopen:true")) {
    throw "한컴에서 HWPX 파일을 열지 못했습니다."
  }
  $pageCount = [int]$hwp.PageCount
  if (-not $hwp.SaveAs($target, "PDF", "")) {
    throw "한컴에서 PDF 저장을 완료하지 못했습니다."
  }
  if (-not (Test-Path -LiteralPath $target) -or (Get-Item -LiteralPath $target).Length -lt 5) {
    throw "한컴 PDF 결과 파일이 생성되지 않았습니다."
  }
  Write-Output $pageCount
} finally {
  if ($hwp) {
    try { $hwp.Clear(1) | Out-Null } catch {}
    try { $hwp.Quit() | Out-Null } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp) | Out-Null
  }
}
