# @octanejs/electron

## 0.0.4

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26

## 0.0.3

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25

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
