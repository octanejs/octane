# @octanejs/pdf

Octane binding for the public `react-pdf@10.4.1` root contract.

## Installation

```sh
npm install @octanejs/pdf
pnpm add @octanejs/pdf
```

```tsx
import { Document, Page, pdfjs } from '@octanejs/pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function Preview({ file }: { file: string }) {
  return <Document file={file}>
    <Page pageNumber={1} />
  </Document>;
}
```

The binding preserves `Document`, `Page`, `Thumbnail`, `Outline`, the three
context hooks, `PasswordResponses`, `pdfjs`, and the published root types. It
uses Octane refs-as-props and native DOM events; no React renderer is loaded by
the installed package.

## Styles

Import the same documented layer styles under the Octane package name:

```ts
import '@octanejs/pdf/dist/Page/AnnotationLayer.css';
import '@octanejs/pdf/dist/Page/TextLayer.css';
```

The permissive upstream `./*` export also exposes React implementation and
source files. Those files are pinned parity evidence, not supported Octane
entry points. Migrate root imports and the two documented CSS paths; do not
remap direct imports from `react-pdf/src` or undocumented `react-pdf/dist`
modules.

## Server rendering

The package resolves PDF.js's legacy build on the server and its modern build
in browsers. Server rendering emits deterministic loading, no-data, and error
shells without starting a worker or touching canvas. Hydration adopts those
shells before client-side PDF loading begins.

## Upstream

- Package: `react-pdf@10.4.1`
- Tag: `v10.4.1`
- Commit: `5338e7a24c7ad17d1028146cf8a025a75e0abe79`
- License: MIT; the layer styles retain their PDF.js Apache-2.0 notices

See `upstream-public-surface.json` for the pinned export and wildcard policy.
