# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Desktop Pomodoro timer built with Electron + vanilla HTML/CSS/JS (no framework, no bundler). A single fixed 400×700 window. Standard features: work/short-break/long-break cycles, auto-cycling (4 → long break), Web-Audio chime + native notifications, customizable durations, task list, and a 4-theme switcher.

## Commands

- **Install:** `npm install`
- **Run:** `npm start` (runs `electron .`)
- **No test suite, linter, or build step is configured.** Don't assume `npm test` / `npm run lint` exist.
- **Package a Windows .exe (optional):** `npx electron-builder --win` (electron-builder is not installed by default)

### Environment note — Electron binary (China network)
`npm install` installs the wrapper but the Electron **binary** postinstall fails with `TypeError: fetch failed`. Re-download via the mirror before the first run:
```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
```
Setting that env var during `npm install` avoids the failed step entirely.

## Architecture

Two-process Electron app with a strict security boundary:

- **Main process** (`main.js`, Node): owns all disk + native access. Config is one JSON file at `app.getPath('userData')/pomodoro-config.json`, returned by the `config:load` handler and written **async** (`fs.promises.writeFile`) by `config:save` so saves never block the main thread. Native notifications go through the `notification:show` handler.
- **Preload** (`preload.js`): the *only* bridge. `contextBridge` exposes a whitelisted `window.api` (`loadConfig`, `saveConfig`, `showNotification`) plus `window.DEFAULTS`. `contextIsolation: true`, `nodeIntegration: false` — the renderer never touches Node.
- **Renderer** (`src/renderer.js`, browser): all app logic. Markup in `src/index.html`, styles in `src/styles.css`.

Key invariants and data flow (these span multiple files — read before changing):

- **Defaults = single source of truth.** `defaults.js` is a frozen object `require`d by `main.js` *and* exposed to the renderer via preload as `window.DEFAULTS`. Do not redeclare the settings schema in the renderer.
- **Phases are data-driven.** `PHASE_META` (renderer) describes each phase with `label`, `minKey` (which setting holds its minutes), and `kind` (`'focus'` / `'break'`). Counters, task crediting, long-break cycle, and auto-start selection all branch on `kind`, and `msForPhase` reads `minKey`. Adding a phase should be a single-table edit.
- **Theming.** `THEMES` (renderer) is the source for both base UI CSS variables (`--bg`, `--card`, `--text`, `--border`, …) and the three per-phase accent colors. `applyTheme(id)` sets base vars; `setPhaseColors(phase)` sets `--accent` + the ring's `stroke` for the current phase. **CSS must reference variables, not hardcoded colors**, or a theme won't restyle that element.
- **Timer is timestamp-based, not tick-counting.** On start, `endTime = Date.now() + remainingMs`; each 250ms tick recomputes `remainingMs = endTime - Date.now()`. `renderRing` sets `stroke-dasharray` once (constant) and only updates `stroke-dashoffset` per tick.
- **Persistence cadence.** The renderer calls `persist()` (full config over IPC) on every state change and on a 5s throttle while running. The saved `runtime` block is rebuilt from `RUNTIME_KEYS`; `load()` restores `phase`/`remainingMs`/`completedInRound`/`currentTaskId` but always starts `idle` — it never resumes a running timer across restart.
- **Tasks use event delegation.** One click listener on the list dispatches on `data-action` (`toggle` / `set` / `delete`); rows carry `data-id`. Do not attach per-row listeners in `renderTasks`.

## Config file shape

`pomodoro-config.json` = `{ settings, tasks, stats, runtime }`. `settings` includes `theme` (a key into `THEMES`). Both `main.js loadConfig` and the renderer's `load()` deep-merge `defaults`, so adding a setting only requires editing `defaults.js` plus (if it needs UI binding) an input in `index.html` and a key in `NUMERIC_KEYS` / `CHECK_KEYS` in the renderer.
