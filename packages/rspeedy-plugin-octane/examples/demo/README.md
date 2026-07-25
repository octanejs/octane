# Octane on Lynx demo

## macOS native demo

On an arm64 or x64 Mac, run:

```bash
pnpm lynx:demo:native
```

This downloads the matching official Lynx 3.9.0 Explorer archive into
`~/Library/Caches/octane/lynx-explorer/3.9.0` when absent, verifies the pinned
SHA-256 digest and builds an isolated temporary application on every launch,
starts the demo on an available strict localhost port, and opens its verified
Lynx bundle in Explorer. The archive remains cached; the extraction is removed
after Explorer stops. Closing Explorer or pressing Ctrl-C shuts down the
development server.

Set `OCTANE_LYNX_EXPLORER_CACHE_DIR` to use another cache directory,
`OCTANE_LYNX_EXPLORER_EXECUTABLE` to use a particular executable, or
`OCTANE_LYNX_DEMO_PORT` to request a particular free port.

The committed Milestone 11 evidence records the official arm64 Explorer
visibly painting this demo at `Count 0` with both Octane thread programs active.
The native tap is not yet automated, and this macOS lane does not substitute
for Android or iOS acceptance.

## Device or separately installed Explorer

From the repository root, run:

```bash
pnpm lynx:demo
```

Rspeedy compiles the Octane application, serves `main.lynx.bundle`, and prints
its LAN URL and a QR code. Scan the QR code from a device running Lynx Explorer,
or paste the printed URL into the simulator's **Enter Card URL** field. The
device and development computer must be able to reach each other over the local
network.

This compatibility lane emits a Lynx target-SDK `3.9` bundle. Use the official
[Lynx 3.9.0 Explorer release](https://github.com/lynx-family/lynx/releases/tag/3.9.0)
or another 3.9-compatible host. The 3.8.1 Explorer linked by some quick-start
pages cannot execute a bundle that targets 3.9.

The screen is designed to exercise a dual-thread Octane first render and a
background-owned state update through the native `bindtap` event. It
intentionally uses no app-owned Native Modules or custom native elements,
because those require rebuilding Explorer or integrating Lynx into an
application host.

Useful non-interactive checks:

```bash
pnpm lynx:demo:typecheck
pnpm lynx:demo:build
pnpm lynx:demo:check
```
