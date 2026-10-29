# @octanejs/hot-toast

[react-hot-toast](https://react-hot-toast.com/) ported to the
[Octane](https://github.com/octanejs/octane) renderer. The package tracks the
published `react-hot-toast@2.6.1` API and behavior: the callable `toast` API
and its `success`, `error`, `loading`, `custom`, `promise`, `dismiss` and
`remove` variants, `Toaster`, `ToastBar`, `ToastIcon`, the icon components,
multiple toasters, pausing on hover, and the headless `useToaster` hook.

## Install

```bash
npm install @octanejs/hot-toast
pnpm add @octanejs/hot-toast
```

## Usage

Mount one toaster near the root of the application, then call `toast` from any
event handler or module:

```tsrx
import toast, { Toaster } from '@octanejs/hot-toast';

export function App() {
	return (
		<main>
			<button onClick={() => toast.success('Saved')}>Save</button>
			<Toaster position="top-right" />
		</main>
	);
}
```

`toast.promise` follows a promise through loading, success and error:

```ts
toast.promise(saveSettings(settings), {
	loading: 'Saving…',
	success: 'Settings saved',
	error: (error) => `Could not save: ${error.message}`,
});
```

Render your own toast UI with the `Toaster` render prop and `ToastBar`, or drop
the bundled UI entirely and build on the headless entry:

```ts
import { toast, useToaster } from '@octanejs/hot-toast/headless';
```

## Differences from react-hot-toast

- The `Toaster` pauses its timers on the native `mouseenter` and `mouseleave`
  events of its container. A real pointer behaves as in React. In tests, fire
  those events on the `[data-rht-toaster]` container rather than on a toast.
- The port never calls goober's `setup()`, so an application that also uses
  goober keeps its own pragma.
- The root and `/headless` entries share one toast store. Upstream bundles
  them separately, each with its own store.
- Renderables, styles and refs use Octane's types (`ElementDescriptor`,
  `CSSProperties`, refs as props).

Class names and the injected stylesheet are the ones `react-hot-toast@2.6.1`
ships, so CSS that targets them keeps working.

## Server rendering

`Toaster` renders on the server without browser globals, and toasts already in
the store render with it. goober collects the generated rules on the server;
inline them with `extractCss()` from `goober`. On the client, `hydrateRoot`
adopts the server markup.

## Provenance

See [`UPSTREAM.md`](./UPSTREAM.md). Ported code keeps the upstream MIT license
in `LICENSE.upstream`.
