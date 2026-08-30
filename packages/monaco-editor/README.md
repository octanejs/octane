# `@octanejs/monaco-editor`

Octane bindings for [Monaco Editor](https://microsoft.github.io/monaco-editor/),
ported from [`@monaco-editor/react`](https://github.com/suren-atoyan/monaco-react)
`4.7.0` (commit `eb120e66`).

```bash
npm install @octanejs/monaco-editor monaco-editor octane
pnpm add @octanejs/monaco-editor monaco-editor octane
```

```tsrx
import Editor, { DiffEditor, useMonaco, loader } from '@octanejs/monaco-editor';

function App() @{
	<Editor
		height="400px"
		defaultLanguage="typescript"
		defaultValue="// hello"
		onChange={(value) => console.log(value)}
	/>
}
```

## Compatibility

| Upstream | Octane |
| --- | --- |
| `loading?: ReactNode` | `loading?: OctaneNode` |
| Internal `_ref` on MonacoContainer | Octane `ref` on the host div (internal only) |
| React `memo` | Octane `memo` |
| Library `onChange` | **Same name** (not DOM `onInput`) |
| Blind model dispose on unmount | **Ownership-aware dispose** — only models created by the binding are disposed; shared or external models are left intact |

See `UPSTREAM.md` for the full export crosswalk and `status.json` for the
binding scorecard.

## Loader and workers

The package re-exports `@monaco-editor/loader`. Workers and CSS stay in the
consuming app.

Pin the same `monaco-editor` minor your peer range resolves to (workspace
catalog / oracle: **`0.55.1`**).

### Default (recommended): npm `monaco-editor` + Vite workers

monaco-editor **0.55.1** exports `"./*": "./*"`, so worker imports use the
full `esm/vs/...` paths (unlike 0.56+, which maps shorthand subpaths).

```ts
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { loader } from '@octanejs/monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';

globalThis.MonacoEnvironment = {
	getWorker(_id, label) {
		switch (label) {
			case 'json':
				return new jsonWorker();
			case 'css':
			case 'scss':
			case 'less':
				return new cssWorker();
			case 'html':
			case 'handlebars':
			case 'razor':
				return new htmlWorker();
			case 'typescript':
			case 'javascript':
				return new tsWorker();
			default:
				return new editorWorker();
		}
	},
};

loader.config({ monaco });
```

Give the editor a non-zero height (default `height`/`width` are `100%`, and
`automaticLayout` is on).

### Alternate: CDN AMD build

Apps that intentionally avoid bundling Monaco can keep the loader CDN paths:

```ts
import { loader } from '@octanejs/monaco-editor';

loader.config({
	paths: {
		vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs',
	},
});
```

## SSR / Hydrate

Do not call `loader.init()` on the server. `Editor` / `DiffEditor` render a
loading shell during SSR; after `hydrateRoot`, effects create the editor. Prefer
client-only mount or Octane `lazy` when the page does not need the shell in HTML.

## Multi-model

`path` / `defaultPath` create models via `monaco.Uri.parse`. View state is kept
in a process-global `WeakMap` keyed by model identity when `saveViewState` is
true (upstream 4.7.0 uses a path-string `Map`). Models the binding creates are
tracked for ownership-aware disposal on unmount.

## Example

Working consumer recipe: [`examples/monaco-playground`](../../examples/monaco-playground).
