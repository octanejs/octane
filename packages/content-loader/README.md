# @octanejs/content-loader

Octane binding for
[`react-content-loader@7.1.2`](https://github.com/danilowoz/react-content-loader).

## Installation

```sh
npm install @octanejs/content-loader
pnpm add @octanejs/content-loader
```

```tsrx
import ContentLoader, { Code } from '@octanejs/content-loader';

export function LoadingArticle() @{
	<ContentLoader width={400} height={120} viewBox="0 0 400 120">
		<rect x="0" y="0" width="320" height="18" rx="3" />
		<rect x="0" y="34" width="400" height="12" rx="3" />
	</ContentLoader>
}

export function LoadingCode() @{
	<Code />
}
```

The default export and the `Facebook`, `Instagram`, `Code`, `List`, and
`BulletList` presets target web SVG. The upstream `./native` entry is not
available because Octane has no React Native renderer.

See [UPSTREAM.md](./UPSTREAM.md) for the pin and test disposition.
