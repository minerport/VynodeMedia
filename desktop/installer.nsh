!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro customInit
  DetailPrint "Preparing Vynode Media installation"
  DetailPrint "The next step extracts the application and bundled media components to the selected folder"
!macroend

# electron-builder disables detail printing immediately before extraction. This
# hook runs directly after that point, restores the log, and preserves the
# builder's normal running-application safety check.
!include "getProcessInfo.nsh"
Var pid
!macro customCheckAppRunning
  SetDetailsPrint both
  DetailPrint "Checking whether Vynode Media is currently running"
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  DetailPrint "Preparing the selected installation folder: $INSTDIR"
  DetailPrint "Extracting Vynode Media and its bundled FFmpeg media engine"
!macroend

!macro customInstall
  DetailPrint "Phase 3 of 5: Application files installed; desktop and Start Menu shortcuts created"
  DetailPrint "Removing any previous Vynode Media firewall rule"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Vynode Media Server"'
  Pop $0
  DetailPrint "Phase 4 of 5: Adding Windows Firewall access for private networks on TCP port 8787"
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Vynode Media Server" dir=in action=allow program="$INSTDIR\Vynode Media.exe" protocol=TCP localport=8787 profile=private enable=yes'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Windows Firewall rule installed successfully"
  ${Else}
    DetailPrint "WARNING: Windows Firewall returned exit code $0"
  ${EndIf}
  DetailPrint "Vynode Media installation completed"
  DetailPrint "Your libraries, account session, settings, and watch history are stored separately and are preserved during upgrades"
!macroend

!macro customUnInstall
  DetailPrint "Stopping and removing the Vynode Media installation"
  DetailPrint "Removing the Windows Firewall rule for TCP port 8787"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Vynode Media Server"'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Windows Firewall rule removed successfully"
  ${Else}
    DetailPrint "Windows Firewall returned exit code $0 while removing the rule"
  ${EndIf}
  DetailPrint "Removing application files and shortcuts"
  DetailPrint "Vynode user data is being preserved so reinstalling does not erase libraries, settings, or watch history"
!macroend
