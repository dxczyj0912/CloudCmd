param([string]$list)
for ($i = 1; $i -le 40; $i++) {
  $out = & node tools/_tmp-err.js --file $list 2>&1
  $txt = ($out | Out-String)
  if ($txt -notmatch 'ReferenceError|SyntaxError|is not defined|Unexpected') {
    $out | ForEach-Object { $_ }
    exit 0
  }
  Start-Sleep -Milliseconds 1500
}
Write-Output "GAVE UP: still broken after retries"
$out | ForEach-Object { $_ }
exit 1
