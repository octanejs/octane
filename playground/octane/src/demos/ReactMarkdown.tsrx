import Markdown from '@octanejs/markdown';

function markCallouts() {
	return (tree: {
		children?: Array<{ type?: string; tagName?: string; properties?: Record<string, unknown> }>;
	}) => {
		for (const node of tree.children ?? []) {
			if (node.type === 'element' && node.tagName === 'blockquote') {
				node.properties = { ...node.properties, class: 'panel' };
			}
		}
	};
}

const source = `# Markdown on Octane

Render ordinary Markdown with the same plugins and component mappings used by react-markdown.

> This blockquote is marked by a rehype plugin.

Visit [Octane](https://octanejs.com).`;

export function ReactMarkdownDemo() @{
	<div>
		<h2 class="demo-title">{'react-markdown on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'A source-compatible Markdown pipeline with controlled plugins and component mappings.'}</p>
		<Markdown
			rehypePlugins={[markCallouts]}
			components={{
				a({ children, node: _node, ...props }) {
					return <a {...props} rel="noreferrer">{children}</a>;
				},
			}}
		>{source}</Markdown>
	</div>
}
