; MaiCore-Start Inno Setup script
; Build run.c with icon.res before packaging, then update AppExeName when the exe name changes.

#define MyAppName "MaiCoreStart-v5.1.0-beta"
#define MyAppVersion "5.1.0"
#define MyAppPublisher "xiaoCZX"
#define MyAppURL "https://github.com/MaiCore-Start/MaiCore-Start"
#define MyAppExeName "MaiCoreStart-v5.1.0-beta.exe"
#define MyMcsInsAssocName "实例打包文件"
#define MyMcsInsAssocExt ".mcsins"
#define MyMcsInsAssocKey "MaiCoreStart.mcsins"
#define MyMcsModAssocName "部署模板打包文件"
#define MyMcsModAssocExt ".mcsmod"
#define MyMcsModAssocKey "MaiCoreStart.mcsmod"

[Setup]
AppId={{D4B1D6CE-2B8A-46A3-A6BA-0FE48BB6EBA6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
OutputBaseFilename=MaiCoreStart-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequiredOverridesAllowed=dialog
ChangesAssociations=yes
SetupIconFile=..\icon.ico
LicenseFile=LICENSE.txt

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,Temporary\*,venv\*,.venv\*,env\*,.env\*,node_modules\*,webui\frontend\node_modules\*,desktop_pet_frontend\node_modules\*,setup\Output\*"
Source: "..\mcsins.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\mcsmod.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Registry]
Root: HKA; Subkey: "Software\Classes\{#MyMcsInsAssocExt}"; ValueType: string; ValueName: ""; ValueData: "{#MyMcsInsAssocKey}"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\{#MyMcsInsAssocExt}\OpenWithProgids"; ValueType: string; ValueName: "{#MyMcsInsAssocKey}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\{#MyMcsInsAssocKey}"; ValueType: string; ValueName: ""; ValueData: "{#MyMcsInsAssocName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\{#MyMcsInsAssocKey}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\mcsins.ico,0"
Root: HKA; Subkey: "Software\Classes\{#MyMcsInsAssocKey}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

Root: HKA; Subkey: "Software\Classes\{#MyMcsModAssocExt}"; ValueType: string; ValueName: ""; ValueData: "{#MyMcsModAssocKey}"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\{#MyMcsModAssocExt}\OpenWithProgids"; ValueType: string; ValueName: "{#MyMcsModAssocKey}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\{#MyMcsModAssocKey}"; ValueType: string; ValueName: ""; ValueData: "{#MyMcsModAssocName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\{#MyMcsModAssocKey}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\mcsmod.ico,0"
Root: HKA; Subkey: "Software\Classes\{#MyMcsModAssocKey}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent
