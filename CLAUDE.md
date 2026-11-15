# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

showFPS is a Windows 10/11 in-game performance overlay (FPS, frametime, 1%/0.1% lows, CPU/GPU temps and load, RAM/VRAM, clocks, power, fan). Stack: Tauri 2 (Rust) + React/TypeScript/Vite + a .NET 10 sensor helper. The maintainer communicates in Turkish; code comments, docs and UI source strings are Turkish (UI is bilingual TR/EN).

## Commands

Prerequisites: Node 20+, Rust (MSVC), .NET 10 SDK.

```bash
npm install
npm run build:helper        # builds helper/ (.NET) into src-tauri/binaries/ and downloads+verifies PawnIO_setup.exe; REQUIRED before the first `tauri dev`/build
npm run tauri dev           # desktop dev build (not elevated: no FPS/CPU temp unless the terminal is admin)
npm run dev                 # UI only in a browser at http://localhost:1420 (+ /#/overlay); runs on demo data
npm run typecheck           # tsc --noEmit
npm run release             # bumps patch version, builds signed installer + updater files into release/v<ver>/
node scripts/release.mjs --no-bump   # retry a failed release build without bumping again
npm run icons               # regenerate all icons/installer bitmaps from src-tauri/icons/source/app-icon.svg
```

Rust tests (run from `src-tauri/`):

```bash
cargo test --lib                              # unit tests
cargo test --lib migrate                      # single test/module by name filter
cargo test --lib -- --include-ignored         # also runs tests that touch Task Scheduler / network (PawnIO download)
```

There is no JS test suite or linter; `npm run typecheck` and `cargo clippy --lib -- -D warnings` are the checks (CI in `.github/workflows/ci.yml` runs build, `build:helper`, clippy with warnings as errors, and `cargo test --lib`). Helper diagnostics: `helper/publish/lhm-helper.exe --list-sensors [--motherboard]` (dump all LHM sensors) and `--fps-test` (15 s ETW FPS test; needs admin).

`npm run release` requires `CHANGELOG.md` to contain a `## <new version>` section (used as the updater notes; it aborts before building otherwise) and the updater signing key at `%USERPROFILE%\.tauri\cpo-updater.key` (outside the repo, never commit). Output goes to `release/` (gitignored); publishing = GitHub release tagged `v<version>` with the two files from `release/v<version>/`.

## Architecture

Three processes:

1. **Rust host** (`src-tauri/src/lib.rs`) — creates two webview windows: `main` (control panel, created in code so Mica can be applied on Win11) and `overlay` (transparent, always-on-top, click-through when locked; declared in `tauri.conf.json`). Owns the tray menu (left click opens the panel; overlay/lock items emit `tray-action` to the panel, which owns that state; labels come from the panel via `set_tray_labels`), restarts the sensor helper on unexpected exit (backoff, max 5 in a row), `state.json` persistence (atomic write, broadcasts `state-changed` to both windows), the sysinfo sampler (CPU/RAM), session files (`sessions.rs`), autostart (`autostart.rs`), PawnIO install (`pawnio.rs`), running-app enumeration (`apps.rs`), keeping the overlay above fullscreen games (`topmost.rs`), self resource usage (`usage.rs`). The release exe is built with a `requireAdministrator` manifest (`app-admin.manifest` + `build.rs`; keep that file pure ASCII).
2. **Sensor helper** (`helper/`, .NET, LibreHardwareMonitor + TraceEvent) — spawned by Rust as a Tauri sidecar (`lhm-helper.exe`). Writes one JSON line per second to stdout (`{"type":"data"|"info"|"error",...}`); Rust re-emits `data` as the `telemetry` event and `info`/`error` as `sensor-status`. Reads stdin commands (`frames on` / `frames off` toggles per-frame frametime arrays) and exits on stdin EOF (so the ETW session is closed cleanly — don't kill it directly). FPS comes from ETW DXGI/D3D9 Present events of the *foreground* process (`FpsTracker.cs`; `Foreground.cs` gives fg process + fullscreen flag). GPU selection prefers NVIDIA, then largest dedicated memory (avoid integrated AMD/Intel GPUs).
3. **Frontend** (`src/`) — one bundle, routed by hash: `#/overlay` renders `overlay/OverlayPage.tsx`, otherwise `panel/ControlPanel.tsx`. Both windows run the same store.

Key frontend concepts:
- `store.ts` — single app state (`useSyncExternalStore`), saved via `save_state` with an origin tag so a window ignores its own echo of `state-changed`. `normalize()` migrates old/partial state (always add defaults for new fields there). `recording` is reset when loading from disk but must be kept on live sync (`normalize(raw, false)`).
- `i18n.ts` — strings are written inline as `L("Türkçe", "English")`. Module-level arrays/objects that hold labels must use getters (`get label() { return L(...) }`) or functions so they re-evaluate after a language switch. Use `percent()`/`locale()` for number formatting.
- `metrics.ts` — metric definitions, formatting, and `ALERT_INFO` (single source for thresholds, colours and notifications). Missing data is shown as "—"; never fabricate values.
- `automation.ts` (game detection/auto profile), `session.ts` (session recorder + summary math: avg FPS = frames/time, 1%/0.1% low = 1000/p99/p99.9 frametime, stutter > 2.5× median), `hotkeys.ts` (global shortcuts registered by the main window), `criticalAlerts.ts`, `updater.ts`.
- `panel/visibility.ts` — the hidden panel renders nothing (WebView2 isn't told about Tauri hide). Rust emits `panel-shown` whenever it shows the window; rely on that, not only focus events.
- Browser mode (`isTauri` false) uses localStorage + demo telemetry; real data only arrives through Rust events.

## Security constraints (app always runs elevated)

- Never let the webview pass arbitrary filesystem paths to Rust for writing; e.g. CSV export opens the save dialog in Rust (`export_csv`). Session IDs are validated (`sessions.rs::check_id`).
- Spawn Windows PowerShell with `PSModulePath` removed (inherited PowerShell 7 module paths break 5.1 modules, e.g. on GitHub Actions).
- Call system tools by absolute System32 path (`autostart::system32()`), never via PATH. Don't write files to user-writable temp dirs and then execute/consume them with admin rights (the scheduled task XML is passed via PowerShell `-EncodedCommand`, PawnIO setup lives in the Program Files install dir and is Authenticode-checked for signer `CN=namazso.eu, O=namazso`).
- Keep the strict CSP in `tauri.conf.json` and per-window capabilities (`src-tauri/capabilities/`: `default.json` = main, `overlay.json` = minimal overlay permissions, `shortcuts.json` = plugins for main). New Tauri commands/plugins need the matching capability entries.

## Packaging / install specifics

- NSIS installer, `perMachine` (Program Files). `src-tauri/windows/hooks.nsh`: removes old per-user/HKLM installs of the former name "Custom Performance Overlay", silently installs bundled PawnIO (GPL-2.0, needed for CPU temp) if its service is missing and starts it, deletes the autostart task on uninstall (PawnIO is left installed).
- Autostart is a Task Scheduler task named `showFPS` ("highest privileges", `--autostart` arg → panel hidden); the old task name is migrated on first run.
- Identifier `io.github.aknlevt-coder.showfps`; config dir is migrated from the old `com.example.customperformanceoverlay` (`migrate_config_dir`). Logs: `%LOCALAPPDATA%\io.github.aknlevt-coder.showfps\logs\showFPS.log` (tauri-plugin-log; ask for this file when debugging user reports).
- Updater: GitHub Releases `latest.json` at `aknlevt-coder/showFPS`, minisign-verified with the pubkey in `tauri.conf.json`. Code signing is optional via `scripts/sign.mjs` (env `CPO_SIGN_PFX`… or Azure Trusted Signing); without a cert it signs nothing.
- Version source of truth is `package.json` (tauri.conf reads it; UI gets `__APP_VERSION__`).

## Docs

- `docs/GELISTIRME.md` — detailed developer notes (measurement methods, known risks, packaging, update, security).
- `docs/TEST-REHBERI.md` — manual test steps per feature/version; add a section when shipping user-visible changes.
- `CHANGELOG.md` — add a `## <version>` entry before `npm run release`.
