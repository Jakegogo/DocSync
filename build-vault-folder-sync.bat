@echo off
setlocal enabledelayedexpansion

REM Simple build & optional deploy script for the Vault Folder Sync Obsidian plugin

set ROOT=%~dp0
pushd "%ROOT%"

echo Building Vault Folder Sync plugin...

REM Install deps if node_modules is missing
if not exist "%ROOT%\node_modules" (
  echo node_modules not found, running npm install...
  call npm install || goto :error
)

call npm run build --silent || goto :error
echo Build finished (main.js, manifest.json)

REM Optional deployment when DEST is provided
if "%~1"=="" goto :done
set DEST=%~1

call :deploy_entry "%DEST%"
goto :done

:deploy_entry
set TARGET=%~1
echo Deploying using DEST: %TARGET%

REM Case 1: DEST is an Obsidian vault root (contains .obsidian)
if exist "%TARGET%\.obsidian" (
  set PLUGIN_DIR=%TARGET%\.obsidian\plugins\vault-folder-sync
  call :deploy_to_plugin_dir "%PLUGIN_DIR%"
  goto :eof
)

REM Case 2: DEST is already the plugin directory
echo %TARGET% | findstr /i ".obsidian\\plugins\\vault-folder-sync" >nul
if not errorlevel 1 (
  call :deploy_to_plugin_dir "%TARGET%"
  goto :eof
)

REM Case 3: DEST looks like Obsidian Documents root containing multiple vaults
if exist "%TARGET%" (
  set found_any=0
  for /d %%V in ("%TARGET%\*") do (
    if exist "%%V\.obsidian" (
      set found_any=1
      set PLUGIN_DIR=%%V\.obsidian\plugins\vault-folder-sync
      call :deploy_to_plugin_dir "!PLUGIN_DIR!"
    )
  )
  if "%found_any%"=="0" (
    echo No vaults found under: %TARGET% (expected subfolders with .obsidian) 1>&2
    goto :error
  )
  goto :eof
)

echo DEST does not exist: %TARGET% 1>&2
goto :error

:deploy_to_plugin_dir
set PLUGIN_DIR=%~1
echo Installing plugin to: %PLUGIN_DIR%
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
copy /Y "%ROOT%manifest.json" "%PLUGIN_DIR%\manifest.json" >nul
copy /Y "%ROOT%main.js" "%PLUGIN_DIR%\main.js" >nul
if exist "%ROOT%reverse-sync.js" copy /Y "%ROOT%reverse-sync.js" "%PLUGIN_DIR%\reverse-sync.js" >nul
echo Deployed: %PLUGIN_DIR%
goto :eof

:done
popd
exit /b 0

:error
popd
echo Build or deploy failed.
exit /b 1


