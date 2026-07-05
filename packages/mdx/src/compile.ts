/**
 * @octanejs/mdx — the compile pipeline (`…/compile` entry).
 *
 * Strategy (docs/react-library-compat-plan.md §2): @mdx-js/mdx's compiler is
 * framework-agnostic — with `jsx: true` it emits the compiled document as
 * CLASSIC JSX SOURCE instead of framework runtime calls. That emitted program
 * is exactly the React-style `.tsx` dialect octane's compiler already handles,
 * so the pipeline is
 *
 *   .mdx/.md → @mdx-js/mdx (JSX/ESM source) → octane/compiler → compiled octane
 *
 * i.e. an MDX document becomes a REAL compiled octane component module (client
 * descriptor/template codegen, or server HTML-string codegen when
 * `mode: 'server'`) — no MDX runtime, no interpretation. `providerImportSource`
 * defaults to `@octanejs/mdx`, wiring `_provideComponents()` in the emitted
 * code to this package's `useMDXComponents` (the octane port of
 * @mdx-js/react's provider).
 *
 * The only adaptation between the two compilers is `recmaOctaneAdapter`, a tiny
 * ESTree pass over MDX's output:
 *
 *  1. MDX names its body component `_createMdxContent`. octane's JSX lowering
 *     treats an identifier tag as a component only when it starts with an
 *     UPPERCASE letter, so the layout branch's `<_createMdxContent {...props}/>`
 *     would lower to `createElement('_createMdxContent', …)` — a host STRING
 *     tag (JSX semantics say a `_`-starting identifier is a component
 *     reference; Babel/TS agree). The pass renames it to `MDX$CreateMdxContent`.
 *     This is a documented workaround for an octane compiler gap — drop the
 *     rename once `<_Foo/>` compiles as a component reference.
 *  2. MDX's no-layout branch CALLS `_createMdxContent(props)` directly, which
 *     bypasses octane's `(props, __s, __extra)` component ABI (the server body
 *     would run with `__s === undefined` and lean on scope-recovery). The pass
 *     rewrites the bare call to `<MDX$CreateMdxContent {...props}/>` so both
 *     branches mount through the component machinery on client AND server.
 *  3. SERVER mode only: MDX renders markdown elements through its components
 *     mapping — `<_components.h1>` — whose value is a host tag STRING unless
 *     overridden. octane's CLIENT lowering of a member-expression tag is a
 *     `createElement` descriptor, which the runtime's de-opt renderer accepts
 *     for strings; the SERVER's template lowering routes it to
 *     `ssrComponent(scope, comp, …)`, which CALLS `comp` — a string crashes
 *     (an octane compiler/server-runtime gap: member/dynamic tags resolving to
 *     host tag strings work on the client, not in SSR). The pass wraps every
 *     `_components.*`-tagged element in JSX-child position in an expression
 *     container (`{<_components.h1>…</_components.h1>}`) so the server codegen
 *     treats it as a VALUE hole — `ssrChild(createElement(…))` — which handles
 *     string tags. Client output is left untouched; drop this once
 *     `ssrComponent` (or the server lowering) accepts host tag strings.
 */
import {
	compile as mdxCompile,
	compileSync as mdxCompileSync,
	type CompileOptions,
} from '@mdx-js/mdx';
import { compile as octaneCompile } from 'octane/compiler';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';

export interface CompileMdxResult {
	code: string;
	map: unknown;
}

export interface CompileMdxOptions {
	/** octane codegen target: `'client'` (DOM) or `'server'` (SSR HTML strings). Default `'client'`. */
	mode?: 'client' | 'server';
	/** octane compiler HMR wrapping (client only; the vite plugin wires this to serve mode). */
	hmr?: boolean;
	/** octane compiler dev metadata (client only; same gate as `hmr`). */
	dev?: boolean;
	/**
	 * Module the emitted document reads the provider mapping from
	 * (`useMDXComponents`). Defaults to `'@octanejs/mdx'`; pass `null` to
	 * disable the provider wiring entirely (only `props.components` applies).
	 */
	providerImportSource?: string | null;
	/** remark plugins. Defaults to `defaultRemarkPlugins` (GFM + frontmatter + frontmatter-export). */
	remarkPlugins?: CompileOptions['remarkPlugins'];
	rehypePlugins?: CompileOptions['rehypePlugins'];
	/** Extra recma (ESTree) plugins, run before the octane adapter pass. */
	recmaPlugins?: CompileOptions['recmaPlugins'];
	/** Source syntax: `'mdx'`, plain `'md'` (no JSX/ESM/expressions), or `'detect'` by file extension. Default `'detect'`. */
	format?: 'mdx' | 'md' | 'detect';
	/** Escape hatch: other @mdx-js/mdx options. The pipeline owns `jsx`/`outputFormat`/the options above. */
	mdxOptions?: Omit<
		CompileOptions,
		| 'jsx'
		| 'jsxRuntime'
		| 'jsxImportSource'
		| 'outputFormat'
		| 'providerImportSource'
		| 'remarkPlugins'
		| 'rehypePlugins'
		| 'recmaPlugins'
		| 'format'
	>;
}

/**
 * The default remark plugin set: GitHub-flavored markdown, YAML/TOML
 * frontmatter parsing, and the `export const frontmatter = {…}` export.
 * Exported so a custom `remarkPlugins` list can extend rather than replace it.
 */
export const defaultRemarkPlugins: CompileOptions['remarkPlugins'] = [
	remarkGfm,
	remarkFrontmatter,
	remarkMdxFrontmatter,
];

/** Compile MDX/markdown source to a compiled octane module (async — supports async plugins). */
export async function compileMdx(
	source: string,
	id: string,
	options: CompileMdxOptions = {},
): Promise<CompileMdxResult> {
	const out = await mdxCompile({ value: source, path: id }, buildMdxOptions(id, options));
	return octaneStage(String(out.value), id, options);
}

/** Synchronous {@link compileMdx} (the default plugin set is fully sync). */
export function compileMdxSync(
	source: string,
	id: string,
	options: CompileMdxOptions = {},
): CompileMdxResult {
	const out = mdxCompileSync({ value: source, path: id }, buildMdxOptions(id, options));
	return octaneStage(String(out.value), id, options);
}

function buildMdxOptions(id: string, options: CompileMdxOptions): CompileOptions {
	const format =
		options.format && options.format !== 'detect'
			? options.format
			: id.endsWith('.md')
				? 'md'
				: 'mdx';
	const provider =
		options.providerImportSource === undefined ? '@octanejs/mdx' : options.providerImportSource;
	return {
		...options.mdxOptions,
		format,
		// The load-bearing switch: emit JSX SOURCE (no jsx-runtime calls), which
		// octane's compiler lowers to its own codegen.
		jsx: true,
		...(provider === null ? {} : { providerImportSource: provider }),
		remarkPlugins: options.remarkPlugins ?? defaultRemarkPlugins,
		rehypePlugins: options.rehypePlugins,
		recmaPlugins: [
			...(options.recmaPlugins ?? []),
			[recmaOctaneAdapter, { mode: options.mode ?? 'client' }],
		],
	};
}

function octaneStage(jsxSource: string, id: string, options: CompileMdxOptions): CompileMdxResult {
	const mode = options.mode ?? 'client';
	// NOTE on sourcemaps: octane's map references the INTERMEDIATE JSX text, not
	// the original .mdx — a faithful two-stage chain is future work. The map is
	// still returned so line-ish positions survive into the bundle.
	return octaneCompile(jsxSource, id, {
		mode,
		hmr: mode === 'client' && !!options.hmr,
		dev: mode === 'client' && !!options.dev,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// recmaOctaneAdapter — the ESTree pass described in the module doc.
// ─────────────────────────────────────────────────────────────────────────────

const MDX_BODY_SOURCE_NAME = '_createMdxContent';
// Capitalized (octane component tag) + `$` (never produced by MDX's own
// name-mangling and implausible as a user export from a document).
const MDX_BODY_NAME = 'MDX$CreateMdxContent';

function recmaOctaneAdapter(options?: { mode?: 'client' | 'server' }) {
	const server = options?.mode === 'server';
	return (tree: unknown): void => {
		walkReplace(tree as EstreeNode, (node) => adaptNode(node, server));
	};
}

type EstreeNode = { type: string; [key: string]: unknown };

function isNode(value: unknown): value is EstreeNode {
	return (
		value !== null && typeof value === 'object' && typeof (value as EstreeNode).type === 'string'
	);
}

// Visit `node` (post-decision, pre-recursion): return a replacement node to
// swap in (recursed into by the caller), or null to keep the node and recurse.
function adaptNode(node: EstreeNode, server: boolean): EstreeNode | null {
	// (2) `_createMdxContent(props)` → `<MDX$CreateMdxContent {...props}/>`.
	// Matched BEFORE the rename visits the callee identifier below.
	if (
		node.type === 'CallExpression' &&
		isNode(node.callee) &&
		node.callee.type === 'Identifier' &&
		node.callee.name === MDX_BODY_SOURCE_NAME &&
		Array.isArray(node.arguments) &&
		node.arguments.length <= 1 &&
		(node.arguments.length === 0 || isNode(node.arguments[0]))
	) {
		return jsxSelfClosing(MDX_BODY_NAME, (node.arguments[0] as EstreeNode) ?? null);
	}
	// (1) Rename every reference (declaration id, JSX tag, plain identifier).
	if (
		(node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
		node.name === MDX_BODY_SOURCE_NAME
	) {
		node.name = MDX_BODY_NAME;
	}
	if (server) {
		// (3) `_components.*` elements in JSX-CHILD position → `{<element/>}`
		// expression holes (see module doc). Wrapping edits the PARENT's children
		// array, so an already-wrapped element (now behind an expression
		// container) is never re-wrapped.
		if (
			(node.type === 'JSXElement' || node.type === 'JSXFragment') &&
			Array.isArray(node.children)
		) {
			const children = node.children as unknown[];
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (isNode(child) && isComponentsMappedElement(child)) {
					children[i] = { type: 'JSXExpressionContainer', expression: child };
				}
			}
		}
		// A `return <_components.p>…</_components.p>` (single-block document) has
		// no JSX parent to wrap under — hoist it into a fragment-with-hole.
		if (
			node.type === 'ReturnStatement' &&
			isNode(node.argument) &&
			isComponentsMappedElement(node.argument)
		) {
			node.argument = {
				type: 'JSXFragment',
				openingFragment: { type: 'JSXOpeningFragment', attributes: [], selfClosing: false },
				closingFragment: { type: 'JSXClosingFragment' },
				children: [{ type: 'JSXExpressionContainer', expression: node.argument }],
			};
		}
	}
	return null;
}

// `<_components.x …>` — an element whose tag reads off MDX's components
// mapping (and can therefore be a host tag STRING at runtime).
function isComponentsMappedElement(node: EstreeNode): boolean {
	if (node.type !== 'JSXElement') return false;
	const name = (node.openingElement as EstreeNode | undefined)?.name as EstreeNode | undefined;
	return (
		!!name &&
		name.type === 'JSXMemberExpression' &&
		isNode(name.object) &&
		name.object.type === 'JSXIdentifier' &&
		name.object.name === '_components'
	);
}

// Depth-first walk that can REPLACE child nodes in place (arrays and single
// node-valued keys). Skips location metadata keys.
function walkReplace(node: EstreeNode, visit: (n: EstreeNode) => EstreeNode | null): void {
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'range' || key === 'position' || key === 'data') continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				const child = value[i];
				if (!isNode(child)) continue;
				const next = visit(child);
				if (next !== null) value[i] = next;
				else walkReplace(child, visit);
			}
		} else if (isNode(value)) {
			const next = visit(value);
			if (next !== null) node[key] = next;
			else walkReplace(value, visit);
		}
	}
}

function jsxSelfClosing(name: string, spreadArgument: EstreeNode | null): EstreeNode {
	return {
		type: 'JSXElement',
		openingElement: {
			type: 'JSXOpeningElement',
			name: { type: 'JSXIdentifier', name },
			attributes: spreadArgument ? [{ type: 'JSXSpreadAttribute', argument: spreadArgument }] : [],
			selfClosing: true,
		},
		closingElement: null,
		children: [],
	};
}
