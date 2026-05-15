#define MyAppName "Adisyum"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Adisyum"
#define MyAppExeName "AdisyumPosAgent.exe"
#define TrayExeName "AdisyumTray.exe"
#define UpdaterExeName "AdisyumUpdater.exe"
#define AppInstallDir "{autopf}\Adisyum"
#define BridgeServiceName "AdisyumDesktopBridge"
#define UpdaterServiceName "AdisyumUpdater"

[Setup]
AppId={{C7A14481-6D25-4A7A-9A4B-0C4B1B4B7C10}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://adisyum.com
AppSupportURL=https://adisyum.com/support
AppUpdatesURL=https://adisyum.com/releases/windows
DefaultDirName={#AppInstallDir}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=AdisyumSetup
OutputDir=..\artifacts\windows
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
RestartIfNeededByRun=no
SetupLogging=yes
UninstallDisplayIcon={app}\{#TrayExeName}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Adisyum Desktop Bridge secure runtime and updater
VersionInfoProductName=Adisyum Desktop Bridge
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCopyright=Copyright (C) Adisyum

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayollarını oluştur"; Flags: unchecked
Name: "startmenuicon"; Description: "Başlat menüsü kısayollarını oluştur"; Flags: unchecked
Name: "autorun"; Description: "Windows açılışında tray ve bridge başlat"; Flags: checked

[Files]
Source: "..\artifacts\windows\bridge\AdisyumPosAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\artifacts\windows\bridge\AdisyumPosAgent.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\artifacts\windows\bridge\AdisyumPosAgent.runtimeconfig.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\artifacts\windows\bridge\AdisyumPosAgent.deps.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\artifacts\windows\tray\AdisyumTray.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\artifacts\windows\updater\AdisyumUpdater.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\artifacts\windows\release-manifest.json"; DestDir: "{localappdata}\Adisyum\DesktopBridge"; Flags: ignoreversion
Source: "..\shortcuts\Adisyum POS.url"; DestDir: "{userdesktop}"; Flags: ignoreversion; Tasks: desktopicon
Source: "..\shortcuts\Adisyum Admin.url"; DestDir: "{userdesktop}"; Flags: ignoreversion; Tasks: desktopicon
Source: "..\shortcuts\Adisyum POS.url"; DestDir: "{commonprograms}\Adisyum"; Flags: ignoreversion; Tasks: startmenuicon
Source: "..\shortcuts\Adisyum Admin.url"; DestDir: "{commonprograms}\Adisyum"; Flags: ignoreversion; Tasks: startmenuicon
Source: "..\shortcuts\Adisyum Tray.url"; DestDir: "{commonprograms}\Adisyum"; Flags: ignoreversion; Tasks: startmenuicon

[Dirs]
Name: "{app}"
Name: "{commonappdata}\Adisyum"
Name: "{localappdata}\Adisyum\DesktopBridge"
Name: "{localappdata}\Adisyum\Tray"

[Icons]
Name: "{commonprograms}\Adisyum\Adisyum Tray"; Filename: "{app}\{#TrayExeName}"; Tasks: startmenuicon
Name: "{userdesktop}\Adisyum Tray"; Filename: "{app}\{#TrayExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AdisyumTray"; ValueData: "\"{app}\{#TrayExeName}\""; Flags: uninsdeletevalue; Tasks: autorun
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AdisyumDesktopBridge"; ValueData: "\"{app}\{#MyAppExeName}\""; Flags: uninsdeletevalue; Tasks: autorun

[Run]
Filename: "{cmd}"; Parameters: "/c sc create {#BridgeServiceName} binPath= \"{app}\{#MyAppExeName}\" start= auto DisplayName= \"Adisyum Desktop Bridge\""; StatusMsg: "Windows service kuruluyor..."; Flags: runhidden waituntilterminated; Check: NeedServiceInstall
Filename: "{cmd}"; Parameters: "/c sc failure {#BridgeServiceName} reset= 86400 actions= restart/5000/restart/5000/restart/5000"; Flags: runhidden waituntilterminated; Check: NeedServiceInstall
Filename: "{cmd}"; Parameters: "/c sc description {#BridgeServiceName} \"Adisyum local printer / websocket / API bridge\""; Flags: runhidden waituntilterminated; Check: NeedServiceInstall
Filename: "{cmd}"; Parameters: "/c sc create {#UpdaterServiceName} binPath= \"{app}\{#UpdaterExeName}\" start= auto DisplayName= \"Adisyum Updater\""; StatusMsg: "Updater service kuruluyor..."; Flags: runhidden waituntilterminated; Check: NeedServiceInstall
Filename: "{cmd}"; Parameters: "/c sc failure {#UpdaterServiceName} reset= 86400 actions= restart/5000/restart/5000/restart/5000"; Flags: runhidden waituntilterminated; Check: NeedServiceInstall
Filename: "{cmd}"; Parameters: "/c sc description {#UpdaterServiceName} \"Adisyum signed release update service\""; Flags: runhidden waituntilterminated; Check: NeedServiceInstall
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall add rule name=\"Adisyum Bridge 3001\" dir=in action=allow protocol=TCP localport=3001"; Flags: runhidden waituntilterminated; Check: NeedFirewallRule
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall add rule name=\"Adisyum Bridge 4891\" dir=in action=allow protocol=TCP localport=4891"; Flags: runhidden waituntilterminated; Check: NeedFirewallRule
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall add rule name=\"Adisyum Bridge 3443\" dir=in action=allow protocol=TCP localport=3443"; Flags: runhidden waituntilterminated; Check: NeedFirewallRule
Filename: "{app}\{#TrayExeName}"; Description: "Adisyum tray uygulamasını başlat"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c sc stop {#BridgeServiceName}"; Flags: runhidden waituntilterminated
Filename: "{cmd}"; Parameters: "/c sc delete {#BridgeServiceName}"; Flags: runhidden waituntilterminated
Filename: "{cmd}"; Parameters: "/c sc stop {#UpdaterServiceName}"; Flags: runhidden waituntilterminated
Filename: "{cmd}"; Parameters: "/c sc delete {#UpdaterServiceName}"; Flags: runhidden waituntilterminated
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=\"Adisyum Bridge 3001\""; Flags: runhidden waituntilterminated
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=\"Adisyum Bridge 4891\""; Flags: runhidden waituntilterminated
Filename: "{cmd}"; Parameters: "/c netsh advfirewall firewall delete rule name=\"Adisyum Bridge 3443\""; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{localappdata}\Adisyum\DesktopBridge"
Type: filesandordirs; Name: "{localappdata}\Adisyum\Tray"
Type: filesandordirs; Name: "{commonappdata}\Adisyum"
Type: files; Name: "{userdesktop}\Adisyum POS.url"
Type: files; Name: "{userdesktop}\Adisyum Admin.url"
Type: filesandordirs; Name: "{commonprograms}\Adisyum"

[Code]
function NeedServiceInstall(): Boolean;
begin
  Result := True;
end;

function NeedFirewallRule(): Boolean;
begin
  Result := True;
end;
