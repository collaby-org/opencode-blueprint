; opencode-blueprint Windows installer (Inno Setup 6).
; Built by installer/build.mjs, which passes /DAppVersion=<package.json version>.
;
; Behavior wrapped from bin/setup.mjs:
;   - Config home resolves exactly like setup.mjs:
;       process.env.OPENCODE_CONFIG_HOME || join(homedir(), ".config", "opencode")
;     i.e. %OPENCODE_CONFIG_HOME% or %USERPROFILE%\.config\opencode (see GetConfigHome).
;   - opencode.jsonc / AGENTS.md are backed up before overwrite (setup.mjs 2/6).
;   - commands/ and plugins/ deploy verbatim (overwrite is correct: versioned
;     content, unlike .env.example).
;   - config/.env.example is a starter template ONLY (onlyifdoesntexist), so an
;     existing file with filled-in keys/values is never overwritten.
;   - The remaining steps (prereqs, plugin npm deps, skills, CLIs, manual steps
;     in setup.mjs 1/6, 3/6, 4/6, 5/6, 6/6) run via npx in [Run] below.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{A3F1C9E2-4B7D-4E8F-9A0C-1D2E3F4A5B6C}
AppName=opencode-blueprint
AppVersion={#AppVersion}
AppVerName=opencode-blueprint {#AppVersion}
AppPublisher=Collaby Labs
DefaultDirName={localappdata}\opencode-blueprint
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=opencode-blueprint-setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
WizardStyle=modern
DisableProgramGroupPage=yes
InfoAfterFile=finish-note.txt

[Files]
; Reference payload (repair/offline copy of exactly what setup.mjs deploys).
Source: "..\AGENTS.md"; DestDir: "{app}\payload"; Flags: ignoreversion
Source: "..\config\opencode.jsonc"; DestDir: "{app}\payload\config"; Flags: ignoreversion
Source: "..\config\.env.example"; DestDir: "{app}\payload\config"; Flags: ignoreversion
Source: "..\config\commands\*"; DestDir: "{app}\payload\config\commands"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\config\plugins\*"; DestDir: "{app}\payload\config\plugins"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "node_modules\*"
Source: "..\bin\setup.mjs"; DestDir: "{app}\payload\bin"; Flags: ignoreversion
Source: "finish-note.txt"; DestDir: "{app}"; Flags: ignoreversion

; Live deployment to the opencode config home. uninsneveruninstall: uninstalling
; the installer must never delete the user's live opencode config.
Source: "..\AGENTS.md"; DestDir: "{code:GetConfigHome}"; Flags: ignoreversion uninsneveruninstall
Source: "..\config\opencode.jsonc"; DestDir: "{code:GetConfigHome}"; Flags: ignoreversion uninsneveruninstall
Source: "..\config\commands\*"; DestDir: "{code:GetConfigHome}\commands"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall
Source: "..\config\plugins\*"; DestDir: "{code:GetConfigHome}\plugins"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall; Excludes: "node_modules\*"
; Starter template only — never overwrite an existing (possibly filled-in) file.
Source: "..\config\.env.example"; DestDir: "{code:GetConfigHome}"; Flags: ignoreversion uninsneveruninstall onlyifdoesntexist

[Run]
; Full setup: prereqs, plugin npm deps, skills, CLIs. Config files were already
; deployed by [Files] above; setup.mjs re-applies them (with timestamped
; backups) and completes the remaining steps. Inherits OPENCODE_CONFIG_HOME
; from the install environment, so a sandboxed OPENCODE_CONFIG_HOME stays
; sandboxed. Runs in silent installs too (no postinstall flag on purpose).
; NOTE: npx is npx.cmd — CreateProcess cannot resolve it, so launch via {cmd}.
Filename: "{cmd}"; Parameters: "/c npx -y opencode-blueprint@{#AppVersion}"; StatusMsg: "Running opencode-blueprint setup (plugin deps, skills, CLIs — several minutes)..."; Flags: runascurrentuser waituntilterminated; Check: HasNpx
; Finish-page checkbox (GUI installs only).
Filename: "{code:GetConfigHome}"; Description: "Open config folder"; Flags: postinstall skipifsilent unchecked shellexec; Verb: open

[Code]
{ Config home — identical resolution to bin/setup.mjs:
    process.env.OPENCODE_CONFIG_HOME || join(homedir(), ".config", "opencode"). }
function GetConfigHome(Param: String): String;
begin
  Result := GetEnv('OPENCODE_CONFIG_HOME');
  if Result = '' then
    Result := ExpandConstant('{userprofile}\.config\opencode');
end;

function HasNpx(): Boolean;
var
  RC: Integer;
begin
  Result := Exec('cmd.exe', '/c npx --version', '', SW_HIDE, ewWaitUntilTerminated, RC) and (RC = 0);
end;

procedure BackupIfExists(const Path: String);
var
  Bak: String;
begin
  if FileExists(Path) then
  begin
    Bak := Path + '.bak-' + GetDateTimeString('yyyymmdd-hhnnss', '-', '-');
    CopyFile(Path, Bak, False);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Home: String;
begin
  { Mirror setup.mjs 2/6 backups before [Files] lands the new copies. }
  if CurStep = ssInstall then
  begin
    Home := GetConfigHome('');
    BackupIfExists(Home + '\opencode.jsonc');
    BackupIfExists(Home + '\AGENTS.md');
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and (not WizardSilent) and (not HasNpx()) then
    MsgBox('node/npx was not found on PATH, so the full setup step (plugin dependencies, skills, CLIs) was skipped.' + #13#10 + #13#10 +
           'Config files were still deployed. Install Node.js, then run:' + #13#10 +
           '  npx -y opencode-blueprint@{#AppVersion}' + #13#10 + #13#10 +
           'See the finish page for the remaining manual steps.',
           mbInformation, MB_OK);
end;
