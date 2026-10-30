; Tauri NSIS kancaları (tauri.conf.json → bundle.windows.nsis.installerHooks).

!macro NSIS_HOOK_PREINSTALL
  ; 0.1.11 ve öncesi kullanıcı klasörüne (%LOCALAPPDATA%) kuruluyordu; artık Program Files'a.
  ; Eski kurulum varsa sessizce kaldır ki iki kopya kalmasın. /UPDATE: otomatik başlatma görevi
  ; ve ayarlar korunur (görevin exe yolunu uygulama ilk açılışta kendisi günceller).
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "InstallLocation"
  ${If} $R8 != ""
    ; Değerler tırnaklı saklanır.
    nsis_tauri_utils::StrReplace "$R9" '"' ""
    Pop $R9
    ExecWait '$R8 /S /UPDATE _?=$R9' $0
    Sleep 1000 ; yardımcı süreç ana uygulama kapanınca çıkar
    Delete "$R9\uninstall.exe"
    RMDir "$R9"
    ; /UPDATE kısayolları bırakır; eski yola gidenleri sil (yenileri tüm kullanıcılar için oluşturulur).
    SetShellVarContext current
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$R9\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$R9\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
    SetShellVarContext all
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Otomatik başlatma görevini sil (ad: src-tauri/src/autostart.rs TASK_NAME), yoksa oturum
  ; açılışında artık olmayan exe'yi çalıştırmaya çalışır. Güncellemede (/UPDATE) eski kaldırıcı
  ; da çalışır; o durumda görev korunur, uygulama ilk açılışta yolu kendisi günceller.
  ${If} $UpdateMode <> 1
    nsExec::Exec 'schtasks.exe /Query /TN "Custom Performance Overlay"'
    Pop $0
    ${If} $0 == 0
      nsExec::Exec 'schtasks.exe /Delete /TN "Custom Performance Overlay" /F'
      Pop $0
      ${If} $0 != 0
        ; Görev yönetici yetkisiyle oluşturuldu; kaldırıcı yetkisiz çalışıyorsa silmek için bir kez UAC.
        ExecShellWait "runas" "schtasks.exe" '/Delete /TN "Custom Performance Overlay" /F' SW_HIDE
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
