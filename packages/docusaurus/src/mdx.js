import { compileMdx, compileMdxSync, defaultRemarkPlugins } from '@octanejs/mdx/compile';
import GithubSlugger from 'github-slugger';

const DATA_KEY = 'octaneDocusaurus';

function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	visit(node);
	for (const [key, value] of Object.entries(node)) {
		if (key === 'position' || key === 'data') continue;
		if (Array.isArray(value)) {
			for (const child of value) walk(child, visit);
		} else {
			walk(value, visit);
		}
	}
}

function textContent(node) {
	let text = '';
	walk(node, (child) => {
		if (child === node) return;
		if (child.type === 'text' || child.type === 'inlineCode') text += child.value ?? '';
		if (child.type === 'image') text += child.alt ?? '';
	});
	return text.trim();
}

function createSlugger(maintainCase) {
	const slugger = new GithubSlugger();
	return {
		explicit(value) {
			return slugger.slug(value, true);
		},
		generated(value) {
			return slugger.slug(value, maintainCase);
		},
	};
}

function transformImageUrl(transform, url, sourceFilePath) {
	if (typeof transform !== 'function') return url;
	const transformed = transform({ url, sourceFilePath });
	if (typeof transformed !== 'string') {
		throw new TypeError('A Docusaurus MDX image transform must return a string.');
	}
	return transformed;
}

function transformMarkdownLink(transform, url, sourceFilePath) {
	if (typeof transform !== 'function') return url;
	if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return url;
	const match = /^([^?#]*)(.*)$/.exec(url);
	const linkPathname = match?.[1] ?? url;
	if (!/\.mdx?$/i.test(linkPathname)) return url;
	const transformed = transform({ linkPathname, sourceFilePath });
	if (transformed === null) return url;
	if (typeof transformed !== 'string') {
		throw new TypeError('A Docusaurus Markdown link resolver must return a string or null.');
	}
	return transformed + (match?.[2] ?? '');
}

function classicHeadingId(heading, headingText) {
	const match = /\s*\{#((?:.(?!\{#|\}))*.)\}$/.exec(headingText);
	if (!match) return undefined;
	const id = match[1].trim();
	const last = heading.children?.at(-1);
	if (last?.type === 'text') {
		last.value = String(last.value).replace(/\s*\{#(?:.(?!\{#|\}))*.\}$/, '');
		if (!last.value && heading.children.length > 1) heading.children.pop();
	}
	return id;
}

function commentHeadingId(heading) {
	const last = heading.children?.at(-1);
	if (last?.type !== 'mdxTextExpression' || !last.data?.estree) return undefined;
	const program = last.data.estree;
	if (program.body?.length !== 0 || program.comments?.length !== 1) return undefined;
	const first = String(program.comments[0].value).trim().split(' ')[0];
	if (!first?.startsWith('#') || first.length === 1) return undefined;
	heading.children.pop();
	const newLast = heading.children.at(-1);
	if (newLast?.type === 'text') newLast.value = newLast.value.trimEnd();
	return first.slice(1);
}

function headingId(node, headingText, slugger) {
	const existing = node.data?.hProperties?.id;
	if (typeof existing === 'string' && existing) return slugger.explicit(existing);
	return (
		commentHeadingId(node) ?? classicHeadingId(node, headingText) ?? slugger.generated(headingText)
	);
}

export function remarkDocusaurusPageData(options = {}) {
	return (tree, file) => {
		const slugger = createSlugger(options.anchorsMaintainCase === true);
		const toc = [];
		let contentTitle;
		let titleIndex = -1;
		let contentTitleCandidate = true;
		const children = Array.isArray(tree.children) ? tree.children : [];

		for (let index = 0; index < children.length; index++) {
			const node = children[index];
			if (node.type === 'heading') {
				const originalValue = textContent(node);
				node.data ??= {};
				node.data.hProperties ??= {};
				const id = headingId(node, originalValue, slugger);
				node.data.hProperties.id = id;
				node.data.id = id;
				const value = textContent(node);
				if (contentTitleCandidate && node.depth === 1) {
					contentTitle = value;
					titleIndex = index;
					contentTitleCandidate = false;
				} else if (contentTitleCandidate) {
					contentTitleCandidate = false;
				}
				if (
					node.depth >= (options.tocMinHeadingLevel ?? 2) &&
					node.depth <= (options.tocMaxHeadingLevel ?? 3)
				) {
					toc.push({ value, id, level: node.depth });
				}
			}
			if (node.type === 'thematicBreak') contentTitleCandidate = false;
		}

		const sourceFilePath = String(file.path ?? '');
		walk(tree, (node) => {
			if ((node.type === 'link' || node.type === 'definition') && typeof node.url === 'string') {
				node.url = transformMarkdownLink(options.resolveMarkdownLink, node.url, sourceFilePath);
			}
			if (node.type === 'image' && typeof node.url === 'string') {
				node.url = transformImageUrl(options.resolveMarkdownImage, node.url, sourceFilePath);
			}
		});

		if (titleIndex !== -1) {
			if (options.removeContentTitle === true) {
				children.splice(titleIndex, 1);
			} else {
				children[titleIndex] = {
					type: 'mdxJsxFlowElement',
					name: 'header',
					attributes: [],
					children: [children[titleIndex]],
				};
			}
		}
		file.data[DATA_KEY] = {
			toc,
			contentTitle,
			metadata: options.metadata ?? {},
			assets:
				typeof options.createAssets === 'function'
					? options.createAssets({
							frontMatter: options.metadata?.frontMatter ?? {},
							filePath: sourceFilePath,
						})
					: {},
		};
	};
}

function literal(value) {
	if (value === undefined) {
		return { type: 'Identifier', name: 'undefined' };
	}
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return { type: 'Literal', value };
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError('Docusaurus MDX exports must contain finite numbers.');
		}
		return { type: 'Literal', value };
	}
	if (Array.isArray(value)) {
		return { type: 'ArrayExpression', elements: value.map(literal) };
	}
	if (value && typeof value === 'object') {
		return {
			type: 'ObjectExpression',
			properties: Object.entries(value)
				.filter(([, item]) => item !== undefined)
				.map(([key, item]) => ({
					type: 'Property',
					method: false,
					shorthand: false,
					computed: false,
					kind: 'init',
					key: /^[A-Za-z_$][\w$]*$/.test(key)
						? { type: 'Identifier', name: key }
						: { type: 'Literal', value: key },
					value: literal(item),
				})),
		};
	}
	throw new TypeError(`Docusaurus MDX export value ${String(value)} is not serializable.`);
}

function exportedConstant(name, expression) {
	return {
		type: 'ExportNamedDeclaration',
		declaration: {
			type: 'VariableDeclaration',
			kind: 'const',
			declarations: [
				{
					type: 'VariableDeclarator',
					id: { type: 'Identifier', name },
					init: expression,
				},
			],
		},
		specifiers: [],
		source: null,
	};
}

export function recmaDocusaurusPageExports() {
	return (tree, file) => {
		const data = file.data[DATA_KEY] ?? {
			toc: [],
			contentTitle: undefined,
			metadata: {},
			assets: {},
		};
		tree.body.push(
			exportedConstant('frontMatter', { type: 'Identifier', name: 'frontmatter' }),
			exportedConstant('contentTitle', literal(data.contentTitle)),
			exportedConstant('toc', literal(data.toc)),
			exportedConstant('metadata', literal(data.metadata)),
			exportedConstant('assets', literal(data.assets)),
		);
	};
}

function compileOptions(options) {
	const {
		beforeDefaultRemarkPlugins = [],
		remarkPlugins = [],
		beforeDefaultRehypePlugins = [],
		rehypePlugins = [],
		recmaPlugins = [],
		metadata,
		createAssets,
		resolveMarkdownLink,
		resolveMarkdownImage,
		removeContentTitle,
		anchorsMaintainCase,
		tocMinHeadingLevel,
		tocMaxHeadingLevel,
		...base
	} = options;
	const pageDataOptions = {
		metadata,
		createAssets,
		resolveMarkdownLink,
		resolveMarkdownImage,
		removeContentTitle,
		anchorsMaintainCase,
		tocMinHeadingLevel,
		tocMaxHeadingLevel,
	};
	return {
		...base,
		remarkPlugins: [
			...beforeDefaultRemarkPlugins,
			...defaultRemarkPlugins,
			[remarkDocusaurusPageData, pageDataOptions],
			...remarkPlugins,
		],
		rehypePlugins: [...beforeDefaultRehypePlugins, ...rehypePlugins],
		recmaPlugins: [...recmaPlugins, recmaDocusaurusPageExports],
	};
}

function escapeMarkdownHeadingIds(source) {
	const lines = source.split('\n');
	let fence;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (match) {
			const marker = match[1];
			if (fence === undefined) {
				fence = { character: marker[0], length: marker.length };
			} else if (
				marker[0] === fence.character &&
				marker.length >= fence.length &&
				/^[\t ]*\r?$/.test(line.slice(match[0].length))
			) {
				fence = undefined;
			}
			continue;
		}
		if (fence !== undefined) continue;
		lines[index] = line.replace(/^#{1,6}(?!#).*/, (heading) =>
			heading.replace('{#', '\\{#').replace('\\\\{#', '\\{#'),
		);
	}

	return lines.join('\n');
}

export function compileDocusaurusMdx(source, id, options = {}) {
	return compileMdx(escapeMarkdownHeadingIds(source), id, compileOptions(options));
}

export function compileDocusaurusMdxSync(source, id, options = {}) {
	return compileMdxSync(escapeMarkdownHeadingIds(source), id, compileOptions(options));
}
