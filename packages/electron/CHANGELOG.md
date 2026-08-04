# @octanejs/electron

## 0.0.2

### Patch Changes

- 1c6b690: Add `@octanejs/electron`: process-split Electron bindings for Octane.

  Mirrors the React Electron layout with `./main` (ipcMain handlers),
  `./main/native` (Menu/Tray/session/protocol and other main-only re-exports),
  `./preload` (contextBridge expose), and a renderer entry of Octane hooks over
  Electron IPC plus common desktop bridge helpers. Includes the `examples/electron`
  consumer demo.

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
