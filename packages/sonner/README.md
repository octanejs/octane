# @octanejs/sonner

[Sonner](https://sonner.emilkowal.ski/) ported to the
[Octane](https://github.com/octanejs/octane) renderer. The package tracks the
published `sonner@2.0.7` API and behavior: the callable `toast` API, `Toaster`,
`useSonner`, promise toasts, multiple toaster targets, actions, themes, rich
colors, stacking, timers, keyboard focus, and swipe dismissal.

## Install

```bash
pnpm add @octanejs/sonner
```

## Usage

Mount one toaster near the root of the application, then call `toast` from any
event handler or module:

```tsrx
import { Toaster, toast } from '@octanejs/sonner';

export function App() {
	return (
		<main>
			<button
				onClick={() =>
					toast.success('Saved', {
						description: 'Your changes are live.',
					})
				}
			>
				Save
			</button>
			<Toaster position="top-right" richColors />
		</main>
	);
}
```

The component imports its default stylesheet automatically. The stylesheet is
also available explicitly as `@octanejs/sonner/dist/styles.css`.

Promise and custom toasts keep Sonner's API:

```tsrx
toast.promise(saveProject(), {
	loading: 'Saving…',
	success: (project) => `${project.name} saved`,
	error: 'Could not save the project',
});

toast.custom((id) => (
	<div>
		Custom content
		<button onClick={() => toast.dismiss(id)}>Dismiss</button>
	</div>
));
```

## Octane adaptations

- Action and cancel handlers receive native `MouseEvent` objects because
  Octane uses native delegated events.
- `Toaster` accepts `ref` as a normal prop; Octane does not use `forwardRef`.
- The document-visibility initializer is guarded for server rendering.

Everything else intentionally follows published `sonner@2.0.7`, including its
DOM attributes and stylesheet. Differential tests run the same `.tsrx` fixture
through this package and real Sonner on React and compare the resulting DOM.

See the [port plan](../../docs/sonner-port-plan.md) and generated
[bindings status](../../docs/bindings-status.md) for scope and evidence.

Sonner is Copyright (c) Emil Kowalski and contributors and distributed under
the MIT license.
