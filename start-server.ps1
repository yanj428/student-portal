$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
node server/server.js *>> "$scriptDir\server.log"
