Set shell = CreateObject("WScript.Shell")

' Folder containing ACE.cmd
shell.CurrentDirectory = "C:\Users\felix\Desktop\Automated_AI_Pipeline\dev\ai-pipeline\ai-pipeline-updated"

' Run ACE.cmd hidden (0 = hidden window, False = don’t wait)
shell.Run "cmd /c ACE.cmd", 0, False