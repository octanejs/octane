// Octane transcription of `@tanstack/markdown/react` (dist/react.js, v0.0.6).
// That module hard-imports `createElement`/`Fragment` from 'react', so it is the
// one react-locked piece of the otherwise framework-agnostic markdown pipeline.
// This file is a line-for-line port onto octane's createElement/Fragment —
// keep it verbatim-shaped so upstream diffs stay reviewable.
import { Fragment, createElement } from 'octane';
import { parseMarkdown } from '@tanstack/markdown/parser';
import type { BlockNode, InlineNode, MarkdownInput, RenderOptions } from '@tanstack/markdown';

type ComponentMap = Partial<Record<string, string | ((props: any) => any)>>;

export interface MarkdownOctaneOptions extends RenderOptions {
	components?: ComponentMap;
}

export interface MarkdownProps extends MarkdownOctaneOptions {
	children: MarkdownInput;
}

export function Markdown({ children, ...options }: MarkdownProps) {
	return createElement(Fragment, null, renderMarkdown(children, options));
}

export function renderMarkdown(input: MarkdownInput, options: MarkdownOctaneOptions = {}) {
	const document = typeof input === 'string' ? parseMarkdown(input, options) : input;
	return document.children.map((node, index) => renderBlock(node, options, `b:${index}`));
}

export function renderBlock(node: BlockNode, options: MarkdownOctaneOptions = {}, key?: string) {
	switch (node.type) {
		case 'heading':
			return h(
				options,
				`h${node.depth}`,
				{
					key,
					...(node.id ? { id: node.id } : {}),
					...(node.framework ? { 'data-framework': node.framework } : {}),
				},
				renderInlines(node.children, options),
				renderHeadingAnchor(node.id, options),
			);
		case 'paragraph':
			return h(options, 'p', { key }, renderInlines(node.children, options));
		case 'code':
			return renderCodeBlock(node, options, key);
		case 'list': {
			const tag = node.ordered ? 'ol' : 'ul';
			return h(
				options,
				tag,
				{
					key,
					...(node.ordered && node.start && node.start !== 1 ? { start: node.start } : {}),
				},
				node.items.map((item, index) =>
					h(
						options,
						'li',
						{ key: index },
						renderListItemChildren(item.children, item.checked, node.loose, options, `${index}`),
					),
				),
			);
		}
		case 'blockquote':
			return h(
				options,
				'blockquote',
				{ key },
				node.children.map((child, index) => renderBlock(child, options, `${key}:${index}`)),
			);
		case 'table':
			return h(
				options,
				'table',
				{ key },
				h(
					options,
					'thead',
					null,
					h(
						options,
						'tr',
						null,
						node.header.map((cell, index) =>
							renderTableCell('th', cell, node.align[index], options, index),
						),
					),
				),
				h(
					options,
					'tbody',
					null,
					node.rows.map((row, rowIndex) =>
						h(
							options,
							'tr',
							{ key: rowIndex },
							row.map((cell, index) =>
								renderTableCell('td', cell, node.align[index], options, index),
							),
						),
					),
				),
			);
		case 'footnotes':
			return renderFootnotes(node.items, options, key);
		case 'thematicBreak':
			return h(options, 'hr', { key });
		case 'html':
			return options.allowHtml
				? h(options, 'div', { key, dangerouslySetInnerHTML: { __html: node.value } })
				: h(options, 'p', { key }, node.value);
		case 'callout':
			return h(
				options,
				'div',
				{ key, className: `markdown-alert markdown-alert-${node.kind.toLowerCase()}` },
				h(options, 'p', { className: 'markdown-alert-title' }, node.title),
				h(
					options,
					'div',
					{ className: 'markdown-alert-content' },
					node.children.map((child, index) => renderBlock(child, options, `${key}:${index}`)),
				),
			);
		case 'component':
			return renderComponent(node, options, key);
	}
}

export function renderInline(node: InlineNode, options: MarkdownOctaneOptions = {}, key?: string) {
	switch (node.type) {
		case 'text':
			return node.value;
		case 'inlineCode':
			return h(options, 'code', { key }, node.value);
		case 'strong':
			return h(options, 'strong', { key }, renderInlines(node.children, options));
		case 'emphasis':
			return h(options, 'em', { key }, renderInlines(node.children, options));
		case 'strike':
			return h(options, 'del', { key }, renderInlines(node.children, options));
		case 'footnoteReference':
			return h(
				options,
				'sup',
				{ key },
				h(
					options,
					'a',
					{
						id: `user-content-fnref-${footnoteReferenceId(node)}`,
						'data-footnote-ref': '',
						'aria-describedby': 'footnote-label',
						href: `#user-content-fn-${node.id}`,
					},
					node.number,
				),
			);
		case 'link':
			return h(
				options,
				'a',
				{ key, href: node.href, ...(node.title ? { title: node.title } : {}) },
				renderInlines(node.children, options),
			);
		case 'image':
			return h(options, 'img', {
				key,
				src: node.src,
				alt: node.alt,
				...(node.title ? { title: node.title } : {}),
			});
		case 'break':
			return h(options, 'br', { key });
		case 'inlineHtml':
			return options.allowHtml
				? h(options, 'span', { key, dangerouslySetInnerHTML: { __html: node.value } })
				: node.value;
	}
}

function renderInlines(nodes: Array<InlineNode>, options: MarkdownOctaneOptions) {
	return nodes.map((node, index) => renderInline(node, options, `i:${index}`));
}

function renderCodeBlock(node: any, options: MarkdownOctaneOptions, key?: string) {
	const lang = node.lang ?? 'plaintext';
	const highlighter = options.highlighter;
	const codeProps: Record<string, unknown> = {
		className: `language-${lang}`,
	};
	const content = highlighter ? undefined : node.value;
	const highlighted = highlighter
		? {
				dangerouslySetInnerHTML: {
					__html: highlighter(node.value, lang, {
						...(node.highlightLines && { highlightLines: node.highlightLines }),
						...(options.codeLineNumbers !== undefined && {
							lineNumbers: options.codeLineNumbers,
						}),
					}),
				},
			}
		: undefined;
	const pre = h(
		options,
		'pre',
		{
			className: 'tm-code',
			'data-lang': lang,
			...(node.title ? { 'data-code-title': node.title } : {}),
			...(node.file ? { 'data-filename': node.file } : {}),
			...(node.framework ? { 'data-framework': node.framework } : {}),
		},
		h(options, 'code', { ...codeProps, ...highlighted }, content),
	);
	if (!node.title) return h(options, Fragment, { key }, pre);
	return h(
		options,
		'figure',
		{ key, className: 'tm-code-frame', 'data-lang': lang },
		h(options, 'figcaption', null, node.title),
		pre,
	);
}

function renderListItemChildren(
	children: Array<BlockNode>,
	checked: boolean | undefined,
	loose: boolean | undefined,
	options: MarkdownOctaneOptions,
	key: string,
) {
	const [first, ...rest] = children;
	const task =
		checked === undefined
			? []
			: [
					h(options, 'input', {
						key: `${key}:checkbox`,
						type: 'checkbox',
						disabled: true,
						checked,
						readOnly: true,
					}),
					' ',
				];
	if (first?.type === 'paragraph') {
		const content = [...task, ...renderInlines(first.children, options)];
		return [
			...(loose ? [h(options, 'p', { key: `${key}:paragraph` }, content)] : content),
			...rest.flatMap((child, childIndex) =>
				renderListChild(child, loose, options, `${key}:${childIndex + 1}`),
			),
		];
	}
	return [
		...task,
		...children.flatMap((child, childIndex) =>
			renderListChild(child, loose, options, `${key}:${childIndex}`),
		),
	];
}

function renderListChild(
	child: BlockNode,
	loose: boolean | undefined,
	options: MarkdownOctaneOptions,
	key: string,
) {
	return !loose && child.type === 'paragraph'
		? renderInlines(child.children, options)
		: [renderBlock(child, options, key)];
}

function renderTableCell(
	tag: 'th' | 'td',
	cell: any,
	align: string | null | undefined,
	options: MarkdownOctaneOptions,
	key: number,
) {
	return h(
		options,
		tag,
		{ key, ...(align ? { style: { textAlign: align } } : {}) },
		renderInlines(cell.children, options),
	);
}

function renderFootnotes(items: Array<any>, options: MarkdownOctaneOptions, key?: string) {
	return h(
		options,
		'section',
		{ key, 'data-footnotes': '', className: 'footnotes' },
		h(
			options,
			'h2',
			{ id: 'footnote-label', className: 'sr-only' },
			'Footnotes',
			renderHeadingAnchor('footnote-label', options),
		),
		h(
			options,
			'ol',
			null,
			items.map((item) =>
				h(
					options,
					'li',
					{ key: item.id, id: `user-content-fn-${item.id}` },
					renderFootnoteItem(item, options),
				),
			),
		),
	);
}

function renderFootnoteItem(item: any, options: MarkdownOctaneOptions) {
	const lastIndex = item.children.length - 1;
	const backrefs = renderFootnoteBackrefs(item, options);
	if (lastIndex < 0) return [h(options, 'p', { key: 'backref-wrapper' }, backrefs.slice(1))];
	return item.children.map((child: BlockNode, index: number) => {
		if (index === lastIndex && child.type === 'paragraph') {
			return h(options, 'p', { key: index }, renderInlines(child.children, options), backrefs);
		}
		return renderBlock(child, options, `${index}`);
	});
}

function renderFootnoteBackrefs(item: any, options: MarkdownOctaneOptions) {
	const result: Array<unknown> = [];
	for (let index = 1; index <= (item.referenceCount ?? 1); index++) {
		const referenceId = index === 1 ? item.id : `${item.id}-${index}`;
		const label = index === 1 ? `${item.number}` : `${item.number}-${index}`;
		result.push(
			' ',
			h(
				options,
				'a',
				{
					key: index,
					'data-footnote-backref': '',
					'aria-label': `Back to reference ${label}`,
					className: 'data-footnote-backref',
					href: `#user-content-fnref-${referenceId}`,
				},
				'↩',
			),
		);
	}
	return result;
}

function footnoteReferenceId(node: any) {
	return node.referenceIndex && node.referenceIndex > 1
		? `${node.id}-${node.referenceIndex}`
		: node.id;
}

function h(options: MarkdownOctaneOptions, tag: any, props: any, ...children: Array<any>) {
	const component = typeof tag === 'string' ? (options.components?.[tag] ?? tag) : tag;
	return createElement(component, props, ...children);
}

function renderComponent(node: any, options: MarkdownOctaneOptions, key?: string) {
	const tag = node.tagName ?? 'md-comment-component';
	const props: Record<string, unknown> = {
		...(node.properties ?? {}),
	};
	if (!node.tagName) {
		props['data-component'] = node.name;
		if (!props['data-attributes']) props['data-attributes'] = JSON.stringify(node.attributes);
	}
	return h(
		options,
		tag,
		{ key, ...props },
		node.children.map((child: BlockNode, index: number) =>
			renderBlock(child, options, `${key}:${index}`),
		),
	);
}

function renderHeadingAnchor(id: string | undefined, options: MarkdownOctaneOptions) {
	if (!id || !options.headingAnchors) return null;
	const anchorOptions = typeof options.headingAnchors === 'object' ? options.headingAnchors : {};
	return h(
		options,
		'a',
		{
			href: `#${id}`,
			'aria-hidden': anchorOptions.ariaHidden ?? true,
			className: anchorOptions.className ?? 'anchor-heading anchor-heading-link',
			tabIndex: anchorOptions.tabIndex ?? -1,
		},
		anchorOptions.content ?? '#',
	);
}
