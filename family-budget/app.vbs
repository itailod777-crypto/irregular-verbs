' מפעיל את השרת ברקע (בלי חלון שחור) ופותח את האפליקציה בחלון משלה.
' עם הארגומנט "hidden" מפעיל רק את השרת (להפעלה אוטומטית עם Windows).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
' אם השרת כבר רץ, ההפעלה השנייה נסגרת מעצמה
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
