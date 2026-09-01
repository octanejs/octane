# @octanejs/markdown

Octane bindings for [`react-markdown@10.1.0`](https://github.com/remarkjs/react-markdown). The default export and the `MarkdownAsync`, `MarkdownHooks`, and `defaultUrlTransform` named exports preserve the upstream processing and option contracts while producing Octane output.

## Installation

```sh
npm install @octanejs/markdown
pnpm add @octanejs/markdown
```

```tsrx
import Markdown from '@octanejs/markdown';
import remarkGfm from 'remark-gfm';

export function Article() {
	return (
		<Markdown
			remarkPlugins={[remarkGfm]}
			components={{
				strong({ children, node: _node, ...props }) {
					return <strong class="highlight" {...props}>{children}</strong>;
				},
			}}
		>
			{'# Hello\n\nThis is **Octane**.'}
		</Markdown>
	);
}
```

Migrate by replacing the `react-markdown` dependency and import root with `@octanejs/markdown`, then apply the ordinary React-to-Octane syntax and type conversion. Plugin values and tuples, component keys and callback props, filtering options, URL transforms, and the sync/async/hooks API shapes remain unchanged.

Author `Markdown` in React-style value position (`return <Markdown>{markdown}</Markdown>`) so its static or expression child remains an inspectable Markdown value. Template-position children compile to an opaque render block and are rejected rather than invoked without their runtime scope. In a template body, pass the source explicitly with `<Markdown children={markdown} />`.

## Security

Raw HTML is rendered as text by default. Adding `rehype-raw` parses raw HTML but does not sanitize it. Unified plugins and component mappings execute as trusted code, and a custom URL transform can broaden the protocols accepted by the default transform. When Markdown is untrusted, add a sanitizer explicitly at the correct point in the rehype pipeline and audit any plugins, components, and URL transform used with it.

See [UPSTREAM.md](./UPSTREAM.md) for the pinned source, artifact, test, and license provenance.
