import { unreachable } from 'devlop';
import type { Element, Nodes, Parents, Root } from 'hast';
import { urlAttributes } from 'html-url-attributes';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import type { PluggableList } from 'unified';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';
import { isChildrenBlock } from 'octane';
import type { Options } from './types';
import { defaultUrlTransform } from './url-transform';

const changelog = 'https://github.com/remarkjs/react-markdown/blob/main/changelog.md';
const emptyPlugins: PluggableList = [];
const emptyRemarkRehypeOptions = { allowDangerousHtml: true } as const;

const deprecations = [
	['astPlugins', 'remove-buggy-html-in-markdown-parser'],
	['allowDangerousHtml', 'remove-buggy-html-in-markdown-parser'],
	['allowNode', 'replace-allownode-allowedtypes-and-disallowedtypes', 'allowElement'],
	['allowedTypes', 'replace-allownode-allowedtypes-and-disallowedtypes', 'allowedElements'],
	['className', 'remove-classname'],
	['disallowedTypes', 'replace-allownode-allowedtypes-and-disallowedtypes', 'disallowedElements'],
	['escapeHtml', 'remove-buggy-html-in-markdown-parser'],
	['includeElementIndex', '#remove-includeelementindex'],
	['includeNodeIndex', 'change-includenodeindex-to-includeelementindex'],
	['linkTarget', 'remove-linktarget'],
	['plugins', 'change-plugins-to-remarkplugins', 'remarkPlugins'],
	['rawSourcePos', '#remove-rawsourcepos'],
	['renderers', 'change-renderers-to-components', 'components'],
	['source', 'change-source-to-children', 'children'],
	['sourcePos', '#remove-sourcepos'],
	['transformImageUri', '#add-urltransform', 'urlTransform'],
	['transformLinkUri', '#add-urltransform', 'urlTransform'],
] as const;

export function createProcessor(options: Readonly<Options>) {
	const remarkRehypeOptions = options.remarkRehypeOptions
		? { ...options.remarkRehypeOptions, ...emptyRemarkRehypeOptions }
		: emptyRemarkRehypeOptions;

	return unified()
		.use(remarkParse)
		.use(options.remarkPlugins || emptyPlugins)
		.use(remarkRehype, remarkRehypeOptions)
		.use(options.rehypePlugins || emptyPlugins);
}

export function createFile(options: Readonly<Options>): VFile {
	const rawChildren = options.children;
	if (isChildrenBlock(rawChildren)) {
		unreachable(
			'Unexpected compiled children block for `children` prop; use value-position JSX (`return <Markdown>…</Markdown>`) or pass an explicit `children` prop',
		);
	}
	const children = rawChildren || '';
	const file = new VFile();

	if (typeof children === 'string') file.value = children;
	else {
		unreachable(
			`Unexpected value \`${String(children)}\` for \`children\` prop, expected \`string\``,
		);
	}

	return file;
}

export function processSync(options: Readonly<Options>): Root {
	const processor = createProcessor(options);
	const file = createFile(options);
	return transformTree(processor.runSync(processor.parse(file), file), options);
}

export async function processAsync(options: Readonly<Options>): Promise<Root> {
	const processor = createProcessor(options);
	const file = createFile(options);
	return transformTree(await processor.run(processor.parse(file), file), options);
}

export function transformTree<T extends Nodes>(tree: T, options: Readonly<Options>): T {
	const allowedElements = options.allowedElements;
	const allowElement = options.allowElement;
	const disallowedElements = options.disallowedElements;
	const skipHtml = options.skipHtml;
	const unwrapDisallowed = options.unwrapDisallowed;
	const urlTransform = options.urlTransform || defaultUrlTransform;
	const optionRecord = options as Readonly<Record<string, unknown>>;

	for (const [from, id, to] of deprecations) {
		if (Object.hasOwn(optionRecord, from)) {
			unreachable(
				`Unexpected \`${from}\` prop, ${to ? `use \`${to}\` instead` : 'remove it'} (see <${changelog}#${id}> for more info)`,
			);
		}
	}

	if (allowedElements && disallowedElements) {
		unreachable(
			'Unexpected combined `allowedElements` and `disallowedElements`, expected one or the other',
		);
	}

	visit(tree, (node, index, parent) => {
		if (node.type === 'raw' && parent && typeof index === 'number') {
			parent.children.splice(
				index,
				1,
				...(skipHtml ? [] : [{ type: 'text', value: node.value } as const]),
			);
			return index;
		}

		if (node.type !== 'element') return;

		for (const key in urlAttributes) {
			if (Object.hasOwn(urlAttributes, key) && Object.hasOwn(node.properties, key)) {
				const test = urlAttributes[key];
				if (test === null || test.includes(node.tagName)) {
					const value = node.properties[key];
					node.properties[key] = urlTransform(String(value || ''), key, node);
				}
			}
		}

		let remove = allowedElements
			? !allowedElements.includes(node.tagName)
			: disallowedElements
				? disallowedElements.includes(node.tagName)
				: false;

		if (!remove && allowElement && typeof index === 'number') {
			remove = !allowElement(node, index, parent as Readonly<Parents> | undefined);
		}

		if (remove && parent && typeof index === 'number') {
			parent.children.splice(index, 1, ...(unwrapDisallowed ? node.children : []));
			return index;
		}
	});

	return tree;
}

export type { Element, Options };
