# @octanejs/virtua

Octane bindings for [Virtua](https://github.com/inokawa/virtua). The package
uses Virtua's framework-neutral core and has no React runtime dependency.

```bash
pnpm add @octanejs/virtua virtua octane
```

```tsrx
import { VList, type VListHandle } from '@octanejs/virtua';
import { useRef } from 'octane';

export function Messages({ messages }: { messages: string[] }) {
	const list = useRef<VListHandle | null>(null);

	return (
		<VList ref={list} data={messages} itemSize={40}>
			{(message, index) => <div key={index}>{message}</div>}
		</VList>
	);
}
```

The public surface matches Virtua 0.50.1: `VList`, `Virtualizer`,
`WindowVirtualizer`, `experimental_VGrid`, their handles, props, custom element
types, and Virtua core cache/scroll option types exposed through those APIs.

See [UPSTREAM.md](./UPSTREAM.md) for the exact upstream pin and test provenance.
