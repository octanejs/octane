import {
	cleanModuleId,
	isPlainCssModuleId,
	readCssModuleExports,
	validateCssModuleConstants,
} from 'octane/compiler/bundler';
import {
	CSS_MODULE_BUILD_INFO_KEY,
	CSS_MODULE_CONTEXT_KEY,
	cssModuleSourceHash,
} from './css-module-data.js';
import {
	currentModules,
	identifier,
	iterable,
	JAVASCRIPT_TYPES,
	moduleSource,
	oneShotProduction,
	rebuildModules,
	sameStrings,
	targetForRequest,
	targetsForRequests,
} from './module-graph.js';

const PLUGIN_NAME = 'OctaneRspackCssModuleConstants';
const DIAGNOSTIC_OWNER = '@octanejs/rspack-plugin';
const HASH = /^[a-f0-9]{64}$/;

function candidateInfo(module) {
	const info = module?.buildInfo?.[CSS_MODULE_BUILD_INFO_KEY];
	if (
		info == null ||
		typeof info.sourceHash !== 'string' ||
		!HASH.test(info.sourceHash) ||
		!Array.isArray(info.requests) ||
		!info.requests.every((request) => typeof request === 'string') ||
		!Array.isArray(info.consumed) ||
		!info.consumed.every((request) => typeof request === 'string')
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
	throw new Error(`${DIAGNOSTIC_OWNER}: CSS-module proof changed for ${location}: ${reason}.`);
}

function sortedStrings(values) {
	return [...new Set([...iterable(values)].filter((value) => typeof value === 'string'))].sort();
}

function moduleDependencies(module) {
	const info = module.buildInfo;
	return {
		files: sortedStrings(info?.fileDependencies),
		contexts: sortedStrings(info?.contextDependencies),
		missing: sortedStrings(info?.missingDependencies),
		build: sortedStrings(info?.buildDependencies),
	};
}

function providerMeta(module) {
	const info = module.buildInfo;
	return Object.freeze(info != null && typeof info === 'object' ? { ...info } : {});
}

function readTargetProof(module, option, environment, cache) {
	const id = identifier(module);
	if (id === null || !JAVASCRIPT_TYPES.has(module.type) || typeof module.resource !== 'string') {
		// Native css/* has no final JavaScript export map at this stage. Likewise
		// asset/source can contain ESM-looking text without exporting its bindings.
		return null;
	}
	const code = moduleSource(module);
	if (code === null) return null;
	const fingerprint = cssModuleSourceHash(code);
	const cached = cache.get(id);
	if (cached !== undefined) {
		if (cached.fingerprint !== fingerprint)
			changed(id, undefined, 'provider source changed during collection');
		return cached.proof;
	}
	const exports = readCssModuleExports(code, { allowPureVar: true });
	const supplied =
		typeof option !== 'function'
			? null
			: validateCssModuleConstants(
					option(
						Object.freeze({
							id,
							resource: module.resource,
							code,
							meta: providerMeta(module),
							environment,
							layer: module.layer,
							type: module.type,
						}),
					),
					exports,
					id,
					DIAGNOSTIC_OWNER,
				);
	const named =
		isPlainCssModuleId(cleanModuleId(module.resource)) && exports?.pure === true
			? new Map(exports.named)
			: new Map();
	for (const [name, value] of supplied?.named ?? []) named.set(name, value);
	const defaultMap = supplied?.default ?? new Map();
	const proof =
		named.size === 0 && defaultMap.size === 0
			? null
			: {
					id,
					fingerprint,
					named: [...named].sort(([left], [right]) => left.localeCompare(right)),
					default: [...defaultMap].sort(([left], [right]) => left.localeCompare(right)),
					dependencies: moduleDependencies(module),
				};
	cache.set(id, { fingerprint, proof });
	return proof;
}

function verifyResolvedTarget(importer, entry, target) {
	if (identifier(target) !== entry.id)
		changed(identifier(importer), entry.request, 'the effective module identity differs');
	if (!JAVASCRIPT_TYPES.has(target.type))
		changed(identifier(importer), entry.request, 'the target is no longer JavaScript ESM');
	const source = moduleSource(target);
	if (source === null || cssModuleSourceHash(source) !== entry.fingerprint) {
		changed(identifier(importer), entry.request, 'the final provider source differs');
	}
}

function verifyTarget(compilation, importer, entry) {
	verifyResolvedTarget(importer, entry, targetForRequest(compilation, importer, entry.request));
}

function verifyGraph(compilation, state) {
	if (state.receipts.size === 0) return;
	const modules = currentModules(compilation.modules);
	for (const [id, receipt] of state.receipts) {
		const importer = modules.get(id);
		const info = candidateInfo(importer);
		const requests = receipt.imports.map((entry) => entry.request);
		if (
			info === null ||
			info.sourceHash !== receipt.sourceHash ||
			!sameStrings(info.consumed, requests)
		) {
			changed(id, undefined, 'the authored importer or committed-use receipt differs');
		}
		if (receipt.imports.length === 1) {
			verifyTarget(compilation, importer, receipt.imports[0]);
		} else {
			const targets = targetsForRequests(compilation, importer, requests);
			for (const entry of receipt.imports) {
				verifyResolvedTarget(importer, entry, targets.get(entry.request));
			}
		}
	}
}

function verifyFinalSources(compilation, state) {
	if (state.receipts.size === 0) return;
	const modules = currentModules(compilation.modules);
	const checked = new Map();
	for (const receipt of state.receipts.values()) {
		for (const entry of receipt.imports) {
			if (checked.has(entry.id)) {
				if (checked.get(entry.id) !== entry.fingerprint)
					changed(entry.id, undefined, 'conflicting source receipts');
				continue;
			}
			checked.set(entry.id, entry.fingerprint);
			const module = modules.get(entry.id);
			// The full graph was checked at seal, before optimization. An unused
			// component and its stylesheet may now be gone, which is intentional.
			if (module === undefined) continue;
			const source = moduleSource(module);
			if (
				!JAVASCRIPT_TYPES.has(module.type) ||
				source === null ||
				cssModuleSourceHash(source) !== entry.fingerprint
			) {
				changed(entry.id, undefined, 'the emitted provider source differs');
			}
		}
	}
}

async function collectAndRebuild(compilation, state, option, environment) {
	if (state.started) return;
	state.started = true;
	const cache = new Map();
	// Collect from the complete first graph before rebuilding anything. This is
	// both deterministic and safe for mutually importing virtual CSS providers.
	{
		const modules = currentModules(compilation.modules);
		const candidates = [...modules]
			.filter(([, module]) => candidateInfo(module)?.requests.length > 0)
			.map(([id]) => id)
			.sort();
		for (const id of candidates) {
			const importer = modules.get(id);
			const info = candidateInfo(importer);
			const imports = [];
			const requests = [...new Set(info.requests)].sort();
			const targets =
				requests.length === 1 ? null : targetsForRequests(compilation, importer, requests);
			for (const request of requests) {
				const target =
					targets === null
						? targetForRequest(compilation, importer, request)
						: targets.get(request);
				if (target === null) continue;
				const proof = readTargetProof(target, option, environment, cache);
				if (proof !== null) imports.push({ request, ...proof });
			}
			if (imports.length > 0) {
				state.proofs.set(id, { sourceHash: info.sourceHash, imports });
			}
		}
	}
	// A derived CSS provider can itself be an Octane importer. Its first-pass
	// source is not a stable proof if this batch will recompile it. Deopt those
	// edges rather than chase a fixed point or rebuild any importer twice. This
	// deliberately bounded pass need not find every possible constant.
	const scheduled = new Set(state.proofs.keys());
	for (const [id, proof] of state.proofs) {
		const imports = proof.imports.filter((entry) => !scheduled.has(entry.id));
		if (imports.length === 0) state.proofs.delete(id);
		else if (imports.length !== proof.imports.length) state.proofs.set(id, { ...proof, imports });
	}
	await rebuildModules(compilation, [...state.proofs.keys()], changed);
	const rebuiltModules = currentModules(compilation.modules);
	for (const [id, proof] of state.proofs) {
		const rebuilt = rebuiltModules.get(id);
		const info = candidateInfo(rebuilt);
		if (info === null || info.sourceHash !== proof.sourceHash) {
			changed(id, undefined, 'the authored source changed while rebuilding');
		}
		const entries = new Map(proof.imports.map((entry) => [entry.request, entry]));
		const consumed = [...new Set(info.consumed)].sort();
		if (consumed.some((request) => !entries.has(request))) {
			changed(id, undefined, 'the compiler consumed an unprovided import');
		}
		if (consumed.length > 0) {
			state.receipts.set(id, {
				sourceHash: proof.sourceHash,
				imports: consumed.map((request) => entries.get(request)),
			});
		}
	}
	verifyGraph(compilation, state);
}

/** Install the opt-in, main-thread, same-compilation CSS proof controller. */
export function installCssModuleConstants(compiler, { option, environment }) {
	if (option === undefined || option === false) return;
	if (option !== true && typeof option !== 'function') {
		throw new TypeError(`${DIAGNOSTIC_OWNER}: cssModuleConstants must be a boolean or function.`);
	}
	const NormalModule = compiler.webpack?.NormalModule;
	if (
		typeof NormalModule?.getCompilationHooks !== 'function' ||
		typeof compiler.hooks.thisCompilation?.tap !== 'function' ||
		typeof compiler.hooks.finishMake?.tapPromise !== 'function'
	) {
		throw new TypeError(
			`${DIAGNOSTIC_OWNER}: cssModuleConstants requires Rspack's module and finishMake hooks.`,
		);
	}
	const states = new WeakMap();
	compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
		const state = {
			enabled: compiler.options.mode === 'production',
			discoverOnly: !oneShotProduction(compiler),
			started: false,
			proofs: new Map(),
			receipts: new Map(),
		};
		states.set(compilation, state);
		if (!state.enabled) return;
		NormalModule.getCompilationHooks(compilation).loader.tap(PLUGIN_NAME, (context, module) => {
			context[CSS_MODULE_CONTEXT_KEY] = {
				enabled: true,
				...(state.discoverOnly ? { discoverOnly: true } : null),
				proof: state.discoverOnly ? null : (state.proofs.get(identifier(module)) ?? null),
			};
		});
		// Production watch may cache ordinary candidate metadata for a later
		// one-shot build, but never authenticates or consumes cross-module facts.
		if (state.discoverOnly) return;
		// All finishModules taps have completed, and module concatenation has not
		// yet rewritten the effective graph. This catches later provider rebuilds.
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
	compiler.hooks.finishMake.tapPromise(PLUGIN_NAME, async (compilation) => {
		const state = states.get(compilation);
		if (state?.enabled && !state.discoverOnly && oneShotProduction(compiler)) {
			await collectAndRebuild(compilation, state, option, environment);
		}
	});
}
