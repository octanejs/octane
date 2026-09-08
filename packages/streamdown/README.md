# @octanejs/streamdown

Octane bindings for [Streamdown](https://streamdown.ai), the streaming Markdown
renderer for AI applications.

## Installation

```sh
npm install @octanejs/streamdown
pnpm add @octanejs/streamdown
```

```tsrx
import { Streamdown } from '@octanejs/streamdown';
import { code } from '@octanejs/streamdown/code';
import { math } from '@octanejs/streamdown/math';

export function Message({ content }: { content: string }) {
  return (
    <Streamdown plugins={{ code, math }} isAnimating>
      {content}
    </Streamdown>
  );
}
```

Import the package styles and any plugin-specific styles from the application
entry point:

```ts
import '@octanejs/streamdown/styles.css';
import 'katex/dist/katex.min.css';
```

The root entry mirrors `streamdown@2.5.0`. The `./code`, `./math`,
`./mermaid`, and `./cjk` entries mirror the corresponding official Streamdown
plugin packages without a React runtime dependency.

The package ships precompiled client and server modules. Consumers do not compile
the binding's `.tsrx` source. When developing against a local checkout, build the
package before linking it:

```sh
pnpm --dir packages/streamdown build
pnpm --dir /path/to/app add @octanejs/streamdown@link:/path/to/octane/packages/streamdown
```
