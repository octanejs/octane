// /playground — write TSRX (or TSX) on the left, and on the right either the
// LIVE rendered app or the compiled output, switchable with a tab. The
// compiled pane has two modes: AST (parsed source, type transform, and exact
// emitted client/server/type-output trees) and TYPES (the typed virtual TSX
// the IDE language service sees via `octane/compiler/volar`). Hovering or
// selecting source reveals the corresponding AST node where the compiler has
// a mapping; hovering a tree node highlights its source origin. Types uses
// the Volar token mappings bidirectionally (see playground-mapping.ts). The
// whole pipeline runs in the browser: `octane/compiler` (and sucrase for
// React-host `.react.tsx` files) compiles the virtual files on a debounce, the
// module graph executes inside a SANDBOXED IFRAME with an opaque origin (see
// src/lib/playground.ts + playground-modules.ts + playground-sandbox.ts —
// never in this page), and CodeMirror highlights through Shiki with the real
// TSRX TextMate grammar (src/lib/shiki-codemirror.ts). Editors, panels, and
// the preview canvas all follow the site's light/dark theme.
//
// Everything editor-related boots in an effect (dynamic imports), so SSR
// renders just the static shell and hydration stays clean. A workspace is a
// set of virtual files with an entry; each language mode keeps its own
// workspace — switching modes round-trips your edits. The Examples dropdown
// loads curated workspaces (src/lib/playground-examples.ts); editing any file
// flips it to “Custom”. The active workspace persists into `location.hash`
// (debounced) so playground states are shareable links, and the Format button
// runs client-side Prettier (src/lib/playground-format.ts).
//
// Shared links are UNTRUSTED input: a hash payload is decoded into the editor
// and compiled (source + compiled output are safe to display — compilation is
// pure string work), but it does NOT execute — even in the sandbox — until the
// visitor explicitly presses "Run" on the consent overlay. Your own edits from
// the default sources auto-run as before.
import { useState, useRef, useEffect } from 'octane';
import type { CompileDiagnostic } from 'octane/compiler';
import type { PlaygroundLang } from '../../lib/playground.ts';
import {
	decodePlaygroundHash,
	encodePlaygroundHash,
	MAX_PLAYGROUND_SOURCE_LENGTH,
	PLAYGROUND_SOURCE_LIMIT_ERROR,
} from '../../lib/playground-hash.ts';
import { EXAMPLES, CUSTOM_EXAMPLE_ID, DEFAULT_EXAMPLE_ID } from '../../lib/playground-examples.ts';
import { useTitle } from '../../hooks/use-title.ts';

const HASH_DEBOUNCE_MS = 400;
const COMPILE_DEBOUNCE_MS = 250;

// sessionStorage record of the last hash THIS tab wrote (plus the example it
// came from). A payload matching it is the visitor's own work surviving a
// reload or route remount — restored without the shared-code consent gate.
// sessionStorage is same-origin and per-tab, so a link someone sends can never
// pre-seed it.
const OWN_HASH_STORAGE_KEY = 'octane-playground-own-hash';

// Static dropdown structure — examples grouped into <optgroup>s in
// declaration order.
const EXAMPLE_GROUPS: { group: string; examples: typeof EXAMPLES }[] = [];
for (const example of EXAMPLES) {
	const bucket = EXAMPLE_GROUPS.find((candidate) => candidate.group === example.group);
	if (bucket) bucket.examples.push(example);
	else EXAMPLE_GROUPS.push({ group: example.group, examples: [example] });
}

export function Playground() @{
	useTitle('Octane — Playground');
	const [lang, setLang] = useState<PlaygroundLang>('tsrx');
	const [view, setView] = useState<'preview' | 'compiled'>('preview');
	// Which compiler artifact the right pane shows.
	const [compiledMode, setCompiledMode] = useState<'ast' | 'types'>('ast');
	const [astStage, setAstStage] = useState<
		'source' | 'type-transform' | 'type-output' | 'client-output' | 'server-output'
	>('source');
	// Mobile only: which panel is visible (desktop always shows both).
	const [pane, setPane] = useState<'editor' | 'result'>('editor');
	const [error, setError] = useState('');
	const [warnings, setWarnings] = useState<CompileDiagnostic[]>([]);
	const [ready, setReady] = useState(false);
	const [formatting, setFormatting] = useState(false);
	// True while a hash-shared payload is loaded but not yet approved to run.
	const [gated, setGated] = useState(false);
	const [exampleId, setExampleId] = useState<string>(DEFAULT_EXAMPLE_ID);
	const [files, setFiles] = useState<string[]>([]);
	const [activeFile, setActiveFile] = useState('');
	// Which language variants the current selection offers (drives the toggle).
	const [variants, setVariants] = useState<Record<PlaygroundLang, boolean>>({
		tsrx: true,
		tsx: true,
	});

	const sourceHostRef = useRef<HTMLDivElement | null>(null);
	const outputHostRef = useRef<HTMLDivElement | null>(null);
	const astHostRef = useRef<HTMLDivElement | null>(null);
	const previewHostRef = useRef<HTMLDivElement | null>(null);
	// The boot closure runs once, so it can't read the view/mode STATE — this
	// ref mirrors it (updated by the same handlers that set state) for the
	// closure's output-refresh and position-mapping paths.
	const resultModeRef = useRef<{
		view: 'preview' | 'compiled';
		compiledMode: 'ast' | 'types';
		astStage: 'source' | 'type-transform' | 'type-output' | 'client-output' | 'server-output';
	}>({
		view: 'preview',
		compiledMode: 'ast',
		astStage: 'source',
	});
	// Imperative bridge into the boot closure below — populated once the editor
	// stack has loaded; the toolbar buttons (and the consent overlay's Run
	// button) call through it.
	const controllerRef = useRef<{
		switchLang?: (next: PlaygroundLang) => void;
		selectExample?: (id: string) => void;
		selectFile?: (name: string) => void;
		formatActive?: () => void;
		approveRun?: () => void;
		syncOutput?: () => void;
	}>({});

	const selectView = (next: 'preview' | 'compiled') => {
		setView(next);
		resultModeRef.current.view = next;
		controllerRef.current.syncOutput?.();
	};
	const selectCompiledMode = (next: 'ast' | 'types') => {
		setCompiledMode(next);
		resultModeRef.current.compiledMode = next;
		controllerRef.current.syncOutput?.();
	};
	const selectAstStage = (next: typeof astStage) => {
		setAstStage(next);
		resultModeRef.current.astStage = next;
		controllerRef.current.syncOutput?.();
	};

	useEffect(() => {
		const sourceHost = sourceHostRef.current;
		const outputHost = outputHostRef.current;
		const astHost = astHostRef.current;
		const previewHost = previewHostRef.current;
		if (!sourceHost || !outputHost || !astHost || !previewHost) return;

		let disposed = false;
		let sourceView: any;
		let outputView: any;
		let astPreview: any;
		let preview: any = null;
		let compileDebounceId = 0;
		let hashDebounceId = 0;
		// Validate the URL payload before loading CodeMirror, Shiki, or the
		// compiler. Oversized input is ignored in favor of the bounded defaults.
		const rawHash = window.location.hash.slice(1);
		const hashResult = decodePlaygroundHash(rawHash);
		const initial = hashResult.ok ? hashResult.value : null;
		const initialDiagnostic = hashResult.ok ? '' : hashResult.error;
		if (initialDiagnostic) setError(initialDiagnostic);

		(async () => {
			let stateMod: any, commandsMod: any, viewMod: any, shikiMod: any, pg: any, pgModules: any;
			let pgExamples: any, pgMapping: any, pgAst: any;
			try {
				[stateMod, commandsMod, viewMod, shikiMod, pg, pgModules, pgExamples, pgMapping, pgAst] =
					await Promise.all([
						import('@codemirror/state'),
						import('@codemirror/commands'),
						import('@codemirror/view'),
						import('../../lib/shiki-codemirror.ts'),
						import('../../lib/playground.ts'),
						import('../../lib/playground-modules.ts'),
						import('../../lib/playground-examples.ts'),
						import('../../lib/playground-mapping.ts'),
						import('../../lib/playground-ast.ts'),
					]);
			} catch (bootError) {
				// A load failure after unmount (e.g. a test env torn down mid-import)
				// must not become an unhandled rejection; while mounted, surface it.
				if (!disposed) {
					setError(bootError instanceof Error ? bootError.message : String(bootError));
				}
				return;
			}
			if (disposed) return;

			const { EditorState, Compartment, StateEffect, StateField } = stateMod;
			const { history, defaultKeymap, historyKeymap, indentWithTab } = commandsMod;
			const {
				EditorView,
				keymap,
				lineNumbers,
				highlightActiveLine,
				drawSelection,
				Decoration,
			} = viewMod;
			const { shikiHighlight } = shikiMod;

			type Workspace = { files: { name: string; source: string }[]; entry: string };

			const cloneWorkspace = (workspace: Workspace): Workspace => ({
				entry: workspace.entry,
				files: workspace.files.map((file: { name: string; source: string }) => ({ ...file })),
			});

			let currentLang: PlaygroundLang = initial?.lang ?? 'tsrx';
			let currentExampleId: string = initial ? CUSTOM_EXAMPLE_ID : DEFAULT_EXAMPLE_ID;
			const workspaces: Partial<Record<PlaygroundLang, Workspace>> = {
				tsrx: cloneWorkspace(pgExamples.DEFAULT_WORKSPACES.tsrx),
				tsx: cloneWorkspace(pgExamples.DEFAULT_WORKSPACES.tsx),
			};
			// A hash payload is someone else's code — display + compile it, but
			// gate EXECUTION behind the consent overlay's Run button. Two payloads
			// carry nothing new and stay ungated: one byte-equal to the default
			// workspace, and one this tab wrote itself (the sessionStorage record —
			// your own work surviving a reload or route remount).
			const readOwnHash = (): { hash: string; exampleId: string } | null => {
				try {
					const stored = window.sessionStorage.getItem(OWN_HASH_STORAGE_KEY);
					if (!stored) return null;
					const parsed = JSON.parse(stored);
					return typeof parsed?.hash === 'string' && typeof parsed?.exampleId === 'string'
						? parsed
						: null;
				} catch {
					return null;
				}
			};
			let executionGated = false;
			if (initial) {
				workspaces[currentLang] = { entry: initial.entry, files: initial.files };
				const fallback = pgExamples.DEFAULT_WORKSPACES[currentLang];
				const isDefault =
					initial.files.length === 1 && initial.entry === fallback.entry &&
						initial.files[0].name === fallback.files[0].name &&
						initial.files[0].source === fallback.files[0].source;
				const own = readOwnHash();
				if (isDefault) {
					currentExampleId = DEFAULT_EXAMPLE_ID;
				} else if (own && own.hash === rawHash) {
					currentExampleId = pgExamples.getExample(own.exampleId)
						? own.exampleId
						: CUSTOM_EXAMPLE_ID;
				} else {
					executionGated = true;
					setGated(true);
				}
			}
			let currentFile = workspaces[currentLang]!.entry;

			const workspace = (): Workspace => workspaces[currentLang]!;
			const fileSource = (name: string): string =>
				workspace().files.find((file: { name: string }) => file.name === name)?.source ?? '';

			// Which language variants the current selection can switch to: an
			// example offers exactly its declared variants; “Custom” keeps both
			// modes live (a missing side lazily starts from the default counter).
			const variantAvailability = (): Record<PlaygroundLang, boolean> => {
				if (currentExampleId === CUSTOM_EXAMPLE_ID) return { tsrx: true, tsx: true };
				const example = pgExamples.getExample(currentExampleId);
				if (!example) return { tsrx: true, tsx: true };
				return { tsrx: example.variants.tsrx != null, tsx: example.variants.tsx != null };
			};

			const publishWorkspaceState = () => {
				setLang(currentLang);
				setExampleId(currentExampleId);
				setFiles(workspace().files.map((file: { name: string }) => file.name));
				setActiveFile(currentFile);
				setVariants(variantAvailability());
			};

			// Theme-variable canvas: the same custom properties the rest of the
			// site swaps per `data-theme`, so both editors follow the ThemeToggle
			// live (token colors flip through the dual-theme .cm-shiki rules).
			const sharedTheme = EditorView.theme({
				'&': {
					height: '100%',
					backgroundColor: 'var(--code-bg)',
					color: 'var(--text)',
					fontSize: '0.85rem',
				},
				'.cm-scroller': {
					overflow: 'auto',
					fontFamily: 'ui-monospace, SFMono-Regular, \'SF Mono\', Menlo, Consolas, \'Liberation Mono\', monospace',
				},
				'.cm-content': { padding: '1rem 0.25rem 1.25rem' },
				'.cm-gutters': {
					backgroundColor: 'var(--code-bg)',
					color: 'var(--text-secondary)',
					border: 'none',
					opacity: '0.7',
				},
				'.cm-activeLine, .cm-activeLineGutter': {
					backgroundColor: 'var(--surface)',
				},
				'.cm-selectionBackground': {
					backgroundColor: 'rgba(56, 139, 253, 0.35) !important',
				},
				'.cm-cursor': { borderLeftColor: 'var(--text)' },
			});

			preview = pg.createPreview(previewHost, (message: string) => {
				if (!disposed) setError(message);
			});

			const replaceDoc = (view: any, doc: string) => {
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
			};

			// name → { source, code, volarMappings, mapping } — the types view is
			// generated on demand for the active file only, keyed by the exact
			// source. Raw volar mappings are kept so the CodeMapping is built
			// lazily on first Types navigation.
			const typesCache = new Map<
				string,
				{ source: string; code: string; volarMappings: any; mapping: any }
			>();
			type AstEntry = {
				source: string;
				ast: unknown;
				space: 'source' | 'generated';
				label: string;
				notice: string;
				code?: string;
				volarMappings?: any;
				map?: unknown;
				mapping?: any;
			};
			const astCache = new Map<string, AstEntry>();
			const astCacheKey = (name: string) => name + '::' + resultModeRef.current.astStage;

			const typesEntry = (name: string) => {
				const source = fileSource(name);
				const cached = typesCache.get(name);
				if (cached && cached.source === source) return cached;
				let entry: { source: string; code: string; volarMappings: any; mapping: any };
				if (pgModules.isReactHostFile(name)) {
					entry = {
						source,
						code: '// Types output covers Octane files (.tsrx / .tsx).\n// ' + name +
							' is a React-host file compiled with sucrase, so it has no typed virtual TSX.',
						volarMappings: null,
						mapping: null,
					};
				} else {
					const result = pg.compileTypes(source, name);
					entry = result.ok
						? { source, code: result.code, volarMappings: result.mappings, mapping: undefined }
						: {
								source,
								code: '// Types generation failed:\n// ' + result.error,
								volarMappings: null,
								mapping: null,
							};
				}
				typesCache.set(name, entry);
				return entry;
			};
			type AstEntryResult = { entry: AstEntry | null; error: string | null };
			const astEntry = (name: string): AstEntryResult => {
				if (pgModules.isReactHostFile(name)) return { entry: null, error: null };
				const source = fileSource(name);
				const key = astCacheKey(name);
				const cached = astCache.get(key);
				if (cached && cached.source === source) return { entry: cached, error: null };
				const result = pg.compileAst(source, name, resultModeRef.current.astStage);
				if (!result.ok) {
					return { entry: null, error: `AST generation failed: ${result.error}` };
				}
				const entry: AstEntry = {
					source,
					ast: result.ast,
					space: result.space,
					label: result.label,
					notice: result.notice,
					code: result.code,
					volarMappings: result.mappings,
					map: result.map,
					mapping: undefined,
				};
				astCache.set(key, entry);
				return { entry, error: null };
			};

			// The exact string the output editor currently displays. The output
			// view is read-only and written ONLY here, so this makes both the
			// refresh no-op check and activeMapping's staleness check a string
			// reference compare instead of an O(doc) toString per call.
			const OUTPUT_PLACEHOLDER = '// Types output appears here.';
			let lastShownOutput = OUTPUT_PLACEHOLDER;
			let lastShownAst: object | null = null;
			const showOutput = (): string | null => {
				// The compiled pane is not visible: skip entirely — no types
				// generation, no doc replacement, and (the dominant cost) no Shiki
				// re-tokenize of the output document. syncOutput re-runs this when
				// the pane is revealed, so it refreshes exactly once, on demand.
				if (resultModeRef.current.view !== 'compiled') return null;
				if (resultModeRef.current.compiledMode === 'ast') {
					const { entry, error } = astEntry(currentFile);
					if (entry && entry !== lastShownAst) {
						astPreview.setAst(entry.ast, currentFile, {
							label: entry.label,
							notice: entry.notice,
						});
						lastShownAst = entry;
					} else if (!entry) {
						const message = pgModules.isReactHostFile(currentFile)
							? 'AST trace covers Octane-owned .tsrx and .tsx files. React-host files use the separate Sucrase pipeline.'
							: 'AST generation failed. Fix the source to generate a new tree.';
						astPreview.setUnavailable(message, currentFile);
						lastShownAst = null;
					}
					clearMappedPair();
					astPreview.clear();
					setError(error || '');
					return error;
				}
				const code = typesEntry(currentFile).code;
				// AST and Types highlights describe different artifacts. Clear the
				// pair even when the cached Types document needs no replacement.
				clearMappedPair();
				astPreview.clear();
				// Clear any stale error from a previous stage/mode.
				setError('');
				if (typeof code !== 'string' || code === lastShownOutput) return null;
				replaceDoc(outputView, code);
				lastShownOutput = code;
				// The output half of the pair changed — source marks were computed
				// against the previous artifact (the output field self-cleared via
				// its own doc change just now).
				clearMappedIn(sourceView);
				return null;
			};

			// ── Source ↔ output position mapping ─────────────────────────────
			// Placing the cursor in one editor highlights and reveals the mapped
			// ranges in the other (see playground-mapping.ts for the semantics).
			// Marks are only valid for the exact (source doc, output doc) PAIR
			// they were computed against, so a change to either side must clear
			// BOTH editors: each field self-clears on its own doc change, and
			// clearMappedIn handles the cross-editor half (a source edit leaves
			// output marks orphaned — visibly so when a broken edit means no
			// recompile ever replaces the output doc — and setState doc swaps
			// produce no transaction at all).
			const setMapped = StateEffect.define();
			const mappedMark = Decoration.mark({ class: 'cm-mapped' });
			const mappedField = StateField.define({
				create: () => Decoration.none,
				update(value: any, tr: any) {
					for (const effect of tr.effects) if (effect.is(setMapped)) return effect.value;
					// Any edit (or an output refresh) invalidates the offsets.
					return tr.docChanged ? Decoration.none : value;
				},
				provide: (field: any) => EditorView.decorations.from(field),
			});
			// Per-keystroke safe: one O(1) field-size read, and a transaction is
			// dispatched only when marks actually exist to clear.
			const clearMappedIn = (targetView: any) => {
				if (targetView.state.field(mappedField, false)?.size) {
					targetView.dispatch({ effects: setMapped.of(Decoration.none) });
				}
			};

			// The mapping for the visible artifact, or null when navigation must
			// stay off: preview mode, no mappings (React-host files), or offsets
			// that no longer describe what's on screen (edits inside the compile
			// debounce, a failed recompile leaving a stale pane). This runs per
			// user cursor move, so it is O(1): cached artifacts are consulted,
			// never generated (typesEntry runs solely inside showOutput), and
			// both staleness checks are reference compares — the workspace file
			// source tracks every edit, and lastShownOutput mirrors the pane.
			// Only the first navigation against a fresh artifact builds the
			// CodeMapping (undefined = not built, null = built, none available).
			const activeAstEntry = (): AstEntry | null => {
				if (
					resultModeRef.current.view !== 'compiled' || resultModeRef.current.compiledMode !== 'ast'
				) return null;
				const entry = astCache.get(astCacheKey(currentFile));
				return entry && entry.source === fileSource(currentFile) && entry === lastShownAst
					? entry
					: null;
			};
			const activeMapping = () => {
				if (resultModeRef.current.view !== 'compiled') return null;
				if (resultModeRef.current.compiledMode === 'types') {
					const entry = typesCache.get(currentFile);
					if (!entry || entry.source !== fileSource(currentFile)) return null;
					if (entry.code !== lastShownOutput) return null;
					if (entry.mapping === undefined) {
						entry.mapping = pgMapping.mappingFromVolar(entry.volarMappings);
					}
					return entry.mapping;
				}
				const entry = activeAstEntry();
				if (!entry || entry.space !== 'generated') return null;
				if (entry.mapping === undefined) {
					entry.mapping = entry.volarMappings
						? pgMapping.mappingFromVolar(entry.volarMappings)
						: pgMapping.mappingFromSourceMap(entry.map, entry.source, entry.code ?? '');
				}
				return entry.mapping;
			};

			const revealRanges = (
				targetView: any,
				ranges: { from: number; to: number }[],
				scroll: boolean,
			) => {
				const limit = targetView.state.doc.length;
				const clamped = ranges.filter((range: { from: number }) => range.from < limit).map(
					(range: { from: number; to: number }) => ({
						from: range.from,
						to: Math.min(range.to, limit),
					}),
				);
				if (clamped.length === 0) {
					// Same contract as an unmapped position: no lingering marks.
					clearMappedIn(targetView);
					return;
				}
				const effects = [
					setMapped.of(
						Decoration.set(
							clamped.map(
								(range: { from: number; to: number }) => mappedMark.range(range.from, range.to),
							),
						),
					),
				];
				if (scroll) effects.push(EditorView.scrollIntoView(clamped[0].from, { y: 'center' }));
				targetView.dispatch({ effects });
			};

			const mappedPair = (side: 'source' | 'output', offset: number) => {
				const mapping = activeMapping();
				if (!mapping) return null;
				return side === 'source'
					? mapping.pairFromSource(offset)
					: mapping.pairFromGenerated(offset);
			};
			const clearMappedPair = () => {
				clearMappedIn(sourceView);
				clearMappedIn(outputView);
			};
			const revealPair = (
				pair: { source: { from: number; to: number }[]; output: { from: number; to: number }[] },
				scrollSide: 'source' | 'output' | null,
			) => {
				revealRanges(sourceView, pair.source, scrollSide === 'source');
				revealRanges(outputView, pair.output, scrollSide === 'output');
			};
			const revealAstRange = (range: { from: number; to: number } | null, scroll: boolean) => {
				if (resultModeRef.current.compiledMode !== 'ast') return;
				const entry = activeAstEntry();
				if (!range || !entry) {
					clearMappedPair();
					return;
				}
				clearMappedIn(outputView);
				if (entry.space === 'source') {
					revealRanges(sourceView, [range], scroll);
					return;
				}
				const sourceRanges = activeMapping()?.toSourceRange(range.from, range.to) ?? null;
				if (sourceRanges) revealRanges(sourceView, sourceRanges, scroll);
				else clearMappedIn(sourceView);
			};

			astPreview = pgAst.createAstPreview(astHost, {
				onNodeRange: revealAstRange,
			});

			const crossNavigate = (side: 'source' | 'output') => EditorView.updateListener.of((
				update: any,
			) => {
				if (!update.selectionSet || update.docChanged) return;
				// Only user-driven cursor moves navigate — programmatic dispatches
				// (doc replacement, highlight effects) must not feed back.
				if (!update.transactions.some((tr: any) => tr.isUserEvent('select'))) return;
				if (resultModeRef.current.view !== 'compiled') return;
				const offset = update.state.selection.main.head;
				if (resultModeRef.current.compiledMode === 'ast' && side === 'source') {
					const entry = activeAstEntry();
					if (entry?.space === 'source') astPreview.reveal(offset, true);
					else {
						const generated = activeMapping()?.toGenerated(offset);
						if (generated) astPreview.reveal(generated[0].from, true);
						else {
							astPreview.clear();
							clearMappedPair();
						}
					}
					return;
				}
				const pair = mappedPair(side, offset);
				// Marks reflect the CURRENT selection — an unmapped one clears.
				if (pair) revealPair(pair, side === 'source' ? 'output' : 'source');
				else clearMappedPair();
			});

			// Hovering either document highlights the corresponding ranges without moving its scroll
			// position; clicking/cursor movement above additionally reveals them.
			const crossHover = (side: 'source' | 'output') => EditorView.domEventObservers({
				mousemove(event: MouseEvent, view: any) {
					if (resultModeRef.current.view !== 'compiled') return;
					const offset = view.posAtCoords({ x: event.clientX, y: event.clientY });
					if (resultModeRef.current.compiledMode === 'ast' && side === 'source') {
						const entry = activeAstEntry();
						if (offset == null || !entry) clearMappedPair();
						else if (entry.space === 'source') astPreview.reveal(offset, false);
						else {
							const generated = activeMapping()?.toGenerated(offset);
							if (generated) astPreview.reveal(generated[0].from, false);
							else {
								astPreview.clear();
								clearMappedPair();
							}
						}
						return;
					}
					const pair =
						offset == null ? null : mappedPair(side, offset);
					if (pair) revealPair(pair, null);
					else clearMappedPair();
				},
				mouseleave() {
					clearMappedPair();
					astPreview.clear();
				},
			});

			let compileSeq = 0;
			const compileAndRun = async () => {
				if (disposed) return;
				const seq = ++compileSeq;
				const { files: wsFiles, entry } = workspace();
				const total = wsFiles.reduce(
					(sum: number, file: { source: string }) => sum + file.source.length,
					0,
				);
				if (total > MAX_PLAYGROUND_SOURCE_LENGTH) {
					setWarnings([]);
					setError(PLAYGROUND_SOURCE_LIMIT_ERROR);
					return;
				}
				const graph = await pgModules.buildModuleGraph(wsFiles, entry);
				if (disposed || seq !== compileSeq) return;
				// AST and Types describe the active source file, independently of
				// whether another workspace file prevents the runnable module graph
				// from compiling. Refresh inspection before handling graph failure.
				const inspectionError = showOutput();
				if (!graph.ok) {
					setWarnings([]);
					setError(pg.resolvePlaygroundError(graph.error, inspectionError));
					return;
				}
				setWarnings(
					graph.warnings.map((warning: { diagnostic: CompileDiagnostic }) => warning.diagnostic),
				);
				setError(pg.resolvePlaygroundError(null, inspectionError));
				// While a shared payload is gated, everything except EXECUTION
				// happens — the visitor can inspect source and compiled output.
				if (executionGated) return;
				void preview.run(graph).then((r: { error: string | null }) => {
					if (!disposed && r.error) setError(r.error);
				});
			};

			const scheduleCompile = () => {
				window.clearTimeout(compileDebounceId);
				compileDebounceId = window.setTimeout(() => {
					void compileAndRun();
				}, COMPILE_DEBOUNCE_MS);
			};

			// replaceState (not router.navigate) — only the hash on the current
			// entry changes; the router observes it through its history wrapper
			// without remounting the route. While a shared payload is still
			// gated, the URL keeps the sender's link untouched.
			const updateHash = () => {
				window.clearTimeout(hashDebounceId);
				hashDebounceId = window.setTimeout(() => {
					if (executionGated) return;
					const { files: wsFiles, entry } = workspace();
					const encoded = encodePlaygroundHash({
						lang: currentLang,
						entry,
						files: wsFiles,
					});
					if (!encoded) return;
					window.history.replaceState(null, '', '#' + encoded);
					try {
						window.sessionStorage.setItem(
							OWN_HASH_STORAGE_KEY,
							JSON.stringify({ hash: encoded, exampleId: currentExampleId }),
						);
					} catch {
						// Storage full/unavailable — sharing still works, only the
						// reload-without-consent nicety is lost.
					}
				}, HASH_DEBOUNCE_MS);
			};

			// One writable EditorView; each file keeps its own EditorState (undo
			// history included), keyed per variant so mode switches round-trip.
			const editorStates = new Map<string, any>();
			const stateKey = (name: string) => currentLang + ':' + name;
			const grammarFor = (name: string) => (name.endsWith('.tsrx') ? 'tsrx' : 'tsx');

			const makeEditorState = (name: string, doc: string) => EditorState.create({
				doc,
				extensions: [
					EditorState.changeFilter.of((transaction: any) => {
						if (!transaction.docChanged) return true;
						const others = workspace().files.reduce(
							(sum: number, file: { name: string; source: string }) => file.name === currentFile
								? sum
								: sum + file.source.length,
							0,
						);
						if (others + transaction.newDoc.length <= MAX_PLAYGROUND_SOURCE_LENGTH) {
							return true;
						}
						setError(PLAYGROUND_SOURCE_LIMIT_ERROR);
						return false;
					}),
					lineNumbers(),
					history(),
					drawSelection(),
					highlightActiveLine(),
					keymap.of([
						{
							key: 'Mod-Shift-f',
							run: () => {
								controllerRef.current.formatActive?.();
								return true;
							},
						},
						...defaultKeymap,
						...historyKeymap,
						indentWithTab,
					]),
					EditorView.lineWrapping,
					EditorState.tabSize.of(2),
					shikiHighlight(grammarFor(name)),
					sharedTheme,
					mappedField,
					crossHover('source'),
					crossNavigate('source'),
					EditorView.updateListener.of((update: any) => {
						if (!update.docChanged) return;
						// The source half of the pair changed — orphan any marks still
						// shown in the output (this field self-clears; a failed
						// recompile would otherwise leave the output's marks forever).
						clearMappedIn(outputView);
						if (resultModeRef.current.compiledMode === 'ast') {
							astPreview.setUnavailable('Waiting for the next successful compile…', currentFile);
							lastShownAst = null;
						}
						const next = update.state.doc.toString();
						const file = workspace().files.find(
							(candidate: { name: string }) => candidate.name === currentFile,
						);
						if (file) file.source = next;
						// Any edit means the buffer no longer matches the example.
						if (currentExampleId !== CUSTOM_EXAMPLE_ID) {
							currentExampleId = CUSTOM_EXAMPLE_ID;
							setExampleId(CUSTOM_EXAMPLE_ID);
							setVariants(variantAvailability());
						}
						scheduleCompile();
						updateHash();
					}),
				],
			});

			const openFile = (name: string) => {
				editorStates.set(stateKey(currentFile), sourceView.state);
				currentFile = name;
				const existing = editorStates.get(stateKey(name));
				sourceView.setState(existing ?? makeEditorState(name, fileSource(name)));
				// setState fires no transaction: a restored state may carry marks
				// from an old pair, and the output's marks belong to the old file.
				clearMappedIn(sourceView);
				clearMappedIn(outputView);
				setActiveFile(name);
				showOutput();
			};

			sourceView = new EditorView({
				state: makeEditorState(currentFile, fileSource(currentFile)),
				parent: sourceHost,
			});

			outputView = new EditorView({
				state: EditorState.create({
					doc: OUTPUT_PLACEHOLDER,
					extensions: [
						lineNumbers(),
						EditorState.readOnly.of(true),
						EditorView.editable.of(false),
						EditorView.lineWrapping,
						shikiHighlight('tsx'),
						sharedTheme,
						mappedField,
						crossHover('output'),
						crossNavigate('output'),
					],
				}),
				parent: outputHost,
			});

			controllerRef.current.switchLang = (next) => {
				if (next === currentLang || disposed) return;
				if (!variantAvailability()[next]) return;
				editorStates.set(stateKey(currentFile), sourceView.state);
				if (!workspaces[next]) {
					const example =
						currentExampleId === CUSTOM_EXAMPLE_ID ? null : pgExamples.getExample(currentExampleId);
					const fromExample =
						example ? pgExamples.exampleWorkspace(example, next) : null;
					workspaces[next] = fromExample ?? cloneWorkspace(pgExamples.DEFAULT_WORKSPACES[next]);
				}
				currentLang = next;
				currentFile = workspace().files.some((file: { name: string }) => file.name === currentFile)
					? currentFile
					: workspace().entry;
				const existing = editorStates.get(stateKey(currentFile));
				sourceView.setState(existing ?? makeEditorState(currentFile, fileSource(currentFile)));
				clearMappedIn(sourceView);
				clearMappedIn(outputView);
				publishWorkspaceState();
				window.clearTimeout(compileDebounceId);
				void compileAndRun();
				updateHash();
			};

			controllerRef.current.selectExample = (id) => {
				if (disposed || id === CUSTOM_EXAMPLE_ID || id === currentExampleId) return;
				const example = pgExamples.getExample(id);
				if (!example) return;
				const nextLang: PlaygroundLang =
					example.variants[currentLang]
						? currentLang
						: example.variants.tsrx
							? 'tsrx'
							: 'tsx';
				currentExampleId = id;
				currentLang = nextLang;
				workspaces.tsrx = undefined;
				workspaces.tsx = undefined;
				workspaces[nextLang] = pgExamples.exampleWorkspace(example, nextLang);
				currentFile = workspace().entry;
				editorStates.clear();
				typesCache.clear();
				astCache.clear();
				sourceView.setState(makeEditorState(currentFile, fileSource(currentFile)));
				clearMappedIn(outputView);
				// Picking an example is the visitor's own action — never gated.
				executionGated = false;
				setGated(false);
				publishWorkspaceState();
				window.clearTimeout(compileDebounceId);
				void compileAndRun();
				updateHash();
			};

			controllerRef.current.selectFile = (name) => {
				if (disposed || name === currentFile) return;
				if (!workspace().files.some((file: { name: string }) => file.name === name)) return;
				openFile(name);
			};

			controllerRef.current.formatActive = () => {
				if (disposed) return;
				setFormatting(true);
				void (async () => {
					try {
						const { formatPlaygroundFile } = await import('../../lib/playground-format.ts');
						const source = sourceView.state.doc.toString();
						const result = await formatPlaygroundFile(currentFile, source);
						if (disposed) return;
						if (!result.ok) {
							setError(result.error);
							return;
						}
						if (result.code !== source) replaceDoc(sourceView, result.code);
					} finally {
						if (!disposed) setFormatting(false);
					}
				})();
			};

			controllerRef.current.approveRun = () => {
				if (disposed || !executionGated) return;
				executionGated = false;
				setGated(false);
				void compileAndRun();
				// The approved code is the visitor's own now — record it so a
				// reload doesn't re-gate it.
				updateHash();
			};

			controllerRef.current.syncOutput = () => {
				if (disposed) return;
				if (resultModeRef.current.view === 'compiled') {
					showOutput();
					return;
				}
				// Leaving the compiled view: marks pair with a pane no longer shown.
				clearMappedIn(sourceView);
				clearMappedIn(outputView);
			};

			publishWorkspaceState();
			void compileAndRun();
			if (initialDiagnostic) setError(initialDiagnostic);
			setReady(true);
		})();

		return () => {
			disposed = true;
			controllerRef.current.switchLang = undefined;
			controllerRef.current.selectExample = undefined;
			controllerRef.current.selectFile = undefined;
			controllerRef.current.formatActive = undefined;
			controllerRef.current.approveRun = undefined;
			controllerRef.current.syncOutput = undefined;
			window.clearTimeout(compileDebounceId);
			window.clearTimeout(hashDebounceId);
			sourceView?.destroy();
			outputView?.destroy();
			astPreview?.destroy();
			preview?.destroy();
		};
	}, []);

	<div class="pg">
		<div class="pg-toolbar">
			<div class="pg-toolbar-side">
				<select
					class="pg-select"
					aria-label="Example"
					disabled={!ready}
					value={exampleId}
					onChange={(e) => controllerRef.current.selectExample?.(e.currentTarget.value)}
				>
					{/* Static placeholder shown only while the buffer has diverged from
    every example — always in the DOM (no conditional rendering
    inside the select) so the option list never reconciles. */}
					<option value="custom" disabled hidden>Custom</option>
					@for (const group of EXAMPLE_GROUPS; key group.group) {
						<optgroup label={group.group}>
							@for (const example of group.examples; key example.id) {
								<option value={example.id}>{example.label as string}</option>
							}
						</optgroup>
					}
				</select>
				<div class="pg-seg" role="group" aria-label="Source language">
					<button
						type="button"
						class={['pg-seg-btn', lang === 'tsrx' && 'active']}
						disabled={!ready || !variants.tsrx}
						title={variants.tsrx ? undefined : 'This example has no TSRX variant'}
						onClick={() => controllerRef.current.switchLang?.('tsrx')}
					>
						TSRX
					</button>
					<button
						type="button"
						class={['pg-seg-btn', lang === 'tsx' && 'active']}
						disabled={!ready || !variants.tsx}
						title={variants.tsx ? undefined : 'This example has no TSX variant'}
						onClick={() => controllerRef.current.switchLang?.('tsx')}
					>
						TSX
					</button>
				</div>
				<button
					type="button"
					class="pg-format"
					disabled={!ready || formatting}
					title="Format with Prettier (Ctrl/Cmd-Shift-F)"
					onClick={() => controllerRef.current.formatActive?.()}
				>{(formatting ? 'Formatting…' : 'Format') as string}</button>
			</div>
			<div class="pg-seg" role="group" aria-label="Result view">
				<button
					type="button"
					class={['pg-seg-btn', view === 'preview' && 'active']}
					onClick={() => selectView('preview')}
				>
					Preview
				</button>
				<button
					type="button"
					class={['pg-seg-btn', view === 'compiled' && 'active']}
					onClick={() => selectView('compiled')}
				>
					Compiled
				</button>
			</div>
		</div>

		@if (error) {
			<div class="pg-error" role="alert">{error}</div>
		}
		@if (warnings.length > 0) {
			<section class="pg-warnings" aria-label="Compiler warnings" aria-live="polite">
				<strong>
					{warnings.length === 1 ? 'Compiler warning' : 'Compiler warnings'}
				</strong>
				<ul>
					@for (const warning of warnings; key warning.filename + ':' + warning.code + ':' +
						warning.start.offset) {
						<li>
							<code>{warning.code}</code>
							<span>{warning.message}</span>
							<span class="pg-warning-location">
								{warning.filename + ':' + warning.start.line + ':' + (warning.start.column + 1)}
							</span>
						</li>
					}
				</ul>
			</section>
		}

		<div class={['pg-grid', ready && 'ready']}>
			<section
				class={['pg-panel', pane !== 'editor' && 'mobile-hidden']}
				aria-label="Source editor"
			>
				<div class="pg-panel-head">
					@if (files.length > 1) {
						<div class="pg-tabs" role="tablist" aria-label="Playground files">
							@for (const name of files; key name) {
								<button
									type="button"
									role="tab"
									aria-selected={name === activeFile}
									class={['pg-tab', name === activeFile && 'active']}
									onClick={() => controllerRef.current.selectFile?.(name)}
								>{name as string}</button>
							}
						</div>
					} @else {
						<span>{'Source · ' + (activeFile || '…')}</span>
					}
					@if (!ready) {
						<span class="pg-loading">Loading editor…</span>
					}
				</div>
				<div class="pg-editor" ref={sourceHostRef} />
			</section>

			<section class={['pg-panel', pane !== 'result' && 'mobile-hidden']} aria-label="Result">
				<div class="pg-panel-head">
					<span>
						{view === 'preview'
							? 'Live preview'
							: (compiledMode === 'types' ? 'Types output · ' : 'AST output · ') +
								(activeFile || '…')}
					</span>
					@if (view === 'compiled') {
						<div class="pg-compiled-controls">
							@if (compiledMode === 'ast') {
								<select
									class="pg-ast-stage-select"
									aria-label="AST compiler stage"
									value={astStage}
									onChange={(event) => selectAstStage(event.currentTarget.value as typeof astStage)}
								>
									<option value="source">Parsed source</option>
									<option value="type-transform">Type transform</option>
									<option value="type-output">Types output</option>
									<option value="client-output">Client output</option>
									<option value="server-output">Server output</option>
								</select>
							}
							<div class="pg-seg pg-seg-sm" role="group" aria-label="Compiled output mode">
								<button
									type="button"
									class={['pg-seg-btn', compiledMode === 'ast' && 'active']}
									onClick={() => selectCompiledMode('ast')}
								>
									AST
								</button>
								<button
									type="button"
									class={['pg-seg-btn', compiledMode === 'types' && 'active']}
									onClick={() => selectCompiledMode('types')}
								>
									Types
								</button>
							</div>
						</div>
					}
				</div>
				<div class={['pg-result', view !== 'preview' && 'hidden']}>
					<div class="pg-preview" ref={previewHostRef} />
					@if (gated) {
						<div class="pg-consent" role="alertdialog" aria-label="Run shared code?">
							<div class="pg-consent-card">
								<strong>This link contains shared code.</strong>
								<p>
									It was written by whoever sent you this link. Review it in the editor (and the
									compiled output) — it runs in a sandbox, but only after you choose to run it.
								</p>
								<button
									type="button"
									class="pg-consent-run"
									disabled={!ready}
									onClick={() => controllerRef.current.approveRun?.()}
								>
									Run code
								</button>
							</div>
						</div>
					}
				</div>
				<div class={['pg-compiled', view !== 'compiled' && 'hidden']}>
					<div class={['pg-ast-host', compiledMode !== 'ast' && 'hidden']} ref={astHostRef} />
					<div class={['pg-output', compiledMode !== 'types' && 'hidden']}>
						<div class="pg-editor" ref={outputHostRef} />
					</div>
				</div>
			</section>
		</div>

		<div class="pg-mobile-toggle" role="group" aria-label="Visible panel">
			<button
				type="button"
				class={['pg-seg-btn', pane === 'editor' && 'active']}
				onClick={() => setPane('editor')}
			>
				Editor
			</button>
			<button
				type="button"
				class={['pg-seg-btn', pane === 'result' && 'active']}
				onClick={() => setPane('result')}
			>
				Result
			</button>
		</div>

		<style>
			.pg {
				display: flex;
				flex-direction: column;
				/* Fill the viewport below the sticky nav (60px + 1px border), edge to
				   edge — the layout renders no footer on this page, so nothing
				   scrolls. dvh tracks mobile browser chrome. */
				height: calc(100vh - 61px);
				height: calc(100dvh - 61px);
			}
			.pg-toolbar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
				padding: 0.65rem 1rem;
			}
			.pg-toolbar-side {
				display: flex;
				align-items: center;
				gap: 0.75rem;
				flex-wrap: wrap;
			}
			.pg-select {
				font: inherit;
				font-size: 0.85rem;
				font-weight: 500;
				color: var(--text);
				/* Custom chevron (appearance: none drops the native one) so the
				   indicator gets breathing room from the right edge. */
				appearance: none;
				padding: 0.35rem 2.1rem 0.35rem 0.65rem;
				border-radius: 8px;
				border: 1px solid var(--border);
				background: var(--surface-subtle);
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2399a1b3' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
				background-repeat: no-repeat;
				background-position: right 0.75rem center;
				cursor: pointer;
				max-width: 15rem;
			}
			.pg-select:disabled {
				opacity: 0.5;
				cursor: default;
			}
			.pg-select option,
			.pg-select optgroup {
				background: var(--panel);
				color: var(--text);
			}
			.pg-format {
				font: inherit;
				font-size: 0.85rem;
				font-weight: 500;
				color: var(--text-secondary);
				padding: 0.35rem 0.9rem;
				border-radius: 9999px;
				border: 1px solid var(--border);
				background: var(--surface-subtle);
				cursor: pointer;
			}
			.pg-format:hover:not(:disabled) {
				color: var(--text);
			}
			.pg-format:disabled {
				opacity: 0.5;
				cursor: default;
			}
			.pg-seg {
				display: inline-flex;
				padding: 3px;
				border-radius: 9999px;
				border: 1px solid var(--border);
				background: var(--surface-subtle);
			}
			/* Compact variant for the panel-head AST/Types switch. */
			.pg-seg-sm {
				padding: 2px;
			}
			.pg-seg-sm .pg-seg-btn {
				font-size: 0.68rem;
				padding: 0.12rem 0.6rem;
				letter-spacing: 0.06em;
			}
			.pg-compiled-controls {
				display: flex;
				align-items: center;
				gap: 0.45rem;
			}
			.pg-ast-stage-select {
				max-width: 9.5rem;
				padding: 0.18rem 0.35rem;
				border: 1px solid var(--border);
				border-radius: 5px;
				background: var(--code-bg);
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.68rem;
				letter-spacing: 0;
				text-transform: none;
			}
			.pg-seg-btn {
				border: none;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.85rem;
				font-weight: 500;
				padding: 0.3rem 0.9rem;
				border-radius: 9999px;
				cursor: pointer;
			}
			.pg-seg-btn:hover:not(:disabled) {
				color: var(--text);
			}
			.pg-seg-btn.active {
				color: var(--accent-text);
				background: rgba(255, 65, 90, 0.14);
			}
			.pg-seg-btn:disabled {
				opacity: 0.5;
				cursor: default;
			}
			.pg-error {
				padding: 0.6rem 1rem;
				border-top: 1px solid rgba(255, 93, 114, 0.4);
				background: rgba(255, 65, 90, 0.12);
				color: var(--danger-text);
				font-size: 0.85rem;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				white-space: pre-wrap;
			}
			.pg-warnings {
				display: flex;
				align-items: baseline;
				gap: 0.75rem;
				padding: 0.6rem 1rem;
				border-top: 1px solid rgba(245, 183, 65, 0.4);
				background: rgba(245, 183, 65, 0.1);
				color: var(--callout-important);
				font-size: 0.82rem;
			}
			.pg-warnings ul {
				display: grid;
				gap: 0.25rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.pg-warnings li {
				display: flex;
				gap: 0.55rem;
				flex-wrap: wrap;
			}
			.pg-warnings code,
			.pg-warning-location {
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
			}
			.pg-warning-location {
				color: var(--text-secondary);
			}
			.pg-grid {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
				flex: 1;
				min-height: 320px;
			}
			.pg-mobile-toggle {
				display: none;
			}
			.pg-panel {
				display: flex;
				flex-direction: column;
				min-width: 0;
				min-height: 0;
				border-top: 1px solid var(--border);
				overflow: hidden;
				background: var(--code-bg);
			}
			.pg-panel + .pg-panel {
				border-left: 1px solid var(--border);
			}
			.pg-panel-head {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				padding: 0.45rem 0.9rem;
				border-bottom: 1px solid var(--border);
				background: var(--surface-subtle);
				color: var(--text-secondary);
				font-size: 0.72rem;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}
			.pg-tabs {
				display: flex;
				gap: 0.25rem;
				flex-wrap: wrap;
			}
			.pg-tab {
				border: none;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.78rem;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				text-transform: none;
				letter-spacing: normal;
				padding: 0.2rem 0.6rem;
				border-radius: 6px;
				cursor: pointer;
			}
			.pg-tab:hover {
				color: var(--text);
			}
			.pg-tab.active {
				color: var(--accent-text);
				background: rgba(255, 65, 90, 0.14);
			}
			.pg-loading {
				text-transform: none;
				letter-spacing: normal;
			}
			.pg-editor {
				flex: 1;
				min-height: 0;
			}
			.pg-editor.hidden,
			.pg-compiled.hidden,
			.pg-result.hidden {
				display: none;
			}
			.pg-compiled {
				display: flex;
				flex: 1;
				min-height: 0;
				flex-direction: column;
			}
			.pg-output {
				display: flex;
				flex: 1;
				min-height: 0;
				flex-direction: column;
			}
			.pg-output.hidden {
				display: none;
			}
			.pg-ast-host {
				flex: 1;
				min-height: 0;
				overflow: hidden;
			}
			.pg-ast-host.hidden {
				display: none;
			}
			.pg-ast-host :global(.pg-ast-shell) {
				display: flex;
				height: 100%;
				min-height: 0;
				flex-direction: column;
				background: var(--code-bg);
				color: var(--text);
				font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
				font-size: 0.75rem;
			}
			.pg-ast-host :global(.pg-ast-status),
			.pg-ast-host :global(.pg-ast-notice) {
				padding: 0.18rem 0.45rem;
				border-bottom: 1px solid var(--border);
				color: var(--text-secondary);
				font-family: var(--font-sans, system-ui, sans-serif);
				font-size: 0.65rem;
			}
			.pg-ast-host :global(.pg-ast-status) {
				color: var(--text);
				font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
			}
			.pg-ast-host :global(.pg-ast-notice) {
				border-top: 1px solid var(--border);
				border-bottom: 0;
			}
			.pg-ast-host :global(.pg-ast-scroll) {
				flex: 1;
				min-height: 0;
				overflow: auto;
				padding: 0.35rem 0.45rem 0.65rem;
			}
			.pg-ast-host :global(.pg-ast-tree),
			.pg-ast-host :global(.pg-ast-node ul) {
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.pg-ast-host :global(.pg-ast-node ul) {
				padding-left: 1rem;
			}
			.pg-ast-host :global(.pg-ast-node summary),
			.pg-ast-host :global(.pg-ast-value),
			.pg-ast-host :global(.pg-ast-closing) {
				display: block;
				width: max-content;
				padding: 0 0.1rem;
				border-radius: 2px;
				white-space: pre;
			}
			.pg-ast-host :global(.pg-ast-node summary) {
				cursor: pointer;
			}
			.pg-ast-host :global(.pg-ast-node[data-ast-path='true'] > details:not([open]) > summary),
			.pg-ast-host :global(.pg-ast-node[data-ast-leaf='true'] > details > summary) {
				background: rgba(255, 234, 0, 0.2);
				box-shadow: inset 0 0 0 1px rgba(214, 185, 0, 0.2);
			}
			.pg-ast-host :global(.pg-ast-node[data-ast-leaf='true'] > details > summary) {
				background: rgba(255, 234, 0, 0.34);
			}
			.pg-ast-host :global(.pg-ast-key) {
				color: var(--text);
				text-decoration: underline;
				text-decoration-color: var(--border-strong);
			}
			.pg-ast-host :global(.pg-ast-type) {
				color: var(--accent-text);
			}
			.pg-ast-host :global(.pg-ast-range),
			.pg-ast-host :global(.pg-ast-reference),
			.pg-ast-host :global(.pg-ast-undefined),
			.pg-ast-host :global(.pg-ast-null) {
				color: var(--text-secondary);
			}
			.pg-ast-host :global(.pg-ast-string) {
				color: var(--syntax-string, #a56a12);
			}
			.pg-ast-host :global(.pg-ast-number),
			.pg-ast-host :global(.pg-ast-boolean),
			.pg-ast-host :global(.pg-ast-bigint) {
				color: var(--syntax-number, #2f8f46);
			}
			.pg-grid:not(.ready) :global(.cm-editor) {
				opacity: 0;
			}
			.pg-editor :global(.cm-editor) {
				height: 100%;
			}
			/* Ranges revealed by source↔output position mapping. */
			.pg-editor :global(.cm-mapped) {
				background: rgba(255, 234, 0, 0.42);
				box-shadow: inset 0 0 0 1px rgba(214, 185, 0, 0.28);
				border-radius: 2px;
			}
			.pg-result {
				position: relative;
				display: flex;
				flex: 1;
				min-height: 0;
			}
			/* The preview is a sandboxed iframe (opaque origin) — the content's
			   background/padding live in its srcdoc, not here (the parent relays
			   theme flips over the sandbox protocol). */
			.pg-preview {
				flex: 1;
				min-height: 0;
				background: var(--code-bg);
			}
			.pg-consent {
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
				padding: 1.25rem;
				background: var(--header-bg);
				backdrop-filter: blur(6px);
			}
			.pg-consent-card {
				max-width: 26rem;
				display: grid;
				gap: 0.6rem;
				justify-items: start;
				padding: 1.1rem 1.25rem;
				border-radius: 12px;
				border: 1px solid var(--border-strong);
				background: var(--panel);
				color: var(--text);
				font-size: 0.9rem;
			}
			.pg-consent-card p {
				margin: 0;
				color: var(--text-secondary);
			}
			.pg-consent-run {
				font: inherit;
				font-weight: 600;
				padding: 0.45rem 1.1rem;
				border-radius: 8px;
				border: 1px solid rgba(255, 93, 114, 0.5);
				background: rgba(255, 65, 90, 0.14);
				color: var(--accent-text);
				cursor: pointer;
			}
			.pg-consent-run:disabled {
				opacity: 0.5;
				cursor: default;
			}
			@media (max-width: 980px) {
				.pg-toolbar {
					padding: 0.65rem 0.75rem;
				}
				/* One panel at a time — the bottom toggle switches editor ↔ result. */
				.pg-grid {
					grid-template-columns: 1fr;
				}
				.pg-panel.mobile-hidden {
					display: none;
				}
				.pg-panel + .pg-panel {
					border-left: none;
				}
				.pg-mobile-toggle {
					display: flex;
					justify-content: center;
					gap: 0.25rem;
					padding: 3px;
					border-radius: 9999px;
					border: 1px solid var(--border);
					background: var(--header-bg-solid);
					backdrop-filter: blur(12px);
					align-self: center;
					margin: 0.5rem auto;
				}
				.pg-mobile-toggle .pg-seg-btn {
					min-width: 6.5rem;
					padding: 0.45rem 0.9rem;
				}
			}
		</style>
	</div>
}
