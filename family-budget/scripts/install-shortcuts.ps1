# יוצר קיצור דרך עם לוגו בשולחן העבודה והפעלה אוטומטית של השרת עם Windows. (מכוון ל-ASCII בלבד)
$dir = Split-Path -Parent $PSScriptRoot
$ws = New-Object -ComObject WScript.Shell
function Make($path, $arguments) {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $s.Arguments = $arguments
  $s.WorkingDirectory = $dir
  $s.IconLocation = "$dir\build\icon.ico"
  $s.Save()
}
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
Make "$desktop\Family Budget.lnk" "`"$dir\app.vbs`""
Make "$startup\Family Budget Server.lnk" "`"$dir\app.vbs`" hidden"
Write-Host "Done. Shortcut 'Family Budget' was added to your Desktop."
Write-Host "The server will start automatically with Windows."
