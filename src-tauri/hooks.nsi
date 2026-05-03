!macro MARKPAD_REGISTER_OPEN_WITH EXTENSION
  WriteRegStr HKCU "Software\Classes\.${EXTENSION}\shell\Open with Markpad" "" "Open with Markpad"
  WriteRegStr HKCU "Software\Classes\.${EXTENSION}\shell\Open with Markpad" "Icon" "$INSTDIR\Markpad.exe"
  WriteRegStr HKCU "Software\Classes\.${EXTENSION}\shell\Open with Markpad\command" "" "$\"$INSTDIR\Markpad.exe$\" $\"%1$\""

  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXTENSION}\shell\Open with Markpad" "" "Open with Markpad"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXTENSION}\shell\Open with Markpad" "Icon" "$INSTDIR\Markpad.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXTENSION}\shell\Open with Markpad\command" "" "$\"$INSTDIR\Markpad.exe$\" $\"%1$\""

  WriteRegStr HKCU "Software\Classes\.${EXTENSION}\OpenWithList\Markpad.exe" "" ""
!macroend

!macro MARKPAD_UNREGISTER_OPEN_WITH EXTENSION
  DeleteRegKey HKCU "Software\Classes\.${EXTENSION}\shell\Open with Markpad"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXTENSION}\shell\Open with Markpad"
  DeleteRegKey HKCU "Software\Classes\.${EXTENSION}\OpenWithList\Markpad.exe"
!macroend

!macro NSIS_HOOK_POST_INSTALL
  CreateShortcut "$DESKTOP\Markpad.lnk" "$INSTDIR\Markpad.exe" "" "$INSTDIR\Markpad.exe" 0

  WriteRegStr HKCU "Software\Classes\Applications\Markpad.exe\shell\open\command" "" "$\"$INSTDIR\Markpad.exe$\" $\"%1$\""
  !insertmacro MARKPAD_REGISTER_OPEN_WITH "md"
  !insertmacro MARKPAD_REGISTER_OPEN_WITH "markdown"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POST_UNINSTALL
  Delete "$DESKTOP\Markpad.lnk"

  DeleteRegKey HKCU "Software\Classes\Applications\Markpad.exe"
  !insertmacro MARKPAD_UNREGISTER_OPEN_WITH "md"
  !insertmacro MARKPAD_UNREGISTER_OPEN_WITH "markdown"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
