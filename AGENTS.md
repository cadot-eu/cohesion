# Cohesion — Agent Context

## Project Overview

A Notion Desktop client for Linux using Electron. Tabbed browsing of Notion pages in a single window. Desktop notifications for page updates and inbox activity.

## Stack

- **Electron** 42.5.0 (Node 22+ required — see `.nvmrc`)
- **TypeScript** 6.0.3
- **electron-builder** 26.15.3
- **electron-store** 11.0.2
- No UI framework — vanilla HTML/CSS/JS for tab bar

## Architecture

| File | Role |
|---|---|
| `src/index.ts` | Entry point. Handles single-instance lock, protocol handler (`notion://`), creates `Cohesion` |
| `src/cohesion.ts` | Main app class. Window creation, tab management, IPC handlers, module orchestration |
| `src/tabs.html` | Tab bar UI — rendered as a `WebContentsView` at the top of the window |
| `src/tabsPreload.ts` | Preload for tab bar — exposes `tabsAPI` via `contextBridge` |
| `src/notionPreload.ts` | Preload for notion content pages — notification click override, chrome version bug detection, **DOM change watcher** |
| `src/settings.ts` | electron-store wrapper for persistent settings (`tray`, `spellcheck`, `menu`, `notifications`) |
| `src/util.ts` | `findIcon()` icon resolution, `getUnreadMessages()` title parsing |
| `src/fix/` | Chrome version bug fix, Electron 21 fix |
| `src/module/` | All feature modules (see below) |
| `src/js/test.js` | Placeholder script injected into every Notion page after load |

### Modules

| Module | File | Role |
|---|---|---|
| **Module** | `module.ts` | Abstract base — hooks `beforeLoad()`, `onLoad()`, `onQuit()` |
| **ModuleManager** | `module-manager.ts` | Iterates modules through lifecycle hooks |
| **HotkeyModule** | `hotkey-module.ts` | Global keyboard shortcuts (Ctrl+W/Q/R, F5, zoom) |
| **MenuModule** | `menu-module.ts` | Application menu (File, Edit, View, Help) — spellcheck toggle, notification toggle, always-show-menu, about, licenses |
| **SpellCheckModule** | `spellcheck-module.ts` | Runtime spellcheck toggle + multi-language selection, persisted via `Settings("spellcheck")` |
| **TrayModule** | `tray-module.ts` | System tray icon — unread count badge, greyscale/color toggle, minimize-to-tray on close |
| **WindowSettingsModule** | `window-settings-module.ts` | Persist/restore window position and size |
| **ChromeVersionFix** | `fix/chrome-version-fix.ts` | Workaround for Notion's unsupported Chrome version page |
| **Electron21Fix** | `fix/electron-21-fix.ts` | Fix for Electron 21 compatibility |
| **WhatsNewModule** | `whatsnew-module.ts` | "What's New" dialog |
| **NotificationModule** | `notification-module.ts` | Desktop notifications for page updates and inbox activity |

## Notification System

Two independent detection mechanisms, both sending native Linux desktop notifications via Electron `Notification` API.

### 1. Inbox Notifications (title-based)

Watches the Notion page `<title>` for changes matching the `(N)` pattern (e.g., `(3) Notion`).

- **Flow**: `page-title-updated` → `onTitleUpdateCallbacks` → `NotificationModule.fireNotification(count)`
- **Message**: `"You have X unread notification(s) in Notion"`
- **Toggle**: View → Desktop Notifications (persisted in `Settings("notifications").enabled`)
- **Test**: Help → Test Desktop Notification (fires a fake `count=3` notification)

### 2. Page Update Detection (DOM-based)

Monitors the "Dernière modification : …" / "Last edited : …" / "Last modified : …" text element in the Notion DOM.

**Implementation in `notionPreload.ts`**:
- Uses `TreeWalker` to find the text node matching `/^(Dernière modification|Last edited|Last modified|Dernière édition)\b/i`
- **Cross-session persistence**: stores last-seen text in `localStorage` key `cohesion-last-modified`
- On page load: compares current DOM value with localStorage → fires if different
- **In-session watch**: `MutationObserver` on the target element (characterData + childList + subtree)
- **Debounce**: 1-second debounce timer prevents duplicate notifications from React re-renders
- **In-memory cache**: `lastText` variable skips MutationObserver callbacks when text hasn't changed

**IPC flow**:
1. `notionPreload.ts` sends `ipcRenderer.send("notion-content-changed", newValue)`
2. `cohesion.ts` IPC handler calls `notificationModule.fireContentChanged(newValue)`
3. Notification body: `"Page mise à jour — Dernière modification : 8 juil."`

## IPC Handlers

| Channel | Direction | Purpose |
|---|---|---|
| `get-tabs` | renderer → main (handle) | Returns tab list with title/index/active |
| `switch-tab` | renderer → main | Switch to tab by index |
| `close-tab` | renderer → main | Close tab by index |
| `update-tabs` | main → renderer | Signal tab bar to re-render |
| `notification-click` | renderer → main | Notion Notification click → show window |
| `notion-content-changed` | renderer → main | DOM "Dernière modification" changed → fire desktop notification |
| `chrome-version-bug` | renderer → main | Notion unsupported version page detected |

## Key Design Decisions

- **Tab bar hidden when single tab** — `updateTabBarVisibility()` sets tabsView height to `0` when `tabs.length === 1`
- **Close button always visible** — every tab renders `×` unconditionally
- **Closing last tab opens replacement** — `closeTab` IPC handler creates a new default tab first before removing the last one
- **Dynamic user agent** — `USER_AGENT` uses `process.versions.chrome` (split to major version), never hardcoded
  - `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<major>.0.0.0 Safari/537.36`
- **IPC handlers registered before renderer ready** — handlers are set up in `Cohesion.init()` before any content loads
- **`rootDir: "src"` in tsconfig** — required by TS 6 to avoid emitting files outside root
- **`dist` script copies HTML** — `tsc && cp src/*.html dist/ && cp -r src/js dist/` since `tsc` only compiles `.ts` files
- **Spell check runtime toggle** — `webPreferences.spellcheck` always `true` at view creation; runtime enable/disable via `session.defaultSession.spellCheckerEnabled`. Persisted in `Settings("spellcheck").enabled`.
- **Multi-language spell check** — `SpellCheckModule` stores language array in `Settings("spellcheck").languages`. View > Spell Check Languages submenu lists all available languages from `session.defaultSession.availableSpellCheckerLanguages` as checkboxes. Toggling a language rebuilds the application menu.
- **`--disable-spellcheck`** CLI flag respected at startup (sets initial state to disabled) but does not prevent runtime re-enable via menu.
- **`onTitleUpdateCallbacks` array** — multiple modules can subscribe to title changes (TrayModule, NotificationModule). Previously a single callback, changed to `Array<(title, explicitSet) => void>`.
- **Notifications always fire** regardless of window focus state.
- **`contextIsolation: false`** on Notion content views — allows `notionPreload.ts` direct access to `ipcRenderer` and DOM.

## Build & Run

```bash
nvm use                    # uses Node 22 from .nvmrc
npm run dist               # compile TS, copy HTML + JS
npm start                  # dist + launch electron
npm run build:deb          # auto-increment patch version, dist, clean old .deb, electron-builder --linux deb
```

### Version Auto-Increment

`build:deb` runs `npm version patch --no-git-tag-version` before building. Patch version increments automatically (1.2.0 → 1.2.1 → …). No git tags created.

### .deb Build

```bash
npm run build:deb
```

Output: `build/cohesion_<version>_amd64.deb`

Linux config in `package.json` → `build.linux`:
- Target: `deb`
- Icon: `data/icons/hicolor/512x512/apps/io.github.brunofin.Cohesion.png`
- Category: `Office`
- Desktop entry with `notion://` MIME type handler

### Installed vs Dev Version

If a system version is installed via dpkg (`/usr/bin/cohesion`), kill it before running the dev version:
```bash
pkill -9 -f cohesion
npm start
```
The process name is `cohesion`, not `electron`.

## Menu Structure

```
File
  └ Quit (Ctrl+Q)

Edit
  ├ Undo / Redo
  ├ Cut / Copy / Paste
  └ Select All

View
  ├ Reload (Ctrl+R)
  ├ Force Reload (Ctrl+Shift+R)
  ├ Zoom In / Zoom Out / Reset Zoom
  ├ Spell Check (checkbox)
  ├ Spell Check Languages (submenu of available languages)
  ├ Desktop Notifications (checkbox)
  └ Always Show Menu Bar (checkbox)

Help
  ├ Test Desktop Notification
  ├ What's New
  ├ About Cohesion
  ├ Release Notes
  └ Open-Source Licenses
```

## Tray Icon Behavior

- **Normal**: `io.github.brunofin.Cohesion.png` (color or greyscale, toggled in tray menu)
- **Unread**: `io.github.brunofin.Cohesion-unread.png` when `getUnreadMessages(title) > 0`
- **Close button** minimizes to tray instead of quitting (except during explicit `app.quit()`)
- **Tooltip**: `"Cohesion"` or `"Cohesion - N unread notifications"`

## Flatpak Build

Located in `flatpak/flathub-manifest/`.

### Key Files

| File | Role |
|---|---|
| `io.github.brunofin.Cohesion.yml` | Flatpak manifest — uses `org.electronjs.Electron2.BaseApp` 25.08 |
| `generated-sources.json` | 582 npm + electron binary sources generated by `flatpak-node-generator` |

### Regenerating Sources

```bash
npm run flatpak:generate-sources
```

This runs `flatpak-node-generator npm package-lock.json` which:
1. Parses all npm dependencies
2. Adds electron binary zips (x86_64, arm64, armv7l) as `type: file` sources from GitHub
3. Adds SHASUMS256.txt as a source
4. Creates shell commands that symlink files into the `@electron/get` cache layout

### Building

```bash
npm run flatpak:build
```

### Critical: electronDist

The build command includes `-c.electronDist=../flatpak-node/cache/electron` to bypass `@electron/get` network download during the electron-builder packaging phase.

**Why this is needed**: `@electron/get` v5 always downloads `SHASUMS256.txt` fresh (cache bypassed) to validate the electron binary. In the offline Flatpak sandbox, this DNS lookup fails with `EAI_AGAIN`. Setting `electronDist` makes electron-builder extract the cached electron ZIP directly via `fs-extra`, avoiding `@electron/get` entirely.

### Electron Binary Cache Layout

`flatpak-node-generator` places cached files at `flatpak-node/cache/electron/`:
- `electron-v<version>-linux-<arch>.zip`
- `SHASUMS256.txt-<version>`
- `<sha256-of-url>/` (symlinks for `@electron/get` cache lookup, though they're unused with `electronDist`)

## Flatpak Build Gotchas

- **Node 22 required** — `org.freedesktop.Sdk.Extension.node22` SDK extension
- **`ELECTRON_SKIP_BINARY_DOWNLOAD`** not respected by `@electron/get` v5 — kept for legacy npm postinstall safety
- **`npm install --offline`** uses sources from `generated-sources.json`
- **`--dir` target** — builds unpacked directory, no installer tools needed (no fpm, AppImage, etc.)
- **electron-builder arch args** provided by `../flatpak-node/electron-builder-arch-args.sh` (generated by `flatpak-node-generator`)

## Dependencies

Only runtime dep is `electron-store` (persistent settings). No native addons — `@electron/rebuild` is a no-op.

## Git Remotes

- **origin**: `https://github.com/cadot-eu/cohesion.git` (fork)
- **upstream**: `https://github.com/brunofin/cohesion.git` (original)
