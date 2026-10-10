# יוצר קיצור דרך עם לוגו בשולחן העבודה והפעלה אוטומטית של השרת עם Windows. (מכוון ל-ASCII בלבד)
$dir = Split-Path -Parent $PSScriptRoot
$ws = New-Object -ComObject WScript.Shell
function Make($path, $arguments, $target = "$env:WINDIR\System32\wscript.exe") {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = $target
  $s.Arguments = $arguments
  $s.WorkingDirectory = $dir
  $s.IconLocation = "$dir\build\icon.ico"
  $s.Save()
}
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
Make "$desktop\Family Budget.lnk" "`"$dir\app.vbs`""
Make "$startup\Family Budget Server.lnk" "`"$dir\app.vbs`" hidden"
Make "$desktop\Update Family Budget.lnk" "" "$dir\update.bat"
Write-Host "Done. Shortcut 'Family Budget' was added to your Desktop."
Write-Host "The server will start automatically with Windows."
