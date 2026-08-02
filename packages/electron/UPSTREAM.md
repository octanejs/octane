# Upstream Electron audit

This binding targets Electron's process-split consumer layout, pinned for types
and local development at:

- package: `electron@43.2.0`
- advertised peer range: `electron >= 33.0.0`
- there is no React binding upstream; Electron is framework-agnostic

## Source boundary

Octane does not vendor Electron sources. The package:

- peers `electron` (same role `@octanejs/tauri` peers `@tauri-apps/api`)
- provides main/preload helpers that call Electron APIs
- provides renderer Octane hooks over a preload-exposed bridge
  (`window.__OCTANE_ELECTRON__`), because contextIsolation forbids importing
  `electron` in the renderer main world

## Module crosswalk

| Electron surface | Process | Disposition |
| --- | --- | --- |
| `ipcMain` | main | Bridged via `registerOctaneElectronMain` |
| `ipcRenderer` | preload | Bridged via `exposeOctaneElectron` → renderer `useInvoke` / `useInvokeState` / `useIpcEvent` |
| `contextBridge` | preload | Used by `./preload` |
| `app` (metadata / quit / paths) | main | Bridged (`app.*` helpers) |
| `BrowserWindow` controls | main | Bridged (`windowControls`, `useWindowState`, `trackOctaneElectronWindow`) |
| `dialog` | main | Bridged (`dialog.*`) |
| `shell` | main | Bridged (`shell.*`) |
| `clipboard` | main | Bridged (`clipboard.*`) |
| `nativeTheme` | main | Bridged (`useNativeTheme`) |
| `screen` | main | Bridged (`screen.*`) |
| `webFrame` / `webUtils` | preload/renderer | N/A in v1 — import from `electron` in preload when needed |
| `BrowserWindow` construction | main | N/A in renderer — import from `electron` in main |
| `Menu` / `MenuItem` / `Tray` | main | N/A in renderer — import from `electron` in main |
| `session` / `protocol` / `net` | main | N/A in renderer — import from `electron` in main |
| `Notification` / `globalShortcut` / `autoUpdater` | main | N/A in v1 — import from `electron` in main |
| `utilityProcess` | utility | N/A in v1 |

## Divergences

- Renderer never imports `electron`; secure React Electron apps do not either.
- Default bridge channel prefix is `octane:*` for built-in desktop helpers.
- Raw `invoke` / `on` can be allowlisted in preload for production apps.
- Hook call-site slots use Octane's compiler binding ABI (`hookSlots.manual`).
