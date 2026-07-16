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
 *
 * Authored in `.js` (like octane's `compiler/vite.js` and @octanejs/stylex's
 * vite entry) so the `…/vite` plugin — which imports this module — loads when a
 * consuming app's `vite.config.ts` pulls it in through Node's ESM loader.
 */
import remapping from '@jridgewell/remapping';
import { compile as mdxCompile, compileSync as mdxCompileSync } from '@mdx-js/mdx';
import { compile as octaneCompile } from 'octane/compiler';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { SourceMapGenerator } from 'source-map';

/**
 * @typedef {object} CompileMdxResult
 * @property {string} code
 * @property {unknown} map
 */

/**
 * @typedef {object} CompileMdxOptions
 * @property {'client' | 'server'} [mode] octane codegen target: `'client'` (DOM) or `'server'` (SSR HTML strings). Default `'client'`.
 * @property {boolean} [hmr] octane compiler HMR wrapping (client only; the vite plugin wires this to serve mode).
 * @property {boolean} [dev] octane compiler dev metadata (client only; same gate as `hmr`).
 * @property {boolean} [profile] octane compiler profiling metadata (client only).
 * @property {string | null} [providerImportSource]
 *   Module the emitted document reads the provider mapping from
 *   (`useMDXComponents`). Defaults per mode — `'@octanejs/mdx'` (client) /
 *   `'@octanejs/mdx/server'` (server), so each runtime reads ITS OWN context
 *   store (they are disjoint; see src/server.ts). Pass `null` to disable the
 *   provider wiring entirely (only `props.components` applies).
 * @property {import('@mdx-js/mdx').CompileOptions['remarkPlugins']} [remarkPlugins] remark plugins. Defaults to `defaultRemarkPlugins` (GFM + frontmatter + frontmatter-export).
 * @property {import('@mdx-js/mdx').CompileOptions['rehypePlugins']} [rehypePlugins]
 * @property {import('@mdx-js/mdx').CompileOptions['recmaPlugins']} [recmaPlugins] Extra recma (ESTree) plugins, run before the octane adapter pass.
 * @property {'mdx' | 'md' | 'detect'} [format] Source syntax: `'mdx'`, plain `'md'` (no JSX/ESM/expressions), or `'detect'` by file extension. Default `'detect'`.
 * @property {Omit<import('@mdx-js/mdx').CompileOptions, 'jsx' | 'jsxRuntime' | 'jsxImportSource' | 'outputFormat' | 'providerImportSource' | 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins' | 'format' | 'SourceMapGenerator'>} [mdxOptions] Escape hatch: other @mdx-js/mdx options. The pipeline owns `jsx`/`outputFormat`/the options above.
 */

/**
 * The default remark plugin set: GitHub-flavored markdown, YAML/TOML
 * frontmatter parsing, and the `export const frontmatter = {…}` export.
 * Exported so a custom `remarkPlugins` list can extend rather than replace it.
 *
 * @type {import('@mdx-js/mdx').CompileOptions['remarkPlugins']}
 */
export const defaultRemarkPlugins = [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter];

/**
 * Compile MDX/markdown source to a compiled octane module (async — supports async plugins).
 *
 * @param {string} source
 * @param {string} id
 * @param {CompileMdxOptions} [options]
 * @returns {Promise<CompileMdxResult>}
 */
export async function compileMdx(source, id, options = {}) {
	const out = await mdxCompile({ value: source, path: id }, buildMdxOptions(id, options));
	return octaneStage(String(out.value), out.map, id, options);
}

/**
 * Synchronous {@link compileMdx} (the default plugin set is fully sync).
 *
 * @param {string} source
 * @param {string} id
 * @param {CompileMdxOptions} [options]
 * @returns {CompileMdxResult}
 */
export function compileMdxSync(source, id, options = {}) {
	const out = mdxCompileSync({ value: source, path: id }, buildMdxOptions(id, options));
	return octaneStage(String(out.value), out.map, id, options);
}

/**
 * @param {string} id
 * @param {CompileMdxOptions} options
 * @returns {import('@mdx-js/mdx').CompileOptions}
 */
function buildMdxOptions(id, options) {
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

/**
 * @param {string} jsxSource
 * @param {unknown} mdxMap
 * @param {string} id
 * @param {CompileMdxOptions} options
 * @returns {CompileMdxResult}
 */
function octaneStage(jsxSource, mdxMap, id, options) {
	const mode = options.mode ?? 'client';
	const out = octaneCompile(jsxSource, id, {
		mode,
		hmr: mode === 'client' && !!options.hmr,
		dev: mode === 'client' && !!options.dev,
		profile: mode === 'client' && !!options.profile,
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
		const chained = remapping([out.map, mdxMap], () => null);
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
	// Register the final public binding after the MDX-specific HMR wrapper. The
	// core compiler may also recognize the generated dispatcher, but its location
	// belongs to intermediate JSX and its registration precedes this wrapper. This
	// document-level registration deliberately overrides both with the authored
	// `.mdx` identity and stable line-one location.
	if (
		mode === 'client' &&
		options.profile &&
		/\bexport default function MDXContent\b/.test(out.code)
	) {
		const metadata = {
			id: `${id}#MDXContent@1:0`,
			name: 'MDXContent',
			file: id,
			line: 1,
			column: 0,
			kind: 'component',
		};
		out.code +=
			"\nimport { __profileComponent as _$mdxProfile } from 'octane/profiling';\n" +
			`_$mdxProfile(MDXContent, ${JSON.stringify(metadata)});\n`;
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// recmaOctaneAdapter — the ESTree pass described in the module doc.
// ─────────────────────────────────────────────────────────────────────────────

const MDX_BODY_NAME = '_createMdxContent';

function recmaOctaneAdapter() {
	/** @param {unknown} tree */
	return (tree) => {
		walkReplace(/** @type {EstreeNode} */ (tree), adaptNode);
	};
}

/** @typedef {{ type: string, [key: string]: unknown }} EstreeNode */

/**
 * @param {unknown} value
 * @returns {value is EstreeNode}
 */
function isNode(value) {
	return value !== null && typeof value === 'object' && typeof value.type === 'string';
}

/**
 * Visit `node` (post-decision, pre-recursion): return a replacement node to
 * swap in (recursed into by the caller), or null to keep the node and recurse.
 *
 * @param {EstreeNode} node
 * @returns {EstreeNode | null}
 */
function adaptNode(node) {
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
		return jsxSelfClosing(MDX_BODY_NAME, node.arguments[0] ?? null);
	}
	return null;
}

/**
 * Depth-first walk that can REPLACE child nodes in place (arrays and single
 * node-valued keys). Skips location metadata keys.
 *
 * @param {EstreeNode} node
 * @param {(n: EstreeNode) => EstreeNode | null} visit
 */
function walkReplace(node, visit) {
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

/**
 * @param {string} name
 * @param {EstreeNode | null} spreadArgument
 * @returns {EstreeNode}
 */
function jsxSelfClosing(name, spreadArgument) {
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
