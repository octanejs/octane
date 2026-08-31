# @octanejs/portabletext

Octane renderer for [Portable Text](https://www.portabletext.org/), compatible with the
runtime API of `@portabletext/react@8.0.1`.

```sh
npm install @octanejs/portabletext
pnpm add @octanejs/portabletext
```

```tsrx
import {PortableText} from '@octanejs/portabletext'

export function Article(props: {body: PortableTextBlock[]}) @{
  <article><PortableText value={props.body} /></article>
}
```

The package reuses `@portabletext/toolkit` and `@portabletext/types` unchanged. It
supports default block, list, mark and hard-break rendering; custom component maps;
missing-component handlers; list nesting modes; `toPlainText`; client rendering; and SSR.

Component callbacks return `OctaneNode` and refs/events follow Octane semantics. The
upstream `PortableTextReactComponents` and `ReactPortableTextList` type names remain as
migration aliases; prefer `PortableTextOctaneComponents` and `OctanePortableTextList` in
new code.
