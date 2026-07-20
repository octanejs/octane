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
 *   phase?: 'render' | 'purity' | 'effect' | 'cleanup',
 *   reportOnly?: boolean,
 *   declaration?: {
 *     hook: 'useState' | 'useReducer' | 'useActionState' | 'useOptimistic',
 *     name: string,
 *     start: { offset: number, line: number, column: number },
 *     end: { offset: number, line: number, column: number },
 *   },
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
 * @property {Array<{ owner: string, local: string, members?: boolean }>} causalExternalComponentBindings
 */

/**
 * @typedef {object} CompileMdxOptions
 * @property {'client' | 'server'} [mode] octane codegen target: `'client'` (DOM) or `'server'` (SSR HTML strings). Default `'client'`.
 * @property {boolean} [hmr] octane compiler HMR wrapping (client only; the vite plugin wires this to serve mode).
 * @property {boolean} [dev] octane compiler dev metadata (client only; same gate as `hmr`).
 * @property {boolean} [profile] octane compiler profiling metadata (client only).
 * @property {'causal' | 'permissive'} [stateModel] Effective state-transition model for this document. Default `'permissive'`.
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
		causalExternalComponentBindings: [],
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
		causalExternalComponentBindings: [],
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
			recmaOctaneAdapter(diagnosticContext, provider),
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
	let out;
	try {
		out = octaneCompile(jsxSource, id, {
			mode,
			hmr: mode === 'client' && !!options.hmr,
			dev: mode === 'client' && !!options.dev,
			profile: mode === 'client' && !!options.profile,
			stateModel: options.stateModel,
			...(options.stateModel === 'causal' &&
			diagnosticContext.causalExternalComponentBindings.length > 0
				? {
						__causalExternalComponentBindings: diagnosticContext.causalExternalComponentBindings,
					}
				: null),
		});
	} catch (error) {
		remapCausalCompileError(error, mdxMap, jsxSource, authoredSource, id);
		throw error;
	}
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
 * Map a compiler range whose token was preserved verbatim through MDX's ESM
 * output. Requiring both source-map biases to agree prevents generated wrapper
 * code from borrowing the nearest authored location.
 *
 * @param {TraceMap} trace
 * @param {string} jsxSource
 * @param {string} source
 * @param {number[]} starts
 * @param {{ start: { offset: number, line: number, column: number }, end: { offset: number, line: number, column: number } }} range
 */
function exactAuthoredTokenRange(trace, jsxSource, source, starts, range) {
	const token = jsxSource.slice(range.start.offset, range.end.offset);
	if (token.length === 0) return null;
	const lower = mapDiagnosticPosition(trace, source, starts, range.start, GREATEST_LOWER_BOUND);
	const upper = mapDiagnosticPosition(trace, source, starts, range.start, LEAST_UPPER_BOUND);
	if (lower === null || upper === null || lower.offset !== upper.offset) return null;
	if (source.slice(lower.offset, lower.offset + token.length) !== token) return null;
	return {
		start: lower,
		end: positionForOffset(source, starts, lower.offset + token.length),
	};
}

/** @param {unknown} error */
function remapCausalCompileError(error, mdxMap, jsxSource, source, id) {
	if (error === null || typeof error !== 'object') return;
	const value = /** @type {{ diagnostics?: unknown, message?: string }} */ (error);
	if (!Array.isArray(value.diagnostics)) return;
	const causalDiagnostics = value.diagnostics.filter((diagnostic) =>
		String(diagnostic?.code).startsWith('OCTANE_CAUSAL_STATE_'),
	);
	if (causalDiagnostics.length !== value.diagnostics.length) return;
	const mapped = remapCausalDiagnostics(causalDiagnostics, mdxMap, jsxSource, source, id);
	value.diagnostics = mapped;
	value.message = mapped
		.map(
			(diagnostic) =>
				`${diagnostic.filename}:${diagnostic.start.line}:${diagnostic.start.column + 1} ${diagnostic.message}`,
		)
		.join('\n');
}

function remapCausalDiagnostics(diagnostics, mdxMap, jsxSource, source, id) {
	const starts = sourceLineStarts(source);
	const fileStart = positionForOffset(source, starts, 0);
	const trace = mdxMap ? new TraceMap(JSON.parse(JSON.stringify(mdxMap))) : null;
	return diagnostics.map((diagnostic) =>
		remapCausalDiagnostic(diagnostic, trace, jsxSource, source, starts, fileStart, id),
	);
}

function remapCausalDiagnostic(diagnostic, trace, jsxSource, source, starts, fileStart, id) {
	const range = trace
		? exactAuthoredTokenRange(trace, jsxSource, source, starts, diagnostic)
		: null;
	const declarationRange =
		trace && diagnostic.declaration
			? exactAuthoredTokenRange(trace, jsxSource, source, starts, diagnostic.declaration)
			: null;
	return {
		...diagnostic,
		filename: id,
		...(range ?? { start: fileStart, end: fileStart }),
		...(diagnostic.declaration
			? {
					declaration: {
						...diagnostic.declaration,
						...(declarationRange ?? { start: fileStart, end: fileStart }),
					},
				}
			: null),
		suggestions: [],
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
		if (String(diagnostic.code).startsWith('OCTANE_CAUSAL_STATE_')) {
			return remapCausalDiagnostic(diagnostic, trace, jsxSource, source, starts, fileStart, id);
		}
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
			suggestions: (diagnostic.suggestions ?? []).flatMap((suggestion) => {
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
const MDX_CONTENT_NAME = 'MDXContent';
const MDX_COMPONENTS_NAME = '_components';
const MDX_LAYOUT_NAME = 'MDXLayout';
const MDX_PROVIDER_NAME = '_provideComponents';

/**
 * Record the component values whose definitions are supplied by the MDX
 * provider or the document caller. This is deliberately derived from the
 * post-recma tree: a user transform that changes one of MDX's canonical
 * binding shapes loses the exception and returns to the core compiler's
 * fail-closed provenance rule.
 *
 * @param {DiagnosticMappingContext} context
 * @param {string | null} provider
 */
function recmaOctaneAdapter(context, provider) {
	return function recmaOctaneAdapterPlugin() {
		/** @param {unknown} tree */
		return (tree) => {
			const program = /** @type {EstreeNode} */ (tree);
			walkReplace(program, adaptNode);
			context.causalExternalComponentBindings = collectMdxExternalComponentBindings(
				program,
				provider,
			);
		};
	};
}

/** @param {unknown} node @param {string} name */
function isIdentifier(node, name) {
	return isNode(node) && node.type === 'Identifier' && node.name === name;
}

/** @param {unknown} node */
function isEmptyObject(node) {
	return isNode(node) && node.type === 'ObjectExpression' && node.properties?.length === 0;
}

/** @param {unknown} node */
function isPropsComponents(node) {
	return (
		isNode(node) &&
		node.type === 'MemberExpression' &&
		node.computed === false &&
		isIdentifier(node.object, 'props') &&
		isIdentifier(node.property, 'components')
	);
}

/** @param {unknown} node */
function isProviderCall(node) {
	return (
		isNode(node) &&
		node.type === 'CallExpression' &&
		isIdentifier(node.callee, MDX_PROVIDER_NAME) &&
		Array.isArray(node.arguments) &&
		node.arguments.length === 0
	);
}

/** @param {unknown} node @param {(argument: unknown) => boolean} predicate */
function isSpread(node, predicate) {
	return isNode(node) && node.type === 'SpreadElement' && predicate(node.argument);
}

/** @param {unknown} node */
function staticPropertyName(node) {
	if (!isNode(node) || node.computed === true) return null;
	if (isNode(node.key) && node.key.type === 'Identifier') return node.key.name;
	if (
		isNode(node.key) &&
		node.key.type === 'Literal' &&
		(typeof node.key.value === 'string' || typeof node.key.value === 'number')
	) {
		return String(node.key.value);
	}
	return null;
}

/** @param {unknown} node */
function isCanonicalHostDefault(node) {
	return (
		isNode(node) &&
		node.type === 'Property' &&
		node.kind === 'init' &&
		node.method !== true &&
		staticPropertyName(node) === node.value?.value &&
		isNode(node.value) &&
		node.value.type === 'Literal' &&
		typeof node.value.value === 'string'
	);
}

/**
 * Match the map used for markdown host fallbacks:
 * `{ h1: 'h1', ..._provideComponents(), ...props.components }`.
 *
 * @param {unknown} node
 * @param {boolean} hasProvider
 */
function isCanonicalHostComponentMap(node, hasProvider) {
	if (!isNode(node) || node.type !== 'ObjectExpression' || !Array.isArray(node.properties)) {
		return false;
	}
	const properties = node.properties;
	const tailLength = hasProvider ? 2 : 1;
	if (properties.length <= tailLength) return false;
	const providerIndex = properties.length - 2;
	if (hasProvider && !isSpread(properties[providerIndex], isProviderCall)) return false;
	if (!isSpread(properties.at(-1), isPropsComponents)) return false;
	return properties.slice(0, -tailLength).every(isCanonicalHostDefault);
}

/**
 * Match the map used for named MDX components and the optional layout.
 * Provider-less output uses `props.components || {}` instead of spreads.
 *
 * @param {unknown} node
 * @param {boolean} hasProvider
 */
function isCanonicalProvidedComponentMap(node, hasProvider) {
	if (!hasProvider) {
		return (
			isNode(node) &&
			node.type === 'LogicalExpression' &&
			node.operator === '||' &&
			isPropsComponents(node.left) &&
			isEmptyObject(node.right)
		);
	}
	return (
		isNode(node) &&
		node.type === 'ObjectExpression' &&
		Array.isArray(node.properties) &&
		node.properties.length === 2 &&
		isSpread(node.properties[0], isProviderCall) &&
		isSpread(node.properties[1], isPropsComponents)
	);
}

/** @param {unknown} pattern */
function simpleDestructuredBindings(pattern) {
	if (!isNode(pattern) || pattern.type !== 'ObjectPattern' || !Array.isArray(pattern.properties)) {
		return null;
	}
	const bindings = [];
	for (const property of pattern.properties) {
		if (
			!isNode(property) ||
			property.type !== 'Property' ||
			property.kind !== 'init' ||
			property.method === true ||
			staticPropertyName(property) === null ||
			!isNode(property.value) ||
			property.value.type !== 'Identifier'
		) {
			return null;
		}
		bindings.push({ key: staticPropertyName(property), local: property.value.name });
	}
	return bindings;
}

/** @param {unknown} node @param {string} name */
function isPropsParameter(node, name) {
	if (!isNode(node)) return false;
	if (name === MDX_BODY_NAME) return isIdentifier(node, 'props');
	return (
		node.type === 'AssignmentPattern' &&
		isIdentifier(node.left, 'props') &&
		isEmptyObject(node.right)
	);
}

/** @param {EstreeNode} tree @param {string} source */
function hasCanonicalProviderImport(tree, source) {
	if (tree.type !== 'Program' || !Array.isArray(tree.body)) return false;
	return tree.body.some(
		(statement) =>
			isNode(statement) &&
			statement.type === 'ImportDeclaration' &&
			statement.source?.value === source &&
			Array.isArray(statement.specifiers) &&
			statement.specifiers.some(
				(specifier) =>
					isNode(specifier) &&
					specifier.type === 'ImportSpecifier' &&
					isIdentifier(specifier.local, MDX_PROVIDER_NAME) &&
					(isIdentifier(specifier.imported, 'useMDXComponents') ||
						specifier.imported?.value === 'useMDXComponents'),
			),
	);
}

/** @param {EstreeNode} tree @param {string} name */
function findGeneratedFunction(tree, name) {
	if (tree.type !== 'Program' || !Array.isArray(tree.body)) return null;
	for (const statement of tree.body) {
		const declaration =
			isNode(statement) && statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: statement;
		if (
			isNode(declaration) &&
			declaration.type === 'FunctionDeclaration' &&
			isIdentifier(declaration.id, name) &&
			Array.isArray(declaration.params) &&
			declaration.params.length === 1 &&
			isPropsParameter(declaration.params[0], name) &&
			isNode(declaration.body) &&
			declaration.body.type === 'BlockStatement'
		) {
			return declaration;
		}
	}
	return null;
}

/**
 * @param {EstreeNode} tree
 * @param {string | null} provider
 * @returns {Array<{ owner: string, local: string, members?: boolean }>}
 */
function collectMdxExternalComponentBindings(tree, provider) {
	const hasProvider = provider !== null;
	if (hasProvider && !hasCanonicalProviderImport(tree, provider)) return [];
	const descriptors = [];
	const seen = new Set();
	const add = (owner, local, members = false) => {
		const key = `${owner}:${local}:${members}`;
		if (seen.has(key)) return;
		seen.add(key);
		descriptors.push(members ? { owner, local, members: true } : { owner, local });
	};

	for (const owner of [MDX_BODY_NAME, MDX_CONTENT_NAME]) {
		const fn = findGeneratedFunction(tree, owner);
		if (fn === null) continue;
		for (const statement of fn.body.body ?? []) {
			if (
				!isNode(statement) ||
				statement.type !== 'VariableDeclaration' ||
				statement.kind !== 'const'
			) {
				continue;
			}
			for (const declaration of statement.declarations ?? []) {
				if (!isNode(declaration) || declaration.type !== 'VariableDeclarator') continue;
				if (
					owner === MDX_BODY_NAME &&
					isIdentifier(declaration.id, MDX_COMPONENTS_NAME) &&
					isCanonicalHostComponentMap(declaration.init, hasProvider)
				) {
					add(owner, MDX_COMPONENTS_NAME, true);
					continue;
				}
				if (!isCanonicalProvidedComponentMap(declaration.init, hasProvider)) continue;
				const bindings = simpleDestructuredBindings(declaration.id);
				if (bindings === null) continue;
				if (owner === MDX_CONTENT_NAME) {
					if (
						bindings.length === 1 &&
						bindings[0].key === 'wrapper' &&
						bindings[0].local === MDX_LAYOUT_NAME
					) {
						add(owner, MDX_LAYOUT_NAME);
					}
					continue;
				}
				for (const binding of bindings) add(owner, binding.local);
			}
		}
	}
	return descriptors;
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
