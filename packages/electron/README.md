# @octanejs/electron

Octane bindings for [Electron](https://www.electronjs.org) desktop apps.

Electron is process-split. React apps do not import `electron` from UI code under
contextIsolation; they use main + preload + a bridged API. This package mirrors
that layout for Octane:

| Import | Process | Role |
| --- | --- | --- |
| `@octanejs/electron/main` | main | Register default `ipcMain` handlers |
| `@octanejs/electron/main/native` | main | Re-exports `Menu`, `Tray`, `session`, `protocol`, `BrowserWindow`, … |
| `@octanejs/electron/preload` | preload | `contextBridge` expose of Electron IPC + desktop helpers |
| `@octanejs/electron` | renderer | Octane hooks and promise helpers over that bridge |

```bash
npm install @octanejs/electron electron octane
pnpm add @octanejs/electron electron octane
```

## Wire-up

```ts
// main
import { BrowserWindow, app, clipboard, dialog, ipcMain, nativeTheme, screen, shell } from 'electron';
import {
	registerOctaneElectronMain,
	trackOctaneElectronWindow,
} from '@octanejs/electron/main';

registerOctaneElectronMain({
	ipcMain,
	app,
	dialog,
	shell,
	clipboard,
	nativeTheme,
	screen,
	getWindow: (event) => BrowserWindow.fromWebContents(event.sender as any) ?? undefined,
	getAllWebContents: () => require('electron').webContents.getAllWebContents(),
});

const win = new BrowserWindow({ /* preload … */ });
trackOctaneElectronWindow(win);
```

```ts
// preload
import { contextBridge, ipcRenderer } from 'electron';
import { exposeOctaneElectron } from '@octanejs/electron/preload';

exposeOctaneElectron({ ipcRenderer, contextBridge });
```

```ts
// renderer (.tsrx)
import { useInvoke, useNativeTheme, shell } from '@octanejs/electron';
```

A custom `apiKey` must be configured on both sides (preload and renderer are
separate realms):

```ts
// preload
exposeOctaneElectron({ ipcRenderer, contextBridge, apiKey: 'myElectronAPI' });
```

```ts
// renderer
import { setElectronBridgeKey } from '@octanejs/electron';
setElectronBridgeKey('myElectronAPI');
```

## Hooks

### `useInvoke(channel, args?, options?)`

Runs `ipcRenderer.invoke` through the bridge and suspends until it resolves.

```tsx
function Projects() @{
	const projects = useInvoke<Project[]>('list_projects', { archived: false });
	<ul>
		@for (const project of projects; key project.id) {
			<li>{project.name as string}</li>
		}
	</ul>
}
```

### `useInvokeState(channel, args?, options?)`

Non-suspending `{ status, data, error, refetch }`. No stale-while-revalidate;
use `@octanejs/tanstack-query` when you need a query cache.

### `useIpcEvent(channel, handler, options?)`

Subscribes for the call-site lifetime. Handlers receive payload args (Electron's
event object is stripped in preload). `handler` / `onError` are ref-stable;
only `channel` and `enabled` resubscribe.

### `useNativeTheme()` / `useWindowState()`

Reactive reads over the default bridge push channels.

## Desktop helpers

`app`, `windowControls`, `dialog`, `shell`, `clipboard`, and `screen` are
promise helpers over the same bridge (no hooks). Main-only constructors
(`Menu`, `Tray`, `session`, `protocol`, `BrowserWindow`, …) are available from
`@octanejs/electron/main/native` in the main process — see below.

## Off-host behavior

Everything is guarded on the configured bridge global (default
`window.__OCTANE_ELECTRON__`):

| | no Electron bridge |
| --- | --- |
| `useInvoke` | rejects with `ElectronUnavailableError` |
| `useInvokeState` | `status: 'error'` with `ElectronUnavailableError` |
| `useIpcEvent` | throws `ElectronUnavailableError` (or `onError`) |
| theme / window hooks | SSR-safe defaults until a host exists |

Tests install a mock with `installElectronBridge` from `@octanejs/electron`.

## Not covered in the renderer (intentional)

`Menu`, `Tray`, `session`, `protocol`, `BrowserWindow` construction, and related
main-only APIs are not bridged into Octane UI code — the same constraint a React
Electron app has under contextIsolation. Import them in the main process:

```ts
import { Menu, Tray, session, protocol, BrowserWindow } from '@octanejs/electron/main/native';
```

Or import the same symbols from `electron` / `electron/main`. See `UPSTREAM.md`.
