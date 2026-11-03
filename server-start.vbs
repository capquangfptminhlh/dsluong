Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Lumi Pet\.gemini\antigravity\scratch\autotax\backend"
WshShell.Run "cmd /c node server.js", 0, False
