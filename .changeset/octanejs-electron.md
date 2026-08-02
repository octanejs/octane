---
'@octanejs/electron': patch
---

Add `@octanejs/electron`: process-split Electron bindings for Octane.

Mirrors the React Electron layout with `./main` (ipcMain handlers),
`./main/native` (Menu/Tray/session/protocol and other main-only re-exports),
`./preload` (contextBridge expose), and a renderer entry of Octane hooks over
Electron IPC plus common desktop bridge helpers. Includes the `examples/electron`
consumer demo.
