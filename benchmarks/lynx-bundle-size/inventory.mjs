// Production rows-0 inventory for the exact Lynx table fixture used by the
// cross-framework runtime benchmark. Rspack's reachable-module sizes are
// attributed by owner, while final Web/Lynx artifacts and decoded Lynx thread
// sections are measured byte-for-byte. Module shares are deliberately reported
// as proportional attribution, not as additive gzip ownership.
process.env.NODE_ENV = 'production';

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';

import { pluginOctane } from '../../packages/rspeedy-plugin-octane/src/index.js';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const ENTRY = path.join(REPO, 'benchmarks/lynx-table/app/src/index.ts');
const CWD = path.join(REPO, 'packages/rspeedy-plugin-octane/tests/_fixtures/application');
const MODULES = path.join(REPO, 'packages/rspeedy-plugin-octane/node_modules');
const BUDGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'inventory-budgets.json'), 'utf8'));
const captures = new Map();

function packageEntry(packageName) {
	const packageRoot = path.join(MODULES, ...packageName.split('/'));
	const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
	const exported = manifest.exports?.['.'];
	const entry =
		typeof exported === 'string'
			? exported
			: typeof exported?.import === 'string'
				? exported.import
				: manifest.module || manifest.main;
	if (typeof entry !== 'string') throw new Error(`${packageName} has no importable entry.`);
	return pathToFileURL(path.join(packageRoot, entry)).href;
}

const [{ createRspeedy }, tasm] = await Promise.all([
	import(packageEntry('@lynx-js/rspeedy')),
	import(packageEntry('@lynx-js/tasm')),
]);

const gzipBytes = (value) => gzipSync(value, { level: zc.Z_BEST_COMPRESSION }).length;
const brotliBytes = (value) =>
	brotliCompressSync(value, {
		params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
	}).length;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function nativeScriptBytes(script) {
	if (typeof script === 'string') return Buffer.from(script);
	if (ArrayBuffer.isView(script)) {
		return Buffer.from(script.buffer, script.byteOffset, script.byteLength);
	}
	if (Array.isArray(script)) return Buffer.concat(script.map(nativeScriptBytes));
	if (script !== null && typeof script === 'object') {
		return Buffer.concat(Object.values(script).map(nativeScriptBytes));
	}
	return Buffer.alloc(0);
}

function ownerOf(identifier) {
	const value = identifier.replaceAll('\\', '/');
	if (value.includes('/benchmarks/lynx-table/app/src/')) return 'fixture-app';
	if (value.includes('/packages/octane/src/universal-core')) return 'universal-runtime';
	if (/\/packages\/lynx\/src\/core\/(?:host-driver|papi)/.test(value)) {
		return 'host-driver-papi';
	}
	if (/\/packages\/lynx\/src\/(?:main-thread|main-renderer)/.test(value)) {
		return 'first-screen-adoption';
	}
	if (/\/packages\/lynx\/src\/core\/(?:protocol|transport|profiling)/.test(value)) {
		return 'protocol-transport';
	}
	if (/\/packages\/lynx\/src\/core\/(?:client-driver|worklets)/.test(value)) {
		return 'public-state-worklets';
	}
	if (value.includes('/packages/lynx/src/')) return 'lynx-runtime-other';
	if (value.includes('/packages/octane/src/')) return 'octane-runtime-other';
	if (value.includes('/node_modules/@lynx-js/')) return 'lynx-build-wrapper-polyfills';
	if (value.includes('/node_modules/')) return 'third-party-runtime';
	return 'generated-wrapper';
}

function portableIdentifier(identifier) {
	const value = identifier.replaceAll('\\', '/');
	if (value.startsWith(REPO.replaceAll('\\', '/') + '/')) {
		return `@/${value.slice(REPO.length + 1)}`;
	}
	const nodeModules = value.lastIndexOf('/node_modules/');
	return nodeModules === -1 ? value : value.slice(nodeModules + 1);
}

class CaptureReachableModulesPlugin {
	constructor(environment) {
		this.environment = environment;
	}
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(this.constructor.name, (compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: `${this.constructor.name}:${this.environment}`,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
				},
				() => {
					const capture = captures.get(this.environment) ?? { modules: [], programs: {} };
					for (const asset of compilation.getAssets()) {
						if (!asset.name.endsWith('.js')) continue;
						capture.programs[asset.name] = Buffer.from(asset.source.buffer());
					}
					captures.set(this.environment, capture);
				},
			);
		});
		compiler.hooks.done.tap(this.constructor.name, (stats) => {
			const compilation = stats.compilation;
			const modules = [];
			for (const module of compilation.modules) {
				const size = Number(module.size?.() ?? 0);
				if (!Number.isFinite(size) || size <= 0) continue;
				const identifier = module.nameForCondition?.() ?? module.identifier?.() ?? 'unknown';
				const chunks = [...compilation.chunkGraph.getModuleChunksIterable(module)].map(
					(chunk) => chunk.name ?? String(chunk.id ?? 'unnamed'),
				);
				let owner = ownerOf(identifier);
				if (owner === 'fixture-app' && size > 100_000) owner = 'compiler-output-app';
				if (owner === 'generated-wrapper' && size > 100_000) owner = 'build-wrapper-main';
				modules.push({
					identifier: portableIdentifier(identifier),
					owner,
					size,
					chunks,
				});
			}
			const capture = captures.get(this.environment) ?? { modules: [], programs: {} };
			capture.modules = modules;
			captures.set(this.environment, capture);
		});
	}
}

function inventoryPlugin() {
	return {
		name: 'octane:lynx-production-inventory',
		setup(api) {
			api.modifyBundlerChain((chain, { environment }) => {
				chain
					.plugin(`octane:inventory:${environment.name}`)
					.use(CaptureReachableModulesPlugin, [environment.name]);
			});
		},
	};
}

function artifactStat(bytes) {
	return {
		raw: bytes.length,
		gzip: gzipBytes(bytes),
		brotli: brotliBytes(bytes),
		sha256: sha256(bytes),
	};
}

const benchmarkStat = (value) => ({
	score: value,
	median: value,
	min: value,
	mean: value,
	p95: value,
	sd: 0,
	rme: 0,
	warmupRatio: 1,
	samples: 1,
});

function moduleInventory(modules, artifactRaw) {
	const owners = {};
	let reachableRaw = 0;
	for (const module of modules) {
		reachableRaw += module.size;
		const owner = (owners[module.owner] ??= { reachableRaw: 0, modules: 0 });
		owner.reachableRaw += module.size;
		owner.modules++;
	}
	let attributed = 0;
	const entries = Object.entries(owners).sort((a, b) => b[1].reachableRaw - a[1].reachableRaw);
	for (let index = 0; index < entries.length; index++) {
		const [, owner] = entries[index];
		owner.artifactRaw =
			index === entries.length - 1
				? artifactRaw - attributed
				: Math.round((artifactRaw * owner.reachableRaw) / reachableRaw);
		attributed += owner.artifactRaw;
	}
	return {
		method: 'final artifact raw bytes distributed by production reachable-module size',
		reachableRaw,
		accountedArtifactRaw: attributed,
		coverage: artifactRaw === 0 ? 0 : attributed / artifactRaw,
		owners: Object.fromEntries(entries),
		modules,
	};
}

function gateBudget(label, value, budget) {
	if (value > budget) throw new Error(`${label} ${value} exceeds frozen budget ${budget}.`);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-inventory-'));
let build;
try {
	const rspeedy = await createRspeedy({
		cwd: CWD,
		loadEnv: false,
		environment: ['lynx', 'web'],
		rspeedyConfig: {
			mode: 'production',
			environments: { lynx: {}, web: {} },
			dev: { hmr: false, liveReload: false },
			output: {
				cleanDistPath: true,
				distPath: { root: temporary },
				filename: { bundle: '[name].[platform].bundle' },
				filenameHash: false,
				sourceMap: false,
			},
			source: {
				entry: { main: ENTRY },
				define: {
					__BENCH_AUTOROWS__: '0',
					__OCTANE_LYNX_PROFILE__: 'false',
				},
			},
			splitChunks: false,
			tools: { rspack: { resolve: { modules: [MODULES, 'node_modules'] } } },
			plugins: [pluginOctane({ dev: false, hmr: false }), inventoryPlugin()],
		},
	});
	build = await rspeedy.build();
	const webBytes = fs.readFileSync(path.join(temporary, 'main.web.bundle'));
	const lynxBytes = fs.readFileSync(path.join(temporary, 'main.lynx.bundle'));
	const decoded = tasm.supportNapi()
		? tasm.decode_napi(lynxBytes)
		: await tasm.decode_wasm(lynxBytes);
	const lynxCapture = captures.get('lynx') ?? { modules: [], programs: {} };
	const program = (pattern, fallback) => {
		const match = Object.entries(lynxCapture.programs).find(([name]) => pattern.test(name));
		return match?.[1] ?? nativeScriptBytes(decoded[fallback]);
	};
	const main = program(/(?:^|\/)main-thread\.js$/, 'main-thread-script');
	const background = program(/(?:^|\/)background\.js$/, 'background-thread-script');
	const customSections = {};
	for (const [key, value] of Object.entries(decoded)) {
		if (key === 'main-thread-script' || key === 'background-thread-script') continue;
		const bytes = nativeScriptBytes(value);
		if (bytes.length > 0) customSections[key] = artifactStat(bytes);
	}
	const web = artifactStat(webBytes);
	const lynx = artifactStat(lynxBytes);
	const payload = {
		suite: 'lynx-production-inventory',
		meta: {
			date: new Date().toISOString(),
			source: process.env.OCTANE_INVENTORY_SOURCE ?? 'working-tree',
			node: process.version,
			platform: `${os.platform()} ${os.release()}`,
			fixture: 'benchmarks/lynx-table/app, BENCH_AUTOROWS=0',
			gzipLevel: zc.Z_BEST_COMPRESSION,
			accounting:
				'Raw artifact ownership is proportional to production reachable-module sizes; gzip ownership is only claimed by the controlled ledger below.',
		},
		artifacts: {
			web: {
				...web,
				inventory: moduleInventory(captures.get('web')?.modules ?? [], web.raw),
			},
			lynx: {
				...lynx,
				sections: {
					main: artifactStat(main),
					background: artifactStat(background),
					custom: customSections,
				},
				inventory: moduleInventory(lynxCapture.modules, lynx.raw),
			},
		},
		controlledLedger: BUDGETS.controlledLedger,
	};
	const calibrate = process.env.OCTANE_INVENTORY_CALIBRATE === '1';
	for (const target of ['web', 'lynx']) {
		if (calibrate) continue;
		gateBudget(`${target} raw`, payload.artifacts[target].raw, BUDGETS.artifacts[target].raw);
		gateBudget(`${target} gzip`, payload.artifacts[target].gzip, BUDGETS.artifacts[target].gzip);
		if (payload.artifacts[target].inventory.coverage < 0.9) {
			throw new Error(`${target} raw attribution covers less than 90%.`);
		}
		for (const [owner, budget] of Object.entries(BUDGETS.owners[target])) {
			const actual = payload.artifacts[target].inventory.owners[owner]?.artifactRaw ?? 0;
			gateBudget(`${target}/${owner} raw`, actual, budget);
		}
	}
	for (const section of calibrate ? [] : ['main', 'background']) {
		for (const metric of ['raw', 'gzip']) {
			gateBudget(
				`lynx ${section} ${metric}`,
				payload.artifacts.lynx.sections[section][metric],
				BUDGETS.sections[section][metric],
			);
		}
	}
	const output = process.env.OCTANE_INVENTORY_OUTPUT;
	if (output) fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(
			process.env.BENCH_JSON,
			JSON.stringify(
				{
					suite: 'lynx-bundle-size',
					iterations: 1,
					targets: [
						{
							name: 'octane-production-rows0',
							ops: {
								web_raw: benchmarkStat(web.raw),
								web_gzip: benchmarkStat(web.gzip),
								lynx_raw: benchmarkStat(lynx.raw),
								lynx_gzip: benchmarkStat(lynx.gzip),
							},
							meta: payload,
						},
					],
				},
				null,
				2,
			) + '\n',
		);
	}
	console.log('\ntarget                       raw       gzip     brotli');
	console.log(
		`rows-0 web       ${String(web.raw).padStart(10)} ${String(web.gzip).padStart(10)} ${String(web.brotli).padStart(10)}`,
	);
	console.log(
		`rows-0 lynx      ${String(lynx.raw).padStart(10)} ${String(lynx.gzip).padStart(10)} ${String(lynx.brotli).padStart(10)}`,
	);
	console.log(
		`lynx main        ${String(payload.artifacts.lynx.sections.main.raw).padStart(10)} ${String(payload.artifacts.lynx.sections.main.gzip).padStart(10)} ${String(payload.artifacts.lynx.sections.main.brotli).padStart(10)}`,
	);
	console.log(
		`lynx background  ${String(payload.artifacts.lynx.sections.background.raw).padStart(10)} ${String(payload.artifacts.lynx.sections.background.gzip).padStart(10)} ${String(payload.artifacts.lynx.sections.background.brotli).padStart(10)}`,
	);
} finally {
	await build?.close();
	fs.rmSync(temporary, { recursive: true, force: true });
}
