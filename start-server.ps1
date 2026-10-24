$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Keep the log from growing forever: start a fresh one once it passes 5 MB.
$log = Join-Path $scriptDir 'server.log'
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) {
  Move-Item $log "$log.old" -Force
}

node server/server.js *>> $log
