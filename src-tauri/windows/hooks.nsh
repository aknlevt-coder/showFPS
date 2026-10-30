; Tauri NSIS kancaları (tauri.conf.json → bundle.windows.nsis.installerHooks).

; 0.1.13'e kadarki ad ve exe. 0.1.11 ve öncesi kullanıcı klasörüne (HKCU), 0.1.12–0.1.13
; Program Files'a (HKLM) kuruluyordu; ikisi de "showFPS"ten ayrı bir kayıt olarak kalırdı.
!define OLD_PRODUCT "Custom Performance Overlay"
!define OLD_EXE "custom-performance-overlay.exe"
!define OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${OLD_PRODUCT}"

; Eski adlı kurulumu sessizce kaldırır. /UPDATE: eski kaldırıcı otomatik başlatma görevini ve
; ayarları silmez (görevi uygulama ilk açılışta yeni ada taşır, ayar klasörünü de yeni kimliğe).
; ROOT: HKCU ya da HKLM; CTX: kısayolların bulunduğu yer (current / all).
!macro REMOVE_OLD_INSTALL ROOT CTX
  ReadRegStr $R8 ${ROOT} "${OLD_UNINSTKEY}" "UninstallString"
  ReadRegStr $R9 ${ROOT} "${OLD_UNINSTKEY}" "InstallLocation"
  ${If} $R8 != ""
    ; Değerler tırnaklı saklanır.
    nsis_tauri_utils::StrReplace "$R9" '"' ""
    Pop $R9
    ExecWait '$R8 /S /UPDATE _?=$R9' $0
    Sleep 1000 ; yardımcı süreç ana uygulama kapanınca çıkar
    Delete "$R9\uninstall.exe"
    RMDir "$R9"
    ; /UPDATE kısayolları bırakır; eski exe'ye gidenleri sil (yenileri showFPS adıyla oluşturulur).
    SetShellVarContext ${CTX}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${OLD_PRODUCT}.lnk" "$R9\${OLD_EXE}"
    Pop $0
    ${If} $0 = 1
      Delete "$SMPROGRAMS\${OLD_PRODUCT}.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\${OLD_PRODUCT}.lnk" "$R9\${OLD_EXE}"
    Pop $0
    ${If} $0 = 1
      Delete "$DESKTOP\${OLD_PRODUCT}.lnk"
    ${EndIf}
    SetShellVarContext all
    DeleteRegKey ${ROOT} "${OLD_UNINSTKEY}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro REMOVE_OLD_INSTALL HKCU current
  !insertmacro REMOVE_OLD_INSTALL HKLM all
!macroend

; CPU sıcaklığı (ve CPU saat hızı/gücü) PawnIO sürücüsünü ister. Kurulu değilse kurulumla gelen
; resmi PawnIO kurulumu sessizce çalıştırılır (scripts/fetch-pawnio.mjs indirir, imzasını doğrular).
; Zaten kuruluysa (başka bir uygulama da kurmuş olabilir) dokunulmaz. Kaldırırken PawnIO silinmez:
; başka uygulamalar da kullanıyor olabilir.
!macro NSIS_HOOK_POSTINSTALL
  ClearErrors
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\PawnIO" "ImagePath"
  ${If} ${Errors}
  ${AndIf} ${FileExists} "$INSTDIR\PawnIO_setup.exe"
    DetailPrint "PawnIO sürücüsü kuruluyor (CPU sıcaklığı için)..."
    ExecWait '"$INSTDIR\PawnIO_setup.exe" -install -silent' $0
    DetailPrint "PawnIO kurulumu bitti (kod $0)"
    ; 3010 = ERROR_SUCCESS_REBOOT_REQUIRED: bitiş sayfası yeniden başlatmayı önerir.
    ${If} $0 = 3010
      SetRebootFlag true
    ${EndIf}
  ${EndIf}
!macroend

; Görev yönetici yetkisiyle oluşturuldu; kaldırıcı yetkisiz çalışıyorsa silmek için bir kez UAC.
!macro DELETE_TASK NAME
  nsExec::Exec 'schtasks.exe /Query /TN "${NAME}"'
  Pop $0
  ${If} $0 == 0
    nsExec::Exec 'schtasks.exe /Delete /TN "${NAME}" /F'
    Pop $0
    ${If} $0 != 0
      ExecShellWait "runas" "schtasks.exe" '/Delete /TN "${NAME}" /F' SW_HIDE
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Otomatik başlatma görevini sil (ad: src-tauri/src/autostart.rs TASK_NAME), yoksa oturum
  ; açılışında artık olmayan exe'yi çalıştırmaya çalışır. Güncellemede (/UPDATE) eski kaldırıcı
  ; da çalışır; o durumda görev korunur, uygulama ilk açılışta yolu kendisi günceller.
  ${If} $UpdateMode <> 1
    !insertmacro DELETE_TASK "showFPS"
    !insertmacro DELETE_TASK "${OLD_PRODUCT}"
  ${EndIf}
!macroend
