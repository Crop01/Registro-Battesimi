Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Ottieni la cartella dove si trova questo script
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Cambia directory alla cartella del progetto
objShell.CurrentDirectory = strPath

' Avvia npm start completamente nascosto
' Il parametro 0 nasconde la finestra
' Il parametro False non aspetta che finisca
objShell.Run "npm start", 0, False

Set objShell = Nothing
Set objFSO = Nothing