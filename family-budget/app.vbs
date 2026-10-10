' Starts the server in the background (no black window) and opens the app in its own window.
' With the argument "hidden" it only starts the server (auto-start with Windows).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
' If the server is already running, the second start exits by itself
sh.Run "cmd /c (if not exist data mkdir data) & node server.js >> data\server.log 2>&1", 0, False
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "hidden" Then WScript.Quit
End If
WScript.Sleep 3500
url = "http://127.0.0.1:3000"
On Error Resume Next
sh.Run "msedge --app=" & url, 1, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run "chrome --app=" & url, 1, False
End If
If Err.Number <> 0 Then
  Err.Clear
  sh.Run url, 1, False
End If
