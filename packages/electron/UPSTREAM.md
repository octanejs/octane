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
| `webFrame` / `webUtils` | preload | Import from `electron` in preload when needed |
| `BrowserWindow` construction | main | Re-exported from `@octanejs/electron/main/native` — not bridged to the renderer |
| `Menu` / `MenuItem` / `Tray` | main | Re-exported from `@octanejs/electron/main/native` — intentional main-only (same as React Electron apps) |
| `session` / `protocol` / `net` | main | Re-exported from `@octanejs/electron/main/native` — intentional main-only |
| `Notification` / `globalShortcut` / `autoUpdater` | main | Re-exported from `@octanejs/electron/main/native` — intentional main-only |
| `utilityProcess` | utility | Out of scope for this binding |

## Not covered in the renderer (intentional)

Menu, Tray, session, protocol, and other main-only constructors are **not**
missing ports: under contextIsolation they cannot live in Octane UI code. Import
them from `@octanejs/electron/main/native` (or `electron` / `electron/main`) in
the main process, the same way a React Electron app does. Bridging them into the
renderer would invent an unsafe second API surface.

## Divergences

- Renderer never imports `electron`; secure React Electron apps do not either.
- Default bridge channel prefix is `octane:*` for built-in desktop helpers.
- Raw `invoke` / `on` can be allowlisted in preload for production apps.
- Hook call-site slots use Octane's compiler binding ABI (`hookSlots.manual`).
