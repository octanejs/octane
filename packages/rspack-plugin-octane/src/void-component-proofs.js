import { analyzeCompiledModule } from 'octane/compiler/bundler';
import {
	currentModules,
	identifier,
	JAVASCRIPT_TYPES,
	moduleSource,
	oneShotProduction,
	rebuildModules,
	sameStrings,
	sourceHash,
	targetsFor,
} from './module-graph.js';
import {
	VOID_COMPONENT_BUILD_INFO_KEY,
	VOID_COMPONENT_CONTEXT_KEY,
	voidImportKey,
} from './void-component-data.js';

const PLUGIN_NAME = 'OctaneRspackVoidComponents';
const DIAGNOSTIC_OWNER = '@octanejs/rspack-plugin';
const HASH = /^[a-f0-9]{64}$/;
// After every other finishMake tap: an earlier proof controller may rebuild a
// module this one proves, and a proof must describe the provider's final build.
const FINISH_MAKE_STAGE = 100;

function strings(value) {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function importEntries(value, local) {
	return (
		Array.isArray(value) &&
		value.every(
			(entry) =>
				typeof entry?.request === 'string' &&
				typeof entry.imported === 'string' &&
				(!local || typeof entry.local === 'string'),
		)
	);
}

function candidateInfo(module) {
	const info = module?.buildInfo?.[VOID_COMPONENT_BUILD_INFO_KEY];
	if (
		info == null ||
		typeof info.sourceHash !== 'string' ||
		!HASH.test(info.sourceHash) ||
		!strings(info.exports) ||
		!strings(info.consumed) ||
		!importEntries(info.imports, false) ||
		(info.bindings !== null && !importEntries(info.bindings, true))
	) {
		return null;
	}
	return info;
}

function changed(importer, request, reason) {
	const location =
		request === undefined
			? JSON.stringify(importer)
			: `${JSON.stringify(importer)} (${JSON.stringify(request)})`;
	throw new Error(`${DIAGNOSTIC_OWNER}: void component proof changed for ${location}: ${reason}.`);
}

function requestsOf(entries) {
	return [...new Set(entries.map((entry) => entry.request))].sort();
}

/** Final-code facts by module identifier, reused while its source is unchanged. */
function finalFacts(module, id, analyses) {
	const code = moduleSource(module);
	if (code === null) return null;
	const fingerprint = sourceHash(code);
	let facts = analyses.get(id);
	if (facts === undefined || facts.fingerprint !== fingerprint) {
		const analysis = analyzeCompiledModule(code, module.resource ?? id);
		facts = {
			fingerprint,
			exports: new Set(analysis?.voidComponentExports),
			bindings:
				analysis === null
					? null
					: new Map(analysis.importBindings.map((binding) => [binding.local, binding])),
		};
		analyses.set(id, facts);
	}
	return facts;
}

/**
 * The provider half of a proof: Octane compiled `imported` as a void export of
 * this module in this build, and the module's final JavaScript, after every
 * later loader, still exports a function that cannot return a value. A loader
 * that rewrites the export or its return behavior fails the second check.
 *
 * While proofs are collected, a provider that can consume proofs itself is
 * usually about to be rebuilt, so its current code is not what will run. Its
 * final code is proven after the rebuild instead (`deferred`).
 */
function provenProvider(target, imported, analyses, deferred = false) {
	const id = identifier(target);
	if (id === null || !JAVASCRIPT_TYPES.has(target.type)) return null;
	const info = candidateInfo(target);
	if (!info?.exports.includes(imported)) return null;
	if (deferred && info.imports.length > 0) return { id };
	const facts = finalFacts(target, id, analyses);
	return facts?.exports.has(imported) ? { id, fingerprint: facts.fingerprint } : null;
}

/**
 * The importer half: its final code still binds every local that Octane's
 * output read a consumed proof through to the same request and export. A
 * later loader that rebinds one would redirect a specialized call elsewhere.
 */
function bindingsHold(info, facts) {
	if (info.bindings === null || facts.bindings === null) return false;
	const bound = new Set(info.bindings.map((entry) => voidImportKey(entry.request, entry.imported)));
	if (!info.consumed.every((key) => bound.has(key))) return false;
	return info.bindings.every((entry) => {
		const binding = facts.bindings.get(entry.local);
		return binding?.request === entry.request && binding.imported === entry.imported;
	});
}

/**
 * Receipt every rebuilt importer whose consumed proofs still hold on the final
 * graph. Returns the importers whose proofs a later loader invalidated.
 */
function receiptRebuilt(compilation, state, analyses) {
	const modules = currentModules(compilation.modules);
	const invalid = [];
	for (const [id, proof] of state.proofs) {
		const importer = modules.get(id);
		const info = candidateInfo(importer);
		if (info === null || info.sourceHash !== proof.sourceHash) {
			changed(id, undefined, 'the authored source changed while rebuilding');
		}
		if (info.consumed.length === 0) continue;
		const supplied = new Map(
			proof.imports.map((entry) => [voidImportKey(entry.request, entry.imported), entry]),
		);
		if (info.consumed.some((key) => !supplied.has(key))) {
			changed(id, undefined, 'the compiler consumed an unprovided import');
		}
		const consumed = info.consumed.map((key) => supplied.get(key));
		const targets = targetsFor(compilation, importer, requestsOf(consumed));
		const imports = [];
		for (const { request, imported } of consumed) {
			const provider = provenProvider(targets.get(request), imported, analyses);
			if (provider === null) break;
			imports.push({ request, imported, ...provider });
		}
		const facts = finalFacts(importer, id, analyses);
		if (imports.length !== consumed.length || facts === null || !bindingsHold(info, facts)) {
			invalid.push(id);
			continue;
		}
		state.receipts.set(id, {
			sourceHash: proof.sourceHash,
			fingerprint: facts.fingerprint,
			consumed: info.consumed,
			imports,
		});
	}
	return invalid;
}

/** Each consumed proof still names the modules and exact sources it was proven on. */
function verifyGraph(compilation, state) {
	if (state.receipts.size === 0) return;
	const modules = currentModules(compilation.modules);
	for (const [id, receipt] of state.receipts) {
		const importer = modules.get(id);
		const info = candidateInfo(importer);
		if (
			info === null ||
			info.sourceHash !== receipt.sourceHash ||
			!sameStrings(info.consumed, receipt.consumed)
		) {
			changed(id, undefined, 'the authored importer or committed-use receipt differs');
		}
		const source = moduleSource(importer);
		if (source === null || sourceHash(source) !== receipt.fingerprint) {
			changed(id, undefined, 'the final importer source differs');
		}
		const targets = targetsFor(compilation, importer, requestsOf(receipt.imports));
		for (const entry of receipt.imports) {
			const target = targets.get(entry.request);
			if (identifier(target) !== entry.id)
				changed(id, entry.request, 'the effective module identity differs');
			const provided = moduleSource(target);
			if (provided === null || sourceHash(provided) !== entry.fingerprint)
				changed(id, entry.request, 'the final provider source differs');
		}
	}
}

function verifyFinalSources(compilation, state) {
	if (state.receipts.size === 0) return;
	const modules = currentModules(compilation.modules);
	const expected = new Map();
	for (const [id, receipt] of state.receipts) {
		expected.set(id, receipt.fingerprint);
		for (const entry of receipt.imports) expected.set(entry.id, entry.fingerprint);
	}
	for (const [id, fingerprint] of expected) {
		const module = modules.get(id);
		// The full graph was checked at seal, before optimization. A module that
		// optimization removed since then no longer runs at all.
		if (module === undefined) continue;
		const source = moduleSource(module);
		if (source === null || sourceHash(source) !== fingerprint) {
			changed(id, undefined, 'the emitted module source differs');
		}
	}
}

async function collectAndRebuild(compilation, state) {
	if (state.started) return;
	state.started = true;
	const analyses = new Map();
	// Collect from the complete first graph before rebuilding anything, so the
	// proofs never depend on the order Rspack happened to build modules in.
	{
		const modules = currentModules(compilation.modules);
		const candidates = [...modules]
			.filter(([, module]) => candidateInfo(module)?.imports.length > 0)
			.map(([id]) => id)
			.sort();
		for (const id of candidates) {
			const importer = modules.get(id);
			const info = candidateInfo(importer);
			const targets = targetsFor(compilation, importer, requestsOf(info.imports));
			const imports = info.imports.filter(
				({ request, imported }) =>
					targets.get(request) != null &&
					provenProvider(targets.get(request), imported, analyses, true) !== null,
			);
			if (imports.length > 0) state.proofs.set(id, { sourceHash: info.sourceHash, imports });
		}
	}
	if (state.proofs.size === 0) return;
	await rebuildModules(compilation, [...state.proofs.keys()], changed);
	// Every consumed provider is proven on its final code here, including one
	// rebuilt as an importer in this batch. A later loader can also rewrite
	// what Octane specialized; an importer whose proof does not hold is rebuilt
	// once more without one. Any change after that fails closed.
	const invalid = receiptRebuilt(compilation, state, analyses);
	if (invalid.length > 0) {
		for (const id of invalid) state.proofs.delete(id);
		await rebuildModules(compilation, invalid, changed);
		const modules = currentModules(compilation.modules);
		for (const id of invalid) {
			if (candidateInfo(modules.get(id))?.consumed.length > 0) {
				changed(id, undefined, 'a generic rebuild consumed a proof');
			}
		}
		state.receipts.clear();
		const unstable = receiptRebuilt(compilation, state, analyses);
		if (unstable.length > 0) changed(unstable[0], undefined, 'a consumed proof no longer holds');
	}
	verifyGraph(compilation, state);
}

/**
 * Prove imported void components for production client builds. Rspack runs a
 * loader before it knows its module's outgoing edges or their final output, so
 * the proof is established after make from the effective graph, then supplied
 * to a rebuild of each importer that can use it. A one-shot build consumes
 * proofs and fails closed if any proven module changes later; a watch build
 * only records the facts its cached modules need for a later one-shot build.
 */
export function installVoidComponentProofs(compiler) {
	const NormalModule = compiler.webpack?.NormalModule;
	if (
		typeof NormalModule?.getCompilationHooks !== 'function' ||
		typeof compiler.hooks.thisCompilation?.tap !== 'function' ||
		typeof compiler.hooks.finishMake?.tapPromise !== 'function'
	) {
		return;
	}
	const states = new WeakMap();
	compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
		const state = {
			discoverOnly: !oneShotProduction(compiler),
			started: false,
			proofs: new Map(),
			receipts: new Map(),
		};
		states.set(compilation, state);
		NormalModule.getCompilationHooks(compilation).loader.tap(PLUGIN_NAME, (context, module) => {
			context[VOID_COMPONENT_CONTEXT_KEY] = {
				enabled: true,
				proof: state.proofs.get(identifier(module)) ?? null,
			};
		});
		if (state.discoverOnly) return;
		// All finishModules taps have completed, and module concatenation has not
		// yet rewritten the effective graph. This catches later rebuilds.
		compilation.hooks.seal.tap({ name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER }, () =>
			verifyGraph(compilation, state),
		);
		compilation.hooks.processAssets.tap(
			{
				name: PLUGIN_NAME,
				stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
			},
			() => verifyFinalSources(compilation, state),
		);
	});
	compiler.hooks.finishMake.tapPromise(
		{ name: PLUGIN_NAME, stage: FINISH_MAKE_STAGE },
		async (compilation) => {
			const state = states.get(compilation);
			if (state !== undefined && !state.discoverOnly && oneShotProduction(compiler)) {
				await collectAndRebuild(compilation, state);
			}
		},
	);
}
