; opencode-blueprint Windows installer (Inno Setup 6).
; Built by installer/build.mjs, which passes /DAppVersion=<package.json version>.
;
; Behavior wrapped from bin/setup.mjs:
;   - Config home resolves exactly like setup.mjs:
;       process.env.OPENCODE_CONFIG_HOME || join(homedir(), ".config", "opencode")
;     i.e. %OPENCODE_CONFIG_HOME% or %USERPROFILE%\.config\opencode (see GetConfigHome).
;     Exec inherits the install environment, so a sandboxed OPENCODE_CONFIG_HOME
;     stays sandboxed end-to-end (config home resolution + env pass-through
;     untouched).
;   - opencode.jsonc / AGENTS.md are backed up before overwrite (setup.mjs 2/6).
;   - commands/ is deployed with a backup: the shipped commands are written over
;     the existing ones, and a command the user changed is copied next to it
;     before it is replaced. plugins/ deploys verbatim (overwrite is correct:
;     versioned content, unlike .env.example).
;   - config/.env.example is a starter template ONLY (onlyifdoesntexist), so an
;     existing file with filled-in keys/values is never overwritten.
;   - The remaining steps (prereqs, plugin npm deps, skills, CLIs, manual steps
;     in setup.mjs 1/6, 3/6, 4/6, 5/6, 6/6) run in CurStepChanged(ssPostInstall):
;     cmd /c npx -y opencode-blueprint@{#AppVersion} executes with SW_HIDE and
;     stdout+stderr redirected to {tmp}\obp-setup.log, so no console window
;     ever appears. A progress page tails that log on a timer tick and maps its
;     markers to live phase text + bar position, plus a read-only scrolling
;     memo showing the latest log lines so the user sees WHAT is happening
;     right now. A nonzero exit stops the page, shows the log tail, and fails
;     with a message pointing at the full log path.

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
; The shipped commands are written over the existing ones, and a command the
; user changed is backed up next to it (backupifexists) before it is replaced.
; A command the installer did not ship is never removed.
Source: "..\config\commands\*"; DestDir: "{code:GetConfigHome}\commands"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall backupifexists
Source: "..\config\plugins\*"; DestDir: "{code:GetConfigHome}\plugins"; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall; Excludes: "node_modules\*"
; Starter template only — never overwrite an existing (possibly filled-in) file.
Source: "..\config\.env.example"; DestDir: "{code:GetConfigHome}"; Flags: ignoreversion uninsneveruninstall onlyifdoesntexist

[Run]
; The full setup step runs hidden from [Code] below (live progress, captured
; log) instead of a visible [Run] entry, so the user never sees a cmd window.
; Finish-page checkbox (GUI installs only).
Filename: "{code:GetConfigHome}"; Description: "Open config folder"; Flags: postinstall skipifsilent unchecked shellexec; Verb: open

[Code]
const
  WAIT_TIMEOUT = 258;
  SETUP_LOG_MAX_TAIL_LINES = 25;
  SETUP_LOG_MAX_TAIL_CHARS = 3000;
  SETUP_LOG_MEMO_LINES = 10;

function WaitForSingleObject(hHandle: Integer; dwMilliseconds: Integer): Integer;
  external 'WaitForSingleObject@kernel32.dll stdcall';
function GetExitCodeProcess(hProcess: Integer; var lpExitCode: Integer): Integer;
  external 'GetExitCodeProcess@kernel32.dll stdcall';
function CloseHandle(hObject: Integer): Integer;
  external 'CloseHandle@kernel32.dll stdcall';

var
  SetupSkippedNoNpx: Boolean;

// Config home - identical resolution to bin/setup.mjs:
//   process.env.OPENCODE_CONFIG_HOME || join(homedir(), ".config", "opencode").
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

// Temp log capturing the hidden setup run (stdout+stderr).
function GetSetupLogPath(): String;
begin
  Result := ExpandConstant('{tmp}\obp-setup.log');
end;

// Version-pinned setup command. Runs via cmd.exe because npx is npx.cmd, which
// CreateProcess cannot resolve directly. Output is redirected to the temp log;
// combined with SW_HIDE the user never sees a console window. Inherits
// OPENCODE_CONFIG_HOME from the install environment.
function GetSetupCmdParams(const LogPath: String): String;
begin
  Result := '/c npx -y opencode-blueprint@{#AppVersion} > "' + LogPath + '" 2>&1';
end;

// Map recognizable setup.mjs markers in the temp log to a friendly phase label
// plus a progress bar position. Phase 3/4 nudge forward as their npm/npx lines
// accumulate. Activity is always the latest log lines - what is happening
// RIGHT now.
procedure DescribeSetupProgress(const LogPath: String; var Phase, Activity: String; var Progress: Integer);
var
  Lines: TArrayOfString;
  N, I, Kept: Integer;
  Line: String;
  Sect: Integer;
  NpmCount, NpxCount: Integer;
begin
  Phase := 'Starting setup...';
  Progress := 3;
  Activity := '';
  if not LoadStringsFromFile(LogPath, Lines) then
    Exit;
  N := GetArrayLength(Lines);
  Sect := 0;
  NpmCount := 0;
  NpxCount := 0;
  for I := 0 to N - 1 do
  begin
    Line := Lines[I];
    if Pos('== 1/6', Line) > 0 then Sect := 1
    else if Pos('== 2/6', Line) > 0 then Sect := 2
    else if Pos('== 3/6', Line) > 0 then Sect := 3
    else if Pos('== 4/6', Line) > 0 then Sect := 4
    else if Pos('== 5/6', Line) > 0 then Sect := 5
    else if Pos('== 6/6', Line) > 0 then Sect := 6;
    if Pos('$ npm install', Line) > 0 then NpmCount := NpmCount + 1;
    if Pos('$ npx ', Line) > 0 then NpxCount := NpxCount + 1;
    if Trim(Line) = 'Done.' then Sect := 7;
  end;
  case Sect of
    1: begin
      Phase := 'Step 1 of 6 - checking prerequisites (node, npx, git)...';
      Progress := 8;
    end;
    2: begin
      Phase := 'Step 2 of 6 - deploying config files...';
      Progress := 18;
    end;
    3: begin
      Phase := 'Step 3 of 6 - installing plugin dependencies with npm (slowest step)...';
      if NpmCount > 9 then NpmCount := 9;
      Progress := 30 + (NpmCount * 25) div 9;
    end;
    4: begin
      Phase := 'Step 4 of 6 - installing skills...';
      if NpxCount > 14 then NpxCount := 14;
      Progress := 60 + (NpxCount * 18) div 14;
    end;
    5: begin
      Phase := 'Step 5 of 6 - installing CLIs...';
      Progress := 88;
    end;
    6: begin
      Phase := 'Step 6 of 6 - wrapping up...';
      Progress := 96;
    end;
    7: begin
      Phase := 'Done - full setup completed.';
      Progress := 100;
    end;
  end;
  Kept := 0;
  for I := N - 1 downto 0 do
  begin
    if Kept >= 3 then Break;
    Line := Trim(Lines[I]);
    if Line = '' then Continue;
    if Activity = '' then Activity := Line
    else Activity := Line + #13#10 + Activity;
    Kept := Kept + 1;
  end;
end;

// Last MaxLines non-empty log lines (tail-capped) for failure reports.
function GetLogTail(const LogPath: String; MaxLines: Integer): String;
var
  Lines: TArrayOfString;
  N, I, Kept: Integer;
  Line: String;
begin
  Result := '';
  if not LoadStringsFromFile(LogPath, Lines) then
    Exit;
  N := GetArrayLength(Lines);
  Kept := 0;
  for I := N - 1 downto 0 do
  begin
    if Kept >= MaxLines then Break;
    Line := Trim(Lines[I]);
    if Line = '' then Continue;
    if Result = '' then Result := Line
    else Result := Line + #13#10 + Result;
    Kept := Kept + 1;
  end;
  if Length(Result) > SETUP_LOG_MAX_TAIL_CHARS then
    Result := '...' + Copy(Result, Length(Result) - SETUP_LOG_MAX_TAIL_CHARS + 4, SETUP_LOG_MAX_TAIL_CHARS);
end;

// GUI path: run the setup hidden while a progress page tails the temp log on a
// timer tick (phase text + bar + scrolling memo of the latest lines, so the
// user always sees WHAT is happening right now). Returns the process exit code.
function RunHiddenSetupWithProgress(const LogPath: String): Integer;
var
  Page: TOutputProgressWizardPage;
  LogMemo: TNewMemo;
  ProcHandle: Integer;
  WaitRes: Integer;
  ProcCode: Integer;
  Phase, Activity: String;
  Progress: Integer;
  Tail, LastTail: String;
begin
  Result := 1;
  Page := CreateOutputProgressPage(
    'Installing opencode-blueprint',
    'Running full setup: plugin dependencies, skills and CLIs.' + #13#10 +
    'This takes several minutes. Live progress is shown below; no action needed.');
  // Scrolling live log pinned to the bottom of the progress page. Read-only;
  // the caret is parked at the end so the newest lines stay visible.
  LogMemo := TNewMemo.Create(Page);
  LogMemo.Parent := Page.Surface;
  LogMemo.Left := 0;
  LogMemo.Top := Page.SurfaceHeight - 118;
  LogMemo.Width := Page.SurfaceWidth;
  LogMemo.Height := 110;
  LogMemo.ReadOnly := True;
  LogMemo.ScrollBars := ssVertical;
  LogMemo.WordWrap := False;
  LogMemo.Text := '(waiting for setup output...)';
  Page.SetText('Starting setup...', 'Live log is shown below - no action needed.');
  Page.SetProgress(0, 100);
  Page.Show;
  try
    if not Exec('cmd.exe', GetSetupCmdParams(LogPath), '', SW_HIDE, ewNoWait, ProcHandle) then
    begin
      Page.SetText('Could not start the setup step.',
        'Windows refused to launch the background task.');
      LogMemo.Text := '(could not start the background setup task)';
    end
    else
    begin
      LastTail := '';
      repeat
        Sleep(250);
        DescribeSetupProgress(LogPath, Phase, Activity, Progress);
        Tail := GetLogTail(LogPath, SETUP_LOG_MEMO_LINES);
        Page.SetProgress(Progress, 100);
        Page.SetText(Phase, 'Live log is shown below - no action needed.');
        if Tail <> LastTail then
        begin
          LastTail := Tail;
          if Tail = '' then
            LogMemo.Text := '(waiting for setup output...)'
          else
            LogMemo.Lines.Text := Tail;
          LogMemo.SelStart := Length(LogMemo.Text);
          LogMemo.SelLength := 0;
        end;
        WaitRes := WaitForSingleObject(ProcHandle, 250);
      until WaitRes <> WAIT_TIMEOUT;
      if GetExitCodeProcess(ProcHandle, ProcCode) = 0 then
        ProcCode := 1;
      CloseHandle(ProcHandle);
      Result := ProcCode;
      if ProcCode = 0 then
      begin
        Page.SetProgress(100, 100);
        Page.SetText('Done - full setup completed.', 'You can continue once this page closes.');
      end
      else
      begin
        Page.SetProgress(Progress, 100);
        Page.SetText('Setup step failed - see the message that follows.',
          GetLogTail(LogPath, 8));
      end;
    end;
  finally
    Page.Hide;
  end;
end;

// Nonzero exit: stop, point at the full log, and fail the install.
procedure FailHiddenSetup(const LogPath: String; SetupCode: Integer);
var
  Tail: String;
  Msg: String;
begin
  Tail := GetLogTail(LogPath, SETUP_LOG_MAX_TAIL_LINES);
  if Tail = '' then
    Tail := '(no output was captured)';
  Msg :=
    'The full setup step failed (exit code ' + IntToStr(SetupCode) + ').' + #13#10 + #13#10 +
    'Config files were still deployed. Details:' + #13#10 +
    '  Log: ' + LogPath + #13#10 +
    '  To retry manually: npx -y opencode-blueprint@{#AppVersion}' + #13#10 + #13#10 +
    'Last log lines:' + #13#10 + Tail;
  Log('obp: hidden setup failed, exit=' + IntToStr(SetupCode) + ', log=' + LogPath);
  if not WizardSilent then
    MsgBox(Msg, mbError, MB_OK);
  RaiseException(
    'opencode-blueprint setup step failed (exit ' + IntToStr(SetupCode) +
    '). Full log: ' + LogPath);
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
  LogPath: String;
  RC: Integer;
  SetupCode: Integer;
begin
  // Mirror setup.mjs 2/6 backups before the file list lands the new copies.
  if CurStep = ssInstall then
  begin
    Home := GetConfigHome('');
    BackupIfExists(Home + '\opencode.jsonc');
    BackupIfExists(Home + '\AGENTS.md');
  end;
  // Full setup (setup.mjs 1/6 + 3/6 + 4/6 + 5/6 + 6/6) runs here, hidden, with
  // live progress in GUI installs. Config files were already deployed by the
  // file list above; setup.mjs re-applies them (with timestamped backups) and
  // completes the remaining steps. Runs in silent installs too.
  if CurStep = ssPostInstall then
  begin
    if not HasNpx() then
    begin
      Log('obp: npx not found on PATH - full setup step skipped');
      // Graceful skip: config files are deployed; the finish page explains.
      SetupSkippedNoNpx := True;
    end
    else
    begin
      Log('obp: npx found - running hidden full setup');
      LogPath := GetSetupLogPath();
      Log('obp: setup log: ' + LogPath);
      if WizardSilent then
      begin
        if Exec('cmd.exe', GetSetupCmdParams(LogPath), '', SW_HIDE, ewWaitUntilTerminated, RC) then
        begin
          Log('obp: hidden setup finished, exit=' + IntToStr(RC));
          SetupCode := RC
        end
        else
        begin
          Log('obp: hidden setup failed to start');
          SetupCode := 1;
        end;
      end
      else
      begin
        SetupCode := RunHiddenSetupWithProgress(LogPath);
        Log('obp: hidden setup finished, exit=' + IntToStr(SetupCode));
      end;
      if SetupCode <> 0 then
        FailHiddenSetup(LogPath, SetupCode);
    end;
  end;
end;

procedure InitializeWizard();
begin
  WizardForm.WelcomeLabel2.Caption :=
    'This installs opencode-blueprint on this PC.' + #13#10 + #13#10 +
    'It deploys the opencode config (opencode.jsonc, AGENTS.md, commands' + #13#10 +
    'and plugins), then automatically runs the full setup: plugin' + #13#10 +
    'dependencies, skills and CLIs. That part takes several minutes and' + #13#10 +
    'shows live progress. No console window will ever pop up.' + #13#10 + #13#10 +
    'Click Next to continue.';
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine +
    'After copying, the full setup runs automatically:' + NewLine +
    'plugin dependencies, skills and CLIs (several minutes, with live progress).' + NewLine +
    'Everything runs hidden in the background - no console window appears.';
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'opencode-blueprint is installed';
    if SetupSkippedNoNpx then
      WizardForm.FinishedLabel.Caption :=
        'Config files were deployed, but the full setup step was skipped' + #13#10 +
        '(node/npx was not found). See the message shown and the previous' + #13#10 +
        'page for how to finish manually.'
    else
      WizardForm.FinishedLabel.Caption :=
        'Config files were deployed and the full setup step completed.' + #13#10 + #13#10 +
        'Remember to restart opencode fully: quit the app AND kill any' + #13#10 +
        'opencode-cli sidecar. See the previous page for the remaining' + #13#10 +
        'manual steps.';
  end;
  if (CurPageID = wpFinished) and (not WizardSilent) and SetupSkippedNoNpx then
    MsgBox('node/npx was not found on PATH, so the full setup step (plugin dependencies, skills, CLIs) was skipped.' + #13#10 + #13#10 +
           'Config files were still deployed. Install Node.js, then run:' + #13#10 +
           '  npx -y opencode-blueprint@{#AppVersion}' + #13#10 + #13#10 +
           'See the finish page for the remaining manual steps.',
           mbInformation, MB_OK);
end;
