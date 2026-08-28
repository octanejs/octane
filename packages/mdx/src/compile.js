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
import {
	TraceMap,
	originalPositionFor,
	GREATEST_LOWER_BOUND,
	LEAST_UPPER_BOUND,
} from '@jridgewell/trace-mapping';
import { compile as mdxCompile, compileSync as mdxCompileSync } from '@mdx-js/mdx';
import { __analyzeNativeChangeDiagnostics, compile as octaneCompile } from 'octane/compiler';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { SourceMapGenerator } from 'source-map';

/**
 * @typedef {object} CompileMdxResult
 * @property {string} code
 * @property {unknown} map
 * @property {Array<{
 *   code: string,
 *   severity: 'warning',
 *   message: string,
 *   filename: string,
 *   start: { offset: number, line: number, column: number },
 *   end: { offset: number, line: number, column: number },
 *   suggestions: Array<{
 *     start: { offset: number, line: number, column: number },
 *     end: { offset: number, line: number, column: number },
 *     attribute: 'onInput' | 'onInputCapture',
 *   }>,
 * }>} diagnostics
 */

/**
 * @typedef {object} AuthoredJsxAttributeLocation
 * @property {string} name
 * @property {number} start
 * @property {number} end
 * @property {{ start: { line: number, column: number }, end: { line: number, column: number } }} loc
 * @property {boolean} staticallyWarned
 */

/**
 * @typedef {object} DiagnosticMappingContext
 * @property {AuthoredJsxAttributeLocation[]} authoredAttributes
 * @property {WeakMap<object, AuthoredJsxAttributeLocation>} attributeLocations
 * @property {string} source
 * @property {string} id
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
	const diagnosticContext = {
		authoredAttributes: [],
		attributeLocations: new WeakMap(),
		source,
		id,
	};
	const out = await mdxCompile(
		{ value: source, path: id },
		buildMdxOptions(id, options, diagnosticContext),
	);
	return octaneStage(String(out.value), out.map, source, id, options, diagnosticContext);
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
	const diagnosticContext = {
		authoredAttributes: [],
		attributeLocations: new WeakMap(),
		source,
		id,
	};
	const out = mdxCompileSync(
		{ value: source, path: id },
		buildMdxOptions(id, options, diagnosticContext),
	);
	return octaneStage(String(out.value), out.map, source, id, options, diagnosticContext);
}

/**
 * @param {string} id
 * @param {CompileMdxOptions} options
 * @param {DiagnosticMappingContext} diagnosticContext
 * @returns {import('@mdx-js/mdx').CompileOptions}
 */
function buildMdxOptions(id, options, diagnosticContext) {
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
		recmaPlugins: [
			seedAuthoredJsxAttributeLocations(diagnosticContext),
			...(options.recmaPlugins ?? []),
			restoreAuthoredJsxAttributeLocations(diagnosticContext),
			recmaOctaneAdapter,
		],
	};
}

/**
 * @param {unknown} tree
 * @param {(attribute: Record<string, any>) => void} callback
 */
function visitJsxAttributes(tree, callback) {
	const activeObjects = new WeakSet();
	/** @param {unknown} value */
	function visit(value) {
		if (value === null || typeof value !== 'object' || activeObjects.has(value)) return;
		activeObjects.add(value);
		const node = /** @type {Record<string, any>} */ (value);
		if (node.type === 'JSXAttribute') callback(node);
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'range' || key === 'position') continue;
			if (Array.isArray(child)) child.forEach(visit);
			else visit(child);
		}
		activeObjects.delete(value);
	}
	visit(tree);
}

/**
 * @param {Record<string, any>} node
 * @param {AuthoredJsxAttributeLocation} location
 */
function applyNodeLocation(node, location) {
	node.start = location.start;
	node.end = location.end;
	node.range = [location.start, location.end];
	node.loc = {
		start: { ...location.loc.start },
		end: { ...location.loc.end },
	};
}

/**
 * Add the exact source location missing from MDX's JSXIdentifier attribute
 * names. Remark and rehype transforms have already established stage-one
 * source provenance here; the parent JSXAttribute carries that location, and
 * seeding the child makes the map point directly at the token the Octane
 * diagnostic covers. Analyze this pre-recma tree once as well: a later
 * transform may preserve or copy source locations, but only attributes that
 * were already statically warned at this boundary may receive an authored fix.
 *
 * @param {DiagnosticMappingContext} context
 */
function seedAuthoredJsxAttributeLocations(context) {
	return function recmaSeedAuthoredJsxAttributeLocations() {
		/** @param {unknown} tree */
		return (tree) => {
			context.authoredAttributes.length = 0;
			const occurrences = [];
			visitJsxAttributes(tree, (attribute) => occurrences.push(attribute));
			const occurrenceCounts = new Map();
			for (const attribute of occurrences) {
				occurrenceCounts.set(attribute, (occurrenceCounts.get(attribute) ?? 0) + 1);
			}
			for (const attribute of occurrences) {
				if (occurrenceCounts.get(attribute) !== 1) continue;
				const name = attribute.name;
				if (
					name?.type !== 'JSXIdentifier' ||
					typeof name.name !== 'string' ||
					typeof attribute.start !== 'number' ||
					typeof attribute.loc?.start?.line !== 'number' ||
					typeof attribute.loc?.start?.column !== 'number'
				)
					continue;
				const location = {
					name: name.name,
					start: attribute.start,
					end: attribute.start + name.name.length,
					loc: {
						start: {
							line: attribute.loc.start.line,
							column: attribute.loc.start.column,
						},
						end: {
							line: attribute.loc.start.line,
							column: attribute.loc.start.column + name.name.length,
						},
					},
					staticallyWarned: false,
				};
				context.authoredAttributes.push(location);
				context.attributeLocations.set(attribute, location);
				const seededName = { ...name };
				attribute.name = seededName;
				applyNodeLocation(seededName, location);
			}
			const warningRanges = new Set(
				__analyzeNativeChangeDiagnostics(tree, context.source, context.id).diagnostics.flatMap(
					(diagnostic) =>
						diagnostic.suggestions.map(
							(suggestion) => `${suggestion.start.offset}:${suggestion.end.offset}`,
						),
				),
			);
			for (const location of context.authoredAttributes) {
				location.staticallyWarned = warningRanges.has(`${location.start}:${location.end}`);
			}
		};
	};
}

/**
 * Restore exact locations on unchanged attribute identities after user recma
 * transforms. Classification was frozen before those transforms, so even a
 * later plugin that copies a location cannot turn a previously-safe authored
 * callback into an actionable replacement.
 *
 * @param {DiagnosticMappingContext} context
 */
function restoreAuthoredJsxAttributeLocations(context) {
	return function recmaRestoreAuthoredJsxAttributeLocations() {
		/** @param {unknown} tree */
		return (tree) => {
			const occurrences = [];
			visitJsxAttributes(tree, (attribute) => occurrences.push(attribute));
			const occurrenceCounts = new Map();
			for (const attribute of occurrences) {
				occurrenceCounts.set(attribute, (occurrenceCounts.get(attribute) ?? 0) + 1);
			}
			for (const attribute of occurrences) {
				const name = attribute.name;
				const location = context.attributeLocations.get(attribute);
				if (
					location &&
					occurrenceCounts.get(attribute) === 1 &&
					name?.type === 'JSXIdentifier' &&
					name.name === location.name
				) {
					// Isolate the authored name from shallow attribute clones. Otherwise a
					// generated clone can share this child object and regain its location
					// when the original attribute is restored later in the traversal.
					const restoredName = { ...name };
					attribute.name = restoredName;
					applyNodeLocation(restoredName, location);
					continue;
				}
				// Do not let a plugin-created clone carrying copied positions masquerade
				// as the one authored attribute captured before user transforms.
				for (const node of [attribute, name]) {
					if (node === null || typeof node !== 'object') continue;
					delete node.start;
					delete node.end;
					delete node.range;
					delete node.loc;
				}
			}
		};
	};
}

/**
 * @param {string} jsxSource
 * @param {unknown} mdxMap
 * @param {string} authoredSource
 * @param {string} id
 * @param {CompileMdxOptions} options
 * @param {DiagnosticMappingContext} diagnosticContext
 * @returns {CompileMdxResult}
 */
function octaneStage(jsxSource, mdxMap, authoredSource, id, options, diagnosticContext) {
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
	// Compiler diagnostics are reported against the intermediate JSX emitted by
	// MDX. Trace every available range through stage one's source map so direct
	// callers and Vite warnings point at the JSX the author actually wrote in the
	// document. Markdown generated by headings/lists has no authored event prop,
	// so native-change warnings are expected to map only from literal MDX JSX.
	out.diagnostics = remapDiagnostics(
		out.diagnostics,
		mdxMap,
		jsxSource,
		authoredSource,
		id,
		diagnosticContext.authoredAttributes,
	);
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

/** @param {string} source */
function sourceLineStarts(source) {
	const starts = [0];
	for (let index = 0; index < source.length; index++) {
		if (source.charCodeAt(index) === 10) starts.push(index + 1);
	}
	return starts;
}

/**
 * @param {string} source
 * @param {number[]} starts
 * @param {number} offset
 */
function positionForOffset(source, starts, offset) {
	const clamped = Math.max(0, Math.min(source.length, offset));
	let low = 0;
	let high = starts.length;
	while (low + 1 < high) {
		const mid = (low + high) >> 1;
		if (starts[mid] <= clamped) low = mid;
		else high = mid;
	}
	return { offset: clamped, line: low + 1, column: clamped - starts[low] };
}

/**
 * @param {TraceMap} trace
 * @param {string} source
 * @param {number[]} starts
 * @param {{ offset: number, line: number, column: number }} position
 * @param {number} bias
 */
function mapDiagnosticPosition(trace, source, starts, position, bias) {
	const mapped = originalPositionFor(trace, {
		line: position.line,
		column: position.column,
		bias,
	});
	if (mapped.line == null || mapped.column == null) return null;
	const lineStart = starts[mapped.line - 1];
	if (lineStart === undefined) return null;
	return positionForOffset(source, starts, lineStart + mapped.column);
}

/**
 * Match an Octane diagnostic to an exact authored JSX attribute source-map
 * segment. Both source-map biases must resolve to the same seeded token: when
 * they differ, the generated position sits between mappings and belongs to
 * transformed/generated code rather than an authored attribute.
 *
 * @param {TraceMap} trace
 * @param {string} jsxSource
 * @param {string} source
 * @param {number[]} starts
 * @param {{ start: { offset: number, line: number, column: number }, end: { offset: number, line: number, column: number } }} range
 * @param {AuthoredJsxAttributeLocation[]} authoredAttributes
 * @returns {AuthoredJsxAttributeLocation | null}
 */
function exactAuthoredAttributeForDiagnostic(
	trace,
	jsxSource,
	source,
	starts,
	range,
	authoredAttributes,
) {
	const name = jsxSource.slice(range.start.offset, range.end.offset);
	if (name.length === 0) return null;
	const lower = mapDiagnosticPosition(trace, source, starts, range.start, GREATEST_LOWER_BOUND);
	const upper = mapDiagnosticPosition(trace, source, starts, range.start, LEAST_UPPER_BOUND);
	if (lower === null || upper === null || lower.offset !== upper.offset) return null;
	return (
		authoredAttributes.find(
			(attribute) =>
				attribute.staticallyWarned && attribute.name === name && attribute.start === lower.offset,
		) ?? null
	);
}

/**
 * @param {string} source
 * @param {number[]} starts
 * @param {AuthoredJsxAttributeLocation} attribute
 */
function rangeForAuthoredAttribute(source, starts, attribute) {
	return {
		start: positionForOffset(source, starts, attribute.start),
		end: positionForOffset(source, starts, attribute.end),
	};
}

/**
 * @param {CompileMdxResult['diagnostics'] | undefined} diagnostics
 * @param {unknown} mdxMap
 * @param {string} jsxSource
 * @param {string} source
 * @param {string} id
 * @param {AuthoredJsxAttributeLocation[]} authoredAttributes
 * @returns {CompileMdxResult['diagnostics']}
 */
function remapDiagnostics(diagnostics, mdxMap, jsxSource, source, id, authoredAttributes) {
	if (!Array.isArray(diagnostics) || diagnostics.length === 0) return [];
	const starts = sourceLineStarts(source);
	const fileStart = positionForOffset(source, starts, 0);
	const trace = mdxMap ? new TraceMap(JSON.parse(JSON.stringify(mdxMap))) : null;
	const claimedAttributes = new Set();
	return diagnostics.map((diagnostic) => {
		const attribute = trace
			? exactAuthoredAttributeForDiagnostic(
					trace,
					jsxSource,
					source,
					starts,
					diagnostic,
					authoredAttributes,
				)
			: null;
		const key = attribute ? `${attribute.name}:${attribute.start}:${attribute.end}` : null;
		if (attribute === null || key === null || claimedAttributes.has(key)) {
			return {
				...diagnostic,
				filename: id,
				start: fileStart,
				end: fileStart,
				suggestions: [],
			};
		}
		claimedAttributes.add(key);
		const range = rangeForAuthoredAttribute(source, starts, attribute);
		const claimedSuggestions = new Set();
		return {
			...diagnostic,
			filename: id,
			...range,
			suggestions: diagnostic.suggestions.flatMap((suggestion) => {
				const suggestionAttribute = exactAuthoredAttributeForDiagnostic(
					trace,
					jsxSource,
					source,
					starts,
					suggestion,
					authoredAttributes,
				);
				if (suggestionAttribute === null) return [];
				const suggestionKey = `${suggestionAttribute.name}:${suggestionAttribute.start}:${suggestionAttribute.end}`;
				if (claimedSuggestions.has(suggestionKey)) return [];
				claimedSuggestions.add(suggestionKey);
				return [
					{
						...suggestion,
						...rangeForAuthoredAttribute(source, starts, suggestionAttribute),
					},
				];
			}),
		};
	});
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
