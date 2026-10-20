# Runs a rundot command, retrying while the API answers "Too Many Requests".
# Usage: powershell -File tools/gen-retry.ps1 <rundot args...>
$rundot = "$env:LOCALAPPDATA\Programs\Rundot\rundot.exe"
for ($i = 1; $i -le 8; $i++) {
    $out = & $rundot @args 2>&1 | Out-String
    Write-Output "--- attempt $i ---"
    Write-Output $out
    if ($out -notmatch 'Too Many Requests') { exit 0 }
    Start-Sleep -Seconds 60
}
Write-Output "Gave up after repeated rate limits."
exit 1
