// Frozen from the public API and examples documented by react-markdown@10.1.0.
// Source boundary: upstream-artifact/package/readme.md (SHA-256 in provenance audit).
import type { Components, Options } from 'react-markdown';
import Markdown, { MarkdownAsync, MarkdownHooks, defaultUrlTransform } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const components: Components = {
	code({ children, className, node: _node, ...props }) {
		return (
			<code className={className} {...props}>
				{children}
			</code>
		);
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

export const SyncExample = () => <Markdown {...options}>{'# Hello'}</Markdown>;
export const AsyncExample = () => <MarkdownAsync {...options}>{'# Awaited'}</MarkdownAsync>;
export const HooksExample = () => (
	<MarkdownHooks {...options} fallback={<span>{'Loading'}</span>}>
		{'# Client'}
	</MarkdownHooks>
);
