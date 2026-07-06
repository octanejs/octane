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
 * ESTree pass over MDX's output: MDX's no-layout branch CALLS
 * `_createMdxContent(props)` directly, which bypasses octane's
 * `(props, __s, __extra)` component ABI (the server body would run with
 * `__s === undefined` and lean on scope-recovery). The pass rewrites the bare
 * call to `<_createMdxContent {...props}/>` so both branches mount through the
 * component machinery on client AND server. (The layout branch's
 * `<_createMdxContent {...props}/>` tag needs no help: octane classifies
 * `_`-starting identifier tags as component references, per JSX semantics.)
 *
 * The two former SERVER-mode fixups are gone — their octane gaps are fixed:
 * `ssrComponent` renders a host-tag-STRING comp as a
 * `<!--[--><tag>…</tag><!--]-->` block (the shape the client's componentSlot /
 * de-opt host renderer adopts on hydration), and the server compiler
 * value-lowers a returned fragment through `ssrChild([...])` exactly like the
 * client's descriptor array — so `<_components.h1>` member tags and the
 * document's fragment body take the SAME shape on both sides (hydration-safe).
 */
import remapping from '@jridgewell/remapping';
import {
	compile as mdxCompile,
	compileSync as mdxCompileSync,
	type CompileOptions,
} from '@mdx-js/mdx';
import { compile as octaneCompile } from 'octane/compiler';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { SourceMapGenerator } from 'source-map';

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
	 * (`useMDXComponents`). Defaults per mode — `'@octanejs/mdx'` (client) /
	 * `'@octanejs/mdx/server'` (server), so each runtime reads ITS OWN context
	 * store (they are disjoint; see src/server.ts). Pass `null` to disable the
	 * provider wiring entirely (only `props.components` applies).
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
		| 'SourceMapGenerator'
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
	return octaneStage(String(out.value), out.map, id, options);
}

/** Synchronous {@link compileMdx} (the default plugin set is fully sync). */
export function compileMdxSync(
	source: string,
	id: string,
	options: CompileMdxOptions = {},
): CompileMdxResult {
	const out = mdxCompileSync({ value: source, path: id }, buildMdxOptions(id, options));
	return octaneStage(String(out.value), out.map, id, options);
}

function buildMdxOptions(id: string, options: CompileMdxOptions): CompileOptions {
	const format =
		options.format && options.format !== 'detect'
			? options.format
			: id.endsWith('.md')
				? 'md'
				: 'mdx';
	const provider =
		options.providerImportSource === undefined
			? options.mode === 'server'
				? '@octanejs/mdx/server'
				: '@octanejs/mdx'
			: options.providerImportSource;
	return {
		...options.mdxOptions,
		format,
		// The load-bearing switch: emit JSX SOURCE (no jsx-runtime calls), which
		// octane's compiler lowers to its own codegen.
		jsx: true,
		// Map the intermediate JSX back to the .mdx source — stage one of the
		// chained map octaneStage composes (stage two is octane's own map).
		SourceMapGenerator,
		...(provider === null ? {} : { providerImportSource: provider }),
		remarkPlugins: options.remarkPlugins ?? defaultRemarkPlugins,
		rehypePlugins: options.rehypePlugins,
		recmaPlugins: [...(options.recmaPlugins ?? []), recmaOctaneAdapter],
	};
}

function octaneStage(
	jsxSource: string,
	mdxMap: unknown,
	id: string,
	options: CompileMdxOptions,
): CompileMdxResult {
	const mode = options.mode ?? 'client';
	const out = octaneCompile(jsxSource, id, {
		mode,
		hmr: mode === 'client' && !!options.hmr,
		dev: mode === 'client' && !!options.dev,
	});
	// Two-stage sourcemap: octane's map targets the INTERMEDIATE JSX text;
	// @mdx-js/mdx's map (via SourceMapGenerator) targets the original .mdx.
	// Compose them (most-recent-first) so generated positions trace all the way
	// back to the document. The non-empty guard is defensive: if a compile shape
	// ever yields no overlapping segments, keep octane's intermediate map (its
	// `sourcesContent` is the intermediate JSX — still steppable in devtools,
	// unlike a blank map). The octane SERVER compile emits an empty-mappings map
	// by design (SSR maps are a later octane refinement).
	if (out.map && mdxMap) {
		const chained = remapping([out.map as any, mdxMap as any], () => null);
		if (String(chained.mappings).length > 0) out.map = chained;
	}
	// Fast refresh for documents: octane's compiler only auto-wraps EXPORTED
	// `@{}`-form components in `hmr(...)` — `MDXContent` (a passthrough function
	// returning a ternary of descriptors) isn't recognized as one, so the octane
	// `hmr` flag alone leaves `.mdx` edits as full module invalidations. The
	// PIPELINE knows the emitted shape, so it appends the exact registration the
	// octane compiler emits for `.tsrx` exports: wrap the default export in the
	// runtime `hmr()` (identity-stable across edits — parents keep their mounted
	// wrapper) + a self-accepting `import.meta.hot` block that swaps the body
	// and re-renders live blocks in place. Appending after the fact keeps the
	// source map's earlier segments valid (ESM imports hoist).
	if (mode === 'client' && options.hmr && /\bexport default function MDXContent\b/.test(out.code)) {
		out.code +=
			"\nimport { hmr as _$mdxHmr, HMR as _$mdxHMR } from 'octane';\n" +
			'MDXContent = _$mdxHmr(MDXContent);\n' +
			'if (import.meta.hot) {\n' +
			'  import.meta.hot.accept((module) => {\n' +
			'    module && MDXContent[_$mdxHMR].update(module.default);\n' +
			'  });\n' +
			'}\n';
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// recmaOctaneAdapter — the ESTree pass described in the module doc.
// ─────────────────────────────────────────────────────────────────────────────

const MDX_BODY_NAME = '_createMdxContent';

function recmaOctaneAdapter() {
	return (tree: unknown): void => {
		walkReplace(tree as EstreeNode, adaptNode);
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
function adaptNode(node: EstreeNode): EstreeNode | null {
	// `_createMdxContent(props)` → `<_createMdxContent {...props}/>`.
	if (
		node.type === 'CallExpression' &&
		isNode(node.callee) &&
		node.callee.type === 'Identifier' &&
		node.callee.name === MDX_BODY_NAME &&
		Array.isArray(node.arguments) &&
		node.arguments.length <= 1 &&
		(node.arguments.length === 0 || isNode(node.arguments[0]))
	) {
		return jsxSelfClosing(MDX_BODY_NAME, (node.arguments[0] as EstreeNode) ?? null);
	}
	return null;
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
