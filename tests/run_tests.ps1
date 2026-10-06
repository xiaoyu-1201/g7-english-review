# 啟動本機網站（5181）＋模擬 Firebase（5190），跑指定的測試，跑完關掉
# 用法：.\tests\run_tests.ps1                     （全部，不含 test_live：它抓的是線上網站）
#       .\tests\run_tests.ps1 -Tests test_speak.py
# 這個檔要存成 UTF-8 BOM（Windows PowerShell 5.1 才讀得懂中文）
param([string[]]$Tests)
$d = $PSScriptRoot
$app = Split-Path $d -Parent
if (-not $Tests) { $Tests = (Get-ChildItem $d -Filter 'test_*.py' | Where-Object Name -ne 'test_live.py').Name }
if (Test-Path 'C:\Python314') { $env:Path = "C:\Python314;C:\Python314\Scripts;" + $env:Path }
$env:PYTHONIOENCODING = "utf-8"
$web = Start-Process python -ArgumentList "-m", "http.server", "5181", "--bind", "127.0.0.1" -WorkingDirectory $app -WindowStyle Hidden -PassThru
$mock = Start-Process python -ArgumentList "`"$d\mock_firebase.py`"", "5190" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
try {
  foreach ($t in $Tests) {
    "===== $t"
    $out = python "$d\$t" 2>&1 | % { "$_" }
    $out | Set-Content -Encoding utf8 "$d\last_$t.log"
    $out | Select-Object -Last 14
  }
} finally {
  Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $mock.Id -Force -ErrorAction SilentlyContinue
}
