---
'@octanejs/electron': patch
---

Add `@octanejs/electron`: process-split Electron bindings for Octane.

Mirrors the React Electron layout with `./main` (ipcMain handlers), `./preload`
(contextBridge expose), and a renderer entry of Octane hooks over Electron IPC
plus common desktop bridge helpers (app, window, dialog, shell, clipboard,
nativeTheme, screen).
