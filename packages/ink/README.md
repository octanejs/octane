# @octanejs/ink

Ink 7.1.1 ported to Octane's native universal renderer. It preserves Ink's
terminal renderer, Yoga layout, components, hooks, input handling, static
output, accessibility mode, and alternate-screen support without a React or
`react-reconciler` runtime dependency.

## Installation

```sh
npm install @octanejs/ink
pnpm add @octanejs/ink
```

```tsrx
/** @jsxImportSource @octanejs/ink/intrinsics */
import {Box, Text, render} from '@octanejs/ink';

function App({name}: {readonly name: string}) @{
	<Box borderStyle="round" paddingX={1}>
		<Text color="green">Hello{' ' as string}{name as string}</Text>
	</Box>
}

const app = render(App, {name: 'Octane'});
await app.waitUntilExit();
```

Ink components must be authored in `*.ink.tsrx` files and compiled with the
package renderer configuration:

```ts
import {inkRenderers} from '@octanejs/ink/config';

export default {
	octane: {renderers: inkRenderers},
};
```

Unlike upstream's element-taking API, Octane's programmatic roots take a
component and props separately: `render(App, props, options)`,
`instance.rerender(App, props)`, and `renderToString(App, props, options)`.
All component, hook, layout, terminal, and keyboard exports otherwise follow
the pinned Ink surface documented in [UPSTREAM.md](./UPSTREAM.md).

## Development

```sh
pnpm --filter @octanejs/ink typecheck
pnpm --filter @octanejs/ink test
```
