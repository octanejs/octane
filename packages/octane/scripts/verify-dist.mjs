// Post-build guard for the published `octane` package. The esbuild entry list in
// build.mjs used to be hand-maintained and silently drifted from `src/` (css.ts,
// server/rpc.ts, and static/index.ts went missing): dist shipped with unresolvable
// relative imports and nothing failed until a consumer imported the package. Entry
// points are now globbed, and this walker backstops the whole class of bug —
// including the verbatim-copied `dist/compiler/` — by failing the build instead of
// the consumer. Runs from build.mjs (so `prepack` can never publish a broken dist)
// and standalone against an existing dist: `node scripts/verify-dist.mjs`.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Required-subset contract for the package's public JavaScript namespaces.
// Additive exports are intentionally harmless; removing one of these names is
// a consumer-visible compatibility event and must update this list explicitly.
export const REQUIRED_PUBLIC_VALUE_EXPORTS = {
	'.': [
		'Activity',
		'Children',
		'EXTERNAL_HYDRATION_PROMISE',
		'ErrorBoundary',
		'Fragment',
		'FragmentInstance',
		'HMR',
		'HYDRATION_RANGE_BOUNDARY',
		'Hydrate',
		'Suspense',
		'TsrxErrorBoundary',
		'ViewTransition',
		'ViewTransitionPseudoElement',
		'__createVoidRoot',
		'__s',
		'__serverRpc',
		'__useReducerWithGetter',
		'__useStateWithGetter',
		'__vtSeen',
		'act',
		'activityBlock',
		'addTransitionType',
		'attachRef',
		'bag0',
		'bag1',
		'bag10',
		'bag11',
		'bag12',
		'bag13',
		'bag14',
		'bag15',
		'bag16',
		'bag2',
		'bag3',
		'bag4',
		'bag5',
		'bag6',
		'bag7',
		'bag8',
		'bag9',
		'bagOf',
		'bindRendererRegionOwner',
		'child',
		'childSlot',
		'childTextHole',
		'clone',
		'cloneElement',
		'compilerCacheContext',
		'componentSlot',
		'componentSlotLite',
		'componentSlotVoid',
		'createContext',
		'createElement',
		'createHostContextRequest',
		'createPortal',
		'createRoot',
		'delegateCaptureEvents',
		'delegateEvents',
		'devEventListener',
		'drainFrag',
		'drainPassiveEffects',
		'evt0',
		'evt0u',
		'evt1',
		'evt1u',
		'evt2',
		'evt2u',
		'evtN',
		'evtNu',
		'flushSync',
		'forBlock',
		'getTransitionFallbackTimeout',
		'hasPendingWork',
		'headBlock',
		'hmr',
		'hookSlots',
		'hostComponent',
		'htext',
		'htextSwap',
		'hydrateRoot',
		'ifBlock',
		'initializeHydrationEventCapture',
		'injectStyle',
		'isChildrenBlock',
		'isValidElement',
		'lazy',
		'markChildrenBlock',
		'markDangerouslySetInnerHTMLChildren',
		'markNativeChangeDiagnosticStatic',
		'markSingleRoot',
		'memo',
		'mountFragmentRef',
		'namespaceHead',
		'namespaceHeadElement',
		'normalizeClass',
		'portal',
		'positionalChildren',
		'preconnect',
		'prefetchDNS',
		'preinit',
		'preload',
		'provideContext',
		'puMiss',
		'puPub',
		'puTake0',
		'puTake1',
		'puTake2',
		'puTake3',
		'puTake4',
		'queueNativeChangeDiagnostic',
		'queueRefAttach',
		'queueRefDetach',
		'renderBlock',
		'requestFormReset',
		'setAriaAttribute',
		'setAttribute',
		'setAutoFocus',
		'setBooleanAttribute',
		'setChecked',
		'setCheckedCheckable',
		'setClassAttr',
		'setClassName',
		'setDangerouslySetInnerHTML',
		'setDangerouslySetInnerHTMLSources',
		'setDefaultChecked',
		'setDefaultValue',
		'setDefaultValueUncontrolled',
		'setFormAction',
		'setFormControlSources',
		'setHTML',
		'setHostPropSources',
		'setIsOctaneActEnvironment',
		'setScriptText',
		'setSelectValue',
		'setSpread',
		'setStringData',
		'setStyle',
		'setText',
		'setTransitionFallbackTimeout',
		'setValue',
		'sibling',
		'snapshotSpread',
		'startTransition',
		'switchBlock',
		'template',
		'textHole',
		'textSlot',
		'tryBlock',
		'unstable_ViewTransition',
		'unstable_addTransitionType',
		'use',
		'useActionState',
		'useBatch',
		'useCallback',
		'useContext',
		'useDebugValue',
		'useDeferredValue',
		'useEffect',
		'useEffectEvent',
		'useFormStatus',
		'useId',
		'useImperativeHandle',
		'useInsertionEffect',
		'useLayoutEffect',
		'useMemo',
		'useOptimistic',
		'useReducer',
		'useRef',
		'useState',
		'useSyncExternalStore',
		'useTransition',
		'version',
		'warmChild',
		'warmMemo',
		'withSlot',
	],
	'./react': ['OctaneCompat', '__hostContextFiberWalks'],
	'./hydration': [
		'condition',
		'idle',
		'initializeHydrationEventCapture',
		'interaction',
		'load',
		'media',
		'never',
		'visible',
	],
	'./react/server': ['OctaneCompat'],
	'./server': [
		'Activity',
		'Children',
		'EXTERNAL_HYDRATION_PROMISE',
		'ErrorBoundary',
		'Fragment',
		'HYDRATION_RANGE_BOUNDARY',
		'Hydrate',
		'Suspense',
		'ViewTransition',
		'__useReducerWithGetter',
		'__useStateWithGetter',
		'addTransitionType',
		'cloneElement',
		'createContext',
		'createElement',
		'createPortal',
		'escapeAttr',
		'escapeHtml',
		'executeServerFunction',
		'flushSync',
		'getSsrSuspenseTimeout',
		'hookSlots',
		'injectStyle',
		'isChildrenBlock',
		'isValidElement',
		'lazy',
		'markChildrenBlock',
		'memo',
		'namespaceHead',
		'namespaceHeadElement',
		'normalizeClass',
		'positionalChildren',
		'preconnect',
		'prefetchDNS',
		'preinit',
		'preload',
		'puBatch',
		'puMemo',
		'renderToPipeableStream',
		'renderToReadableStream',
		'renderToStaticMarkup',
		'renderToString',
		'requestFormReset',
		'setSsrSuspenseTimeout',
		'ssrActivity',
		'ssrArm',
		'ssrAttr',
		'ssrAttrs',
		'ssrBlock',
		'ssrCheckedAttr',
		'ssrChild',
		'ssrChildText',
		'ssrChildrenSources',
		'ssrClass',
		'ssrComponent',
		'ssrComponentNS',
		'ssrControl',
		'ssrElement',
		'ssrForBlock',
		'ssrHeadEl',
		'ssrInNamespace',
		'ssrInnerHtml',
		'ssrInputAttrs',
		'ssrIsSuspense',
		'ssrOption',
		'ssrOptionValueSources',
		'ssrPortal',
		'ssrScriptInnerHtml',
		'ssrSelectAttrs',
		'ssrSelectScope',
		'ssrSelectScopeSources',
		'ssrSnapshotSpread',
		'ssrSpread',
		'ssrStyle',
		'ssrText',
		'ssrTextPre',
		'ssrTextareaValue',
		'ssrTextareaValueSources',
		'ssrTry',
		'ssrValueAttr',
		'ssrVoidContent',
		'startTransition',
		'unstable_ViewTransition',
		'unstable_addTransitionType',
		'use',
		'useActionState',
		'useCallback',
		'useContext',
		'useDebugValue',
		'useDeferredValue',
		'useEffect',
		'useEffectEvent',
		'useFormStatus',
		'useId',
		'useImperativeHandle',
		'useInsertionEffect',
		'useLayoutEffect',
		'useMemo',
		'useOptimistic',
		'useReducer',
		'useRef',
		'useState',
		'useSyncExternalStore',
		'useTransition',
		'warmChild',
		'warmMemo',
		'withSlot',
	],
	'./static': ['prerender'],
	'./constants': [
		'ATTRIBUTE_ALIASES',
		'BLOCK_CLOSE',
		'BLOCK_OPEN',
		'BOOLEAN_ATTR_PROPS',
		'EMPTY_COMMENT',
		'EXTERNAL_HYDRATION_PROMISE',
		'FOR_BLOCK_OPEN_EMPTY',
		'FOR_BLOCK_OPEN_ITEMS',
		'HYDRATE_ID_ATTR',
		'HYDRATE_ID_COUNT_ATTR',
		'HYDRATE_SEED_ATTR',
		'HYDRATE_STATIC_END',
		'HYDRATE_STATIC_ID_COUNT_PREFIX',
		'HYDRATE_STREAM_TOKEN_ATTR',
		'HYDRATE_WHEN_ATTR',
		'HYDRATION_END',
		'HYDRATION_FOR_EMPTY',
		'HYDRATION_FOR_ITEMS',
		'HYDRATION_RANGE_BOUNDARY',
		'HYDRATION_START',
		'HYDRATION_TEXT_SEP',
		'MUST_USE_PROPERTY_PROPS',
		'POSITIVE_NUMERIC_ATTR_PROPS',
		'REJECTION_SENTINEL_KEY',
		'STREAM_BOUNDARY_ATTR',
		'STREAM_SCRIPT_ATTR',
		'STREAM_SEED_ATTR',
		'STREAM_SEED_COMMENT',
		'STREAM_SEGMENT_ATTR',
		'SUSPENSE_SCRIPT_ATTR',
		'SUSPENSE_SEED_WIRE_PREFIX',
		'SVG_ONLY_TAGS',
		'UNDEFINED_SENTINEL_KEY',
		'VALID_ATTR_NAME',
		'VOID_ELEMENTS',
		'cssStyleValue',
		'isEnumeratedBooleanAttr',
		'isUnitlessStyleProp',
	],
	'./profiling': [
		'__profileBail',
		'__profileBeginRender',
		'__profileComponent',
		'__profileComponentSource',
		'__profileEndRender',
		'__profileHasComponentMetadata',
		'__profileHook',
		'__profileResolveHook',
		'__profileSchedule',
		'__profileTrackComponent',
		'profiler',
	],
	'./universal': [
		'Activity',
		'UNIVERSAL_HMR',
		'UNIVERSAL_TRANSPORT_PROTOCOL_VERSION',
		'__useReducerWithGetter',
		'__useStateWithGetter',
		'createContext',
		'createObjectContainer',
		'createObjectDriver',
		'createPortal',
		'createUniversalHostBoundary',
		'createUniversalRoot',
		'defineUniversalComponent',
		'flushUniversalAct',
		'flushUniversalSync',
		'hmrUniversalComponent',
		'hookSlots',
		'isRendererRegion',
		'lazy',
		'memo',
		'rendererRegion',
		'requestFormReset',
		'startTransition',
		'universalActivity',
		'universalChildren',
		'universalComponent',
		'universalContext',
		'universalFor',
		'universalIf',
		'universalKey',
		'universalList',
		'universalPlan',
		'universalProps',
		'universalSwitch',
		'universalTry',
		'universalValue',
		'use',
		'useActionState',
		'useBatch',
		'useCallback',
		'useContext',
		'useDebugValue',
		'useDeferredValue',
		'useEffect',
		'useEffectEvent',
		'useFormStatus',
		'useId',
		'useImperativeHandle',
		'useInsertionEffect',
		'useLayoutEffect',
		'useMemo',
		'useOptimistic',
		'useReducer',
		'useRef',
		'useState',
		'useSyncExternalStore',
		'useTransition',
		'warmChild',
		'warmMemo',
		'withSlot',
	],
	'./universal/native': [
		'Activity',
		'UNIVERSAL_HMR',
		'UNIVERSAL_TRANSPORT_PROTOCOL_VERSION',
		'__useReducerWithGetter',
		'__useStateWithGetter',
		'createContext',
		'createObjectContainer',
		'createObjectDriver',
		'createPortal',
		'createUniversalRoot',
		'defineUniversalComponent',
		'flushUniversalAct',
		'flushUniversalSync',
		'hmrUniversalComponent',
		'hookSlots',
		'isRendererRegion',
		'lazy',
		'memo',
		'rendererRegion',
		'requestFormReset',
		'startTransition',
		'universalActivity',
		'universalChildren',
		'universalComponent',
		'universalContext',
		'universalFor',
		'universalIf',
		'universalKey',
		'universalList',
		'universalPlan',
		'universalProps',
		'universalSwitch',
		'universalTry',
		'universalValue',
		'use',
		'useActionState',
		'useBatch',
		'useCallback',
		'useContext',
		'useDebugValue',
		'useDeferredValue',
		'useEffect',
		'useEffectEvent',
		'useFormStatus',
		'useId',
		'useImperativeHandle',
		'useInsertionEffect',
		'useLayoutEffect',
		'useMemo',
		'useOptimistic',
		'useReducer',
		'useRef',
		'useState',
		'useSyncExternalStore',
		'useTransition',
		'warmChild',
		'warmMemo',
		'withSlot',
	],
	'./compiler': ['__analyzeNativeChangeDiagnostics', 'compile', 'compileToVolarMappings', 'octane'],
	'./compiler/bundler': [
		'CLIENT_REFERENCE_MANIFEST_FILENAME',
		'CLIENT_REFERENCE_MANIFEST_VERSION',
		'DOM_RENDERER_ID',
		'DOM_RENDERER_MODULE',
		'HYDRATE_QUERY_PARAM',
		'OCTANE_RUNTIME_REQUESTS',
		'RENDERER_CONFIG_VERSION',
		'canonicalModuleId',
		'cleanModuleId',
		'createClientReferenceManifest',
		'createOctaneCompiler',
		'discoverOctaneSourceDependencies',
		'findVoidComponentExports',
		'findVoidComponentImports',
		'findVoidRootImports',
		'normalizeRendererConfig',
		'resolveOctaneRuntimeRequest',
		'resolveRendererForFile',
	],
	'./compiler/renderers': [
		'DOM_RENDERER_ID',
		'DOM_RENDERER_MODULE',
		'RENDERER_CONFIG_VERSION',
		'normalizeRendererConfig',
		'resolveRendererForFile',
	],
	'./compiler/vite': ['discoverOctaneSourceDependencies', 'octane'],
	'./compiler/volar': ['compileToVolarMappings'],
	'./tsrx-iterable': ['map_iterable'],
	'./tsrx-spread': ['normalize_spread_props', 'normalize_spread_props_for_ref_attr'],
};

function readPackage(pkgDir) {
	return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
}

function collectExportTargets(value, targets) {
	if (typeof value === 'string') {
		targets.add(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectExportTargets(item, targets);
		return;
	}
	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) collectExportTargets(item, targets);
	}
}

function publishedExportTargets(pkg) {
	const targets = new Set();
	for (const value of Object.values(pkg.publishConfig.exports))
		collectExportTargets(value, targets);
	return [...targets];
}

export function publishedRuntimeEntries(publishedExports) {
	return Object.entries(publishedExports).flatMap(([subpath, value]) => {
		const targets = new Set();
		collectExportTargets(value, targets);
		return [...targets]
			.filter((target) => /\.(?:c|m)?js$/.test(target))
			.map((target) => [subpath, target]);
	});
}

export function missingRequiredPublicValueExports(subpath, actualNames) {
	const actual = new Set(actualNames);
	return (REQUIRED_PUBLIC_VALUE_EXPORTS[subpath] ?? []).filter((name) => !actual.has(name));
}

export function assertRequiredPublicValueExports(subpath, actualNames) {
	const missing = missingRequiredPublicValueExports(subpath, actualNames);
	if (missing.length > 0) {
		throw new Error(`${subpath} omitted required named exports: ${missing.join(', ')}`);
	}
}

export function missingPublishedPublicSubpaths(advertisedExports, publishedExports) {
	const publishedSubpaths = new Set(Object.keys(publishedExports));
	return Object.keys(advertisedExports).filter((subpath) => !publishedSubpaths.has(subpath));
}

export async function verifyDist(pkgDir) {
	const pkg = readPackage(pkgDir);
	const dist = join(pkgDir, 'dist');

	// Development consumes the source export map, while pnpm replaces it with
	// publishConfig.exports in the tarball. Every advertised source subpath must
	// therefore survive that replacement.
	const missingSubpaths = missingPublishedPublicSubpaths(pkg.exports, pkg.publishConfig.exports);
	if (missingSubpaths.length > 0) {
		throw new Error(
			`octane dist verify: source exports omitted from publishConfig.exports:\n` +
				missingSubpaths.map((subpath) => `  ${subpath}`).join('\n'),
		);
	}

	// Every publishConfig export target must exist. A missing entry module is a
	// root that nothing else imports, so the import walk below cannot see it —
	// this is exactly how the missing static/index.ts shipped unnoticed.
	const missing = publishedExportTargets(pkg).filter((p) => !existsSync(join(pkgDir, p)));
	if (missing.length > 0) {
		throw new Error(
			`octane dist verify: publishConfig.exports targets missing from the build:\n` +
				missing.map((p) => `  ${p}`).join('\n'),
		);
	}

	// Every relative import in every emitted .js module must resolve to a file.
	// esbuild in bundle mode is the resolver (a real parser, not a regex, and it
	// follows dynamic import() literals too): each dist module is its own entry,
	// bare specifiers stay external (they are declared dependencies, present at
	// install time), and *.json covers the `../package.json` attribute import
	// (package.json is always included in the tarball).
	const jsFiles = readdirSync(dist, { recursive: true })
		.filter((f) => f.endsWith('.js'))
		.map((f) => join(dist, f));
	try {
		await build({
			entryPoints: jsFiles,
			bundle: true,
			write: false,
			outdir: join(pkgDir, '.verify-dist-noop'), // never written (write: false); esbuild requires an outdir for multiple entries
			format: 'esm',
			platform: 'neutral',
			packages: 'external',
			external: ['*.json'],
			logLevel: 'silent',
		});
	} catch (error) {
		const details = (error.errors ?? [{ text: String(error) }])
			.map((e) => `  ${e.location ? `${e.location.file}:${e.location.line}: ` : ''}${e.text}`)
			.join('\n');
		throw new Error(`octane dist verify: unresolvable imports in dist:\n${details}`);
	}
}

// Import each published entry point in a fresh plain-Node process — the same
// resolution a consumer gets, catching anything static analysis can't (a module
// that throws at init, a bad package.json attribute import, …).
export function smokeDist(pkgDir) {
	const pkg = readPackage(pkgDir);
	const entries = publishedRuntimeEntries(pkg.publishConfig.exports);
	const runtimeSubpaths = new Set(entries.map(([subpath]) => subpath));
	const missingContracts = [...runtimeSubpaths].filter(
		(subpath) => REQUIRED_PUBLIC_VALUE_EXPORTS[subpath] === undefined,
	);
	const unpublishedContracts = Object.keys(REQUIRED_PUBLIC_VALUE_EXPORTS).filter(
		(subpath) => !runtimeSubpaths.has(subpath),
	);
	if (missingContracts.length > 0 || unpublishedContracts.length > 0) {
		throw new Error(
			`octane dist verify: public value-export contract is out of sync:\n` +
				[
					...missingContracts.map((subpath) => `  missing contract for ${subpath}`),
					...unpublishedContracts.map(
						(subpath) => `  contract has no published JS entry ${subpath}`,
					),
				].join('\n'),
		);
	}

	for (const [subpath, entry] of entries) {
		const url = pathToFileURL(join(pkgDir, entry)).href;
		// Let Node exit naturally. This is also the published-runtime regression
		// guard: importing an entry must not allocate a channel, timer, listener, or
		// other host resource that keeps an otherwise-idle consumer alive.
		const exportedNames = JSON.parse(
			execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`const namespace = await import(${JSON.stringify(url)});
process.stdout.write(JSON.stringify(Object.keys(namespace)));`,
				],
				{
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'inherit'],
					cwd: pkgDir,
					timeout: 10_000,
				},
			),
		);
		assertRequiredPublicValueExports(subpath, exportedNames);
	}
	return entries.map(([, entry]) => entry);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
	await verifyDist(pkgDir);
	const entries = smokeDist(pkgDir);
	console.log(`octane: dist verified (all imports resolve; smoke-imported ${entries.join(', ')})`);
}
