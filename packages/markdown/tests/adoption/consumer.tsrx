// Frozen intended Octane conversion of the canonical consumer. U6 compiles and
// executes this file after the public package entry point exists.
import type { Components, Options } from '@octanejs/markdown';
import Markdown, { MarkdownAsync, MarkdownHooks, defaultUrlTransform } from '@octanejs/markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const components: Components = {
	code({ children, class: className, node: _node, ...props }) {
		return <code class={className} {...props}>{children}</code>;
	},
	strong({ children }) {
		return <b>{children}</b>;
	},
};

const options: Options = {
	components,
	remarkPlugins: [remarkGfm],
	rehypePlugins: [rehypeRaw],
	urlTransform: defaultUrlTransform,
};

export function SyncConsumer() {
	return <Markdown {...options}>{'# Hello'}</Markdown>;
}

export function AsyncConsumer() {
	return MarkdownAsync({ ...options, children: '# Awaited' });
}

export function HooksConsumer() @{
	<MarkdownHooks {...options} fallback={<span>{'Loading'}</span>}>{'# Client'}</MarkdownHooks>
}
