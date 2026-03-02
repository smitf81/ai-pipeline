Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & Replace(WScript.ScriptFullName, "ACE_silent.vbs", "ACE.cmd") & """", 0
Set WshShell = Nothing
