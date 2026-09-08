# `@octanejs/syntax-highlighter`

The Octane binding for `react-syntax-highlighter@16.1.1`. It preserves the
default, Light, Prism, async, language, style, renderer, and deep-import
surfaces without adding React to the runtime graph.

## Installation

```sh
npm install @octanejs/syntax-highlighter
pnpm add @octanejs/syntax-highlighter
```

```tsrx
import { Prism } from '@octanejs/syntax-highlighter';
import vscDarkPlus from '@octanejs/syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';

export function CodeSample() @{
	<Prism
		language="typescript"
		style={vscDarkPlus}
		showLineNumbers
		children={'const answer: number = 42;'}
	/>
}
```

Existing imports can be rewritten package-for-package:

```diff
- import SyntaxHighlighter from 'react-syntax-highlighter';
- import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
+ import SyntaxHighlighter from '@octanejs/syntax-highlighter';
+ import javascript from '@octanejs/syntax-highlighter/dist/esm/languages/hljs/javascript';
```

The complete generated export map includes extensionless and `.js` ESM/CJS
paths for the pinned release. `PreTag` and `CodeTag` accept native tag names or
Octane function components. React class components need a function adapter.

In `.tsrx`, pass source through the explicit `children` prop. Nested component
children compile to a renderer-owned block function, which an API that inspects
source text cannot unwrap:

```diff
- <SyntaxHighlighter>{source}</SyntaxHighlighter>
+ <SyntaxHighlighter children={source} />
```

See [`UPSTREAM.md`](UPSTREAM.md) for immutable provenance. The fail-closed
parity audit runs all 19 upstream suites and 51 test identities, 40 snapshots,
paired type contracts, SSR/hydration, a React differential, and real Chromium
and Firefox rendering.
