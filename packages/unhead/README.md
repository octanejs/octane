# @octanejs/unhead

[`@unhead/react@3.3.2`](https://github.com/unjs/unhead) bindings for
[Octane](https://github.com/octanejs/octane). This package ports the runtime
React binding over the unchanged `unhead@3.3.2` core, without React or React
types.

## Installation

```sh
npm install @octanejs/unhead
pnpm add @octanejs/unhead
```

```tsx
import { createElement } from 'octane';
import { useHead } from '@octanejs/unhead';
import { createHead, UnheadProvider } from '@octanejs/unhead/client';
import { Head } from '@octanejs/unhead';

const head = createHead();

export function App() @{
  <UnheadProvider head={head}>
    <Page />
  </UnheadProvider>
}

export function Page() @{
  useHead({ title: 'Home' });

  <Head
    children={createElement('meta', { name: 'description', content: 'Hello' })}
  />
}
```

## Entry points

| import | what you get |
| --- | --- |
| `@octanejs/unhead` | `useUnhead`, `useHead`, `useHeadSafe`, `useSeoMeta`, `useScript`, `Head`, `hookImports`, `defineLink`, `defineScript` |
| `@octanejs/unhead/client` | `createHead`, `UnheadProvider`, `renderDOMHead` |
| `@octanejs/unhead/server` | `UnheadProvider`, `createHead`, `renderSSRHead`, `prepareTemplate`, `transformHtmlTemplate` |
| `@octanejs/unhead/helmet` | `Helmet` |
| `@octanejs/unhead/utils` | re-export of `unhead/utils` |

## Head children

`Head` and `Helmet` inspect `createElement` host tags (`title`, `meta`, `link`,
`script`, `style`, …). TSRX block children are opaque compiler children-blocks,
so this does **not** work:

```tsx
<Head>
  <title>Page</title>
</Head>
```

Pass inspectable descriptors instead:

```tsx
<Head children={createElement('title', null, 'Page')} />
<Head
  children={[
    createElement('title', null, 'Page'),
    createElement('meta', { name: 'description', content: 'Hello' }),
  ]}
/>
```

## Not ported

- `@unhead/react/bundler`, `./vite`, `./stream/vite`, `./plugins` — compiler and bundler plugins
- `@unhead/react/stream/server` and `./stream/client` — React `renderToPipeableStream` integration

## Status

Current scope and verification evidence are tracked in
[`status.json`](./status.json). The pin and export crosswalk live in
[`UPSTREAM.md`](./UPSTREAM.md).
