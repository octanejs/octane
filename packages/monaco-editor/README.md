# @octanejs/monaco-editor

Monaco Editor components for Octane. This binding reuses `monaco-editor` and
`@monaco-editor/loader` unchanged and ports the `@monaco-editor/react@4.7.0`
adapter layer to compiled Octane components.

```bash
pnpm add @octanejs/monaco-editor monaco-editor
```

```tsrx
import Editor, { loader } from '@octanejs/monaco-editor';
import * as monaco from 'monaco-editor';

loader.config({ monaco });

export function CodeEditor(props: { value: string; onChange(value: string): void }) @{
	<Editor
		height="400px"
		language="typescript"
		value={props.value}
		onChange={(value) => props.onChange(value ?? '')}
	/>
}
```

The root entry exports `Editor` (also the default export), `DiffEditor`,
`useMonaco`, `loader`, and the corresponding public Monaco-backed prop and
callback types. Models created by a component are disposed on unmount unless
the matching `keepCurrent*Model` option preserves the active model.
