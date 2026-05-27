Set shell = CreateObject("WScript.Shell")
repo = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = repo
shell.Run "cmd /c ""ACE.cmd""", 0, False