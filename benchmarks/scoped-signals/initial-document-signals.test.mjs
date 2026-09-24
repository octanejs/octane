import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { compile } from '../../packages/octane/src/compiler/compile.js';

const REPO = path.resolve(import.meta.dirname, '../..');
const BASELINE = '47580bd0eecf9a7369bc805c36c2ab1f8bc16de1';
const FIXTURE = path.join(import.meta.dirname, 'initial-document-signals-consumer.tsrx');
const PACKAGE = path.join(REPO, 'packages/octane');
const SHARED = 'shared-document-thread';
const DISTINCT = 'different-document-thread';
const requireDependency = createRequire(path.join(PACKAGE, 'package.json'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) =>
	execFileSync('git', args, {
		cwd: REPO,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
		maxBuffer: 32 * 1024 * 1024,
	});
const measure = (value) => ({
	raw: Buffer.byteLength(value),
	gzip: gzipSync(value, { level: 9 }).length,
	brotli: brotliCompressSync(value, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).length,
	sha256: hash(value),
});
const occurrenceCount = (haystack, needle) => haystack.split(needle).length - 1;

const serverEntry = `
import {renderToString,earlySignalBootstrapScript} from 'octane/server';
import {interaction} from 'octane/hydration';
import {createScope,runWithSignalOwner} from 'octane/signals';
import {DocumentView,route$} from 'consumer';
export function render(distinct=false,reuse=true){
 const owner=createScope({scopeKey:'octane:document'});
 try{
  runWithSignalOwner(owner,()=>route$.set(${JSON.stringify(SHARED)}));
  const initialDocumentSignals=owner.serialize();
  if(distinct)runWithSignalOwner(owner,()=>route$.set(${JSON.stringify(DISTINCT)}));
  const first=interaction({events:'click'}),second=interaction({events:'click'});
  const rendered=renderToString(DocumentView,{first,second},
   {signalOwner:owner,earlySignalBootstrap:'external',...(reuse?{initialDocumentSignals}:{})});
  const initialJson=JSON.stringify({version:1,scopes:[initialDocumentSignals]}).replace(/</g,'\\\\u003c');
  const bootstrap=earlySignalBootstrapScript()+'<script id="initial-document-signals" type="application/json">'+initialJson+'</script>';
  const response='<!doctype html><html><head>'+bootstrap+'</head><body><div id="app">'+rendered.css+rendered.html+'</div></body></html>';
  return{response,html:rendered.html,initialDocumentSignals,initialJson};
 }finally{owner.dispose();}
}`;

const clientEntry = `
import {act,flushSync,hydrateRoot} from 'octane';
import {interaction} from 'octane/hydration';
import {bootstrapStreamedSignalResults} from 'octane/hydration/streamed-signals';
import {DocumentView,route$} from 'consumer';
export async function hydrate(host,initialDocumentSignals){
 const bridge=bootstrapStreamedSignalResults({buildId:'initial-seed-build',documentId:'initial-seed-document',
  initialSignals:{version:1,scopes:[initialDocumentSignals]}});
 const previous=[...host.querySelectorAll('output')];
 const texts=()=>[...host.querySelectorAll('output')].map(node=>node.textContent);
 const historyReads={};
 const accepted=(name,presented,live)=>{if(!(name in historyReads))historyReads[name]={presented,live};};
 const first=interaction({events:'click'}),second=interaction({events:'click'});
 const recoveries=[];let root;
 try{
  const server=texts();
  route$.set('live-before-root');
  root=hydrateRoot(host,DocumentView,{first,second,accepted},
   {signalOwner:bridge.signalOwner,initialDocumentSignals,onRecoverableError:error=>recoveries.push(String(error))});
  await act(()=>{});
  const preactivated=texts();
  const rootLive=route$.get();
  flushSync(()=>route$.set('live-before-first'));
  await act(()=>host.querySelector('[data-region="first"]').dispatchEvent(
   new MouseEvent('click',{bubbles:true,cancelable:true})));
  const firstActivated=texts();
  const firstLive=route$.get();
  flushSync(()=>route$.set('live-before-second'));
  await act(()=>host.querySelector('[data-region="second"]').dispatchEvent(
   new MouseEvent('click',{bubbles:true,cancelable:true})));
  const secondActivated=texts();
  const secondLive=route$.get();
  const identity=previous.every((node,index)=>node===host.querySelectorAll('output')[index]);
  root.unmount();root=undefined;
  route$.set('after-unmount');
  return{server,preactivated,firstActivated,secondActivated,identity,recoveries,historyReads,
   liveValues:[rootLive,firstLive,secondLive],
   live:route$.get(),cleaned:host.childNodes.length===0};
 }finally{root?.unmount();bridge.dispose();}
}`;

function dependencyEvidence(request) {
	const entry = requireDependency.resolve(request);
	let directory = path.dirname(fs.realpathSync(entry));
	while (true) {
		const manifestPath = path.join(directory, 'package.json');
		if (fs.existsSync(manifestPath)) {
			const bytes = fs.readFileSync(manifestPath);
			const manifest = JSON.parse(bytes);
			if (manifest.name === request)
				return { name: manifest.name, version: manifest.version, manifestSha256: hash(bytes) };
		}
		const parent = path.dirname(directory);
		assert.notEqual(parent, directory, `Missing package manifest: ${request}`);
		directory = parent;
	}
}

async function bundle({ label, mode, source, compiled, candidateInputs }) {
	const manifestBytes =
		label === 'baseline'
			? git('show', `${BASELINE}:packages/octane/package.json`)
			: fs.readFileSync(path.join(PACKAGE, 'package.json'));
	const manifest = JSON.parse(manifestBytes);
	const inputs = new Map();
	const result = await build({
		stdin: { contents: source, resolveDir: REPO, sourcefile: `${mode}-consumer-entry.js` },
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		format: mode === 'server' ? 'esm' : 'iife',
		...(mode === 'client' ? { globalName: '__INITIAL_DOCUMENT_CONSUMER__' } : {}),
		platform: mode === 'server' ? 'node' : 'browser',
		target: 'esnext',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'matched-initial-document-consumer',
				setup(builder) {
					builder.onResolve({ filter: /^consumer$/ }, () => ({
						path: FIXTURE,
						namespace: 'compiled-consumer',
					}));
					builder.onLoad({ filter: /.*/, namespace: 'compiled-consumer' }, () => ({
						contents: compiled,
						loader: 'js',
						resolveDir: path.dirname(FIXTURE),
					}));
					builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const target = manifest.exports[request === 'octane' ? '.' : '.' + request.slice(6)];
						assert.equal(typeof target, 'string', `Expected public source export: ${request}`);
						return { path: path.resolve(PACKAGE, target) };
					});
					builder.onResolve(
						{ filter: /^(?:alien-signals|devalue)(?:\/|$)/ },
						({ path: request }) => ({
							path: requireDependency.resolve(request),
						}),
					);
					builder.onLoad({ filter: /\.(?:[cm]?[jt]s|json)$/ }, ({ path: filename }) => {
						const logical = path.relative(REPO, filename).replaceAll('\\', '/');
						const baselineSource =
							label === 'baseline' && logical.startsWith('packages/octane/src/');
						const bytes = baselineSource
							? git('show', `${BASELINE}:${logical}`)
							: fs.readFileSync(filename);
						inputs.set(logical, {
							sha256: hash(bytes),
							bytes: bytes.length,
							source: baselineSource ? BASELINE : 'disk',
						});
						if (!baselineSource) {
							const previous = candidateInputs.get(filename);
							if (previous !== undefined)
								assert.equal(
									hash(bytes),
									previous,
									`Source drifted between matched builds: ${filename}`,
								);
							candidateInputs.set(filename, hash(bytes));
						}
						return {
							contents: bytes,
							loader: filename.endsWith('.json')
								? 'json'
								: /\.[cm]?ts$/.test(filename)
									? 'ts'
									: 'js',
							resolveDir: path.dirname(filename),
						};
					});
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 1, 'Measure the complete consumer closure.');
	assert.deepEqual(
		Object.values(result.metafile.outputs).flatMap((output) => output.imports),
		[],
		'No external runtime imports may escape the measured consumer.',
	);
	return {
		code: result.outputFiles[0].text,
		manifestSha256: hash(manifestBytes),
		inputs: Object.fromEntries([...inputs].sort(([a], [b]) => a.localeCompare(b))),
	};
}

function transport(rendered) {
	const dom = new JSDOM(rendered.response);
	try {
		const payloads = [
			...dom.window.document.querySelectorAll('script[data-octane-native-signals]'),
		].map((script) => script.textContent);
		assert.equal(
			payloads.length,
			3,
			'Eager root and two deferred boundaries each transmit native history.',
		);
		const initialAndNative = rendered.initialJson + payloads.join('');
		return {
			response: measure(rendered.response),
			initialBootstrapJson: measure(rendered.initialJson),
			nativeManifestJson: measure(payloads.join('')),
			initialAndNativeJson: measure(initialAndNative),
			sharedValueSerializations: occurrenceCount(
				initialAndNative,
				JSON.stringify(['string', SHARED]),
			),
			distinctValueSerializations: occurrenceCount(
				initialAndNative,
				JSON.stringify(['string', DISTINCT]),
			),
			manifestVersions: payloads.map((raw) => JSON.parse(raw).version),
			serverOutput: [...dom.window.document.querySelectorAll('output')].map(
				(node) => node.textContent,
			),
		};
	} finally {
		dom.window.close();
	}
}

async function hydrate(code, rendered) {
	const diagnostics = [];
	const virtualConsole = new VirtualConsole();
	for (const event of ['warn', 'error', 'jsdomError']) {
		virtualConsole.on(event, (...values) => diagnostics.push(values.map(String).join(' ')));
	}
	const dom = new JSDOM(rendered.response, {
		runScripts: 'outside-only',
		pretendToBeVisual: true,
		url: 'https://initial-document.test/',
		virtualConsole,
	});
	const channels = [];
	class ConsumerMessageChannel extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	}
	dom.window.MessageChannel = ConsumerMessageChannel;
	try {
		// Run the authentic renderer-free mailbox bootstrap before loading the consumer.
		for (const script of dom.window.document.querySelectorAll(
			'script:not([type="application/json"])',
		)) {
			dom.window.eval(script.textContent);
		}
		// Public act() needs MessageChannel; close every port when this realm is discarded.
		dom.window.eval(code);
		// The host parses its server seed in the receiving browser realm.
		const seed = dom.window.JSON.parse(
			dom.window.document.getElementById('initial-document-signals').textContent,
		).scopes[0];
		const result = await dom.window.__INITIAL_DOCUMENT_CONSUMER__.hydrate(
			dom.window.document.getElementById('app'),
			seed,
		);
		assert.deepEqual(diagnostics, [], 'DOM adoption must remain diagnostic-free.');
		return JSON.parse(JSON.stringify(result));
	} finally {
		for (const channel of channels) {
			channel.port1.close();
			channel.port2.close();
		}
		dom.window.close();
	}
}

function assertSingleSharedValue(result) {
	assert.equal(
		result.sharedValueSerializations,
		1,
		'The shared initial value must cross the wire once.',
	);
}

test('initial document history crosses the wire once for a matching eager root and deferred boundaries', async (t) => {
	// The ongoing CI guard uses the public omitted-option control. A report also
	// measures the immutable archived runtime without freezing future compiler ABI.
	const compareBaseline = process.env.BENCH_JSON !== undefined;
	if (compareBaseline)
		assert.equal(git('rev-parse', `${BASELINE}^{commit}`).toString().trim(), BASELINE);
	const authored = fs.readFileSync(FIXTURE, 'utf8');
	const compilerInputs = Object.fromEntries(
		git('ls-files', '--', 'packages/octane/src/compiler')
			.toString()
			.trim()
			.split('\n')
			.filter((filename) => /\.(?:[cm]?[jt]s|json)$/.test(filename))
			.map((filename) => [filename, hash(fs.readFileSync(path.join(REPO, filename)))]),
	);
	const compiled = Object.fromEntries(
		['client', 'server'].map((mode) => [
			mode,
			compile(authored, FIXTURE, { mode, dev: false, hmr: false }).code,
		]),
	);
	const candidateInputs = new Map();
	const variants = [];
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-initial-document-signals-'));
	t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
	const semanticFor = (historical) => ({
		server: [historical, historical, historical],
		preactivated: ['live-before-root', historical, historical],
		firstActivated: ['live-before-first', 'live-before-first', historical],
		secondActivated: ['live-before-second', 'live-before-second', 'live-before-second'],
		liveValues: ['live-before-root', 'live-before-first', 'live-before-second'],
		historyReads: {
			eager: { presented: historical, live: 'live-before-root' },
			first: { presented: historical, live: 'live-before-first' },
			second: { presented: historical, live: 'live-before-second' },
		},
		identity: true,
		recoveries: [],
		live: 'after-unmount',
		cleaned: true,
	});
	for (const label of compareBaseline ? ['baseline', 'candidate'] : ['candidate']) {
		const server = await bundle({
			label,
			mode: 'server',
			source: serverEntry,
			compiled: compiled.server,
			candidateInputs,
		});
		const client = await bundle({
			label,
			mode: 'client',
			source: clientEntry,
			compiled: compiled.client,
			candidateInputs,
		});
		const serverFile = path.join(scratch, `${label}-server.mjs`);
		fs.writeFileSync(serverFile, server.code);
		const module = await import(pathToFileURL(serverFile).href);
		const matching = module.render();
		const different = module.render(true);
		const fault = module.render(false, false);
		const semantic = await hydrate(client.code, matching);
		const distinctSemantic = await hydrate(client.code, different);
		assert.deepEqual(semantic, semanticFor(SHARED), `${label}: shared history remains adoptable.`);
		assert.deepEqual(
			distinctSemantic,
			semanticFor(DISTINCT),
			`${label}: distinct history remains adoptable.`,
		);
		variants.push({
			label,
			clientBundle: { ...measure(client.code), inputs: client.inputs },
			serverBundle: { ...measure(server.code), inputs: server.inputs },
			packageManifestSha256: server.manifestSha256,
			matching: transport(matching),
			distinct: transport(different),
			withoutReuse: transport(fault),
			semantic,
			distinctSemantic,
		});
	}
	const baseline = variants.find((variant) => variant.label === 'baseline');
	const candidate = variants.find((variant) => variant.label === 'candidate');
	if (baseline) {
		assert.equal(baseline.matching.sharedValueSerializations, 4);
		assert.throws(() => assertSingleSharedValue(baseline.matching), /cross the wire once/);
		assert.equal(
			candidate.distinct.distinctValueSerializations,
			baseline.distinct.distinctValueSerializations,
		);
		assert.ok(candidate.matching.nativeManifestJson.raw < baseline.matching.nativeManifestJson.raw);
	}
	assertSingleSharedValue(candidate.matching);
	assert.equal(candidate.withoutReuse.sharedValueSerializations, 4);
	assert.throws(() => assertSingleSharedValue(candidate.withoutReuse), /cross the wire once/);
	assert.ok(
		candidate.matching.nativeManifestJson.raw < candidate.withoutReuse.nativeManifestJson.raw,
	);
	assert.equal(candidate.distinct.sharedValueSerializations, 1);
	assert.equal(candidate.distinct.distinctValueSerializations, 3);
	for (const [filename, expected] of candidateInputs) {
		assert.equal(
			hash(fs.readFileSync(filename)),
			expected,
			`Source drifted during the matched run: ${filename}`,
		);
	}
	for (const [filename, expected] of Object.entries(compilerInputs)) {
		assert.equal(
			hash(fs.readFileSync(path.join(REPO, filename))),
			expected,
			`Compiler source drifted during the matched run: ${filename}`,
		);
	}
	const delta = (before, after) =>
		Object.fromEntries(
			['raw', 'gzip', 'brotli'].map((metric) => [metric, after[metric] - before[metric]]),
		);
	const report = {
		suite: 'initial-document-signals',
		baselineRef: baseline ? BASELINE : null,
		candidateRef: git('rev-parse', 'HEAD').toString().trim(),
		candidateDirty: git('status', '--porcelain').toString().trim() !== '',
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		esbuildVersion,
		dependencies: Object.fromEntries(
			['esbuild', 'alien-signals', 'devalue', 'jsdom', '@tsrx/core', '@tsrx/oxc'].map((name) => [
				name,
				dependencyEvidence(name),
			]),
		),
		lockfileSha256: hash(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
		baselineLockfileSha256: baseline ? hash(git('show', `${BASELINE}:pnpm-lock.yaml`)) : null,
		runnerSha256: hash(fs.readFileSync(import.meta.filename)),
		fixtureSha256: hash(authored),
		compiler: {
			options: {
				client: { mode: 'client', dev: false, hmr: false },
				server: { mode: 'server', dev: false, hmr: false },
			},
			outputs: Object.fromEntries(
				Object.entries(compiled).map(([mode, code]) => [mode, hash(code)]),
			),
			inputs: compilerInputs,
			changedFilesFromBaseline: baseline
				? git('diff', '--name-only', BASELINE, '--', 'packages/octane/src/compiler')
						.toString()
						.trim()
						.split('\n')
						.filter(Boolean)
				: null,
		},
		buildOptions: {
			bundle: true,
			minify: true,
			treeShaking: true,
			target: 'esnext',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			client: { platform: 'browser', format: 'iife' },
			server: { platform: 'node', format: 'esm' },
		},
		compression: { gzipLevel: 9, brotliQuality: 11 },
		limitations: [
			'Production minified complete consumer closures; no independent chunk-size addition.',
			'JSDOM adoption and transport proof, not physical-browser layout, paint, or latency evidence.',
			'RenderResult.signals is not counted again because its payload is already in native sidecars.',
		],
		variants,
		sameBuildOptionDelta: {
			matchingResponse: delta(candidate.withoutReuse.response, candidate.matching.response),
			matchingNativeManifestJson: delta(
				candidate.withoutReuse.nativeManifestJson,
				candidate.matching.nativeManifestJson,
			),
			matchingInitialAndNativeJson: delta(
				candidate.withoutReuse.initialAndNativeJson,
				candidate.matching.initialAndNativeJson,
			),
		},
		delta: baseline
			? {
					clientBundle: delta(baseline.clientBundle, candidate.clientBundle),
					serverBundle: delta(baseline.serverBundle, candidate.serverBundle),
					matchingResponse: delta(baseline.matching.response, candidate.matching.response),
					matchingNativeManifestJson: delta(
						baseline.matching.nativeManifestJson,
						candidate.matching.nativeManifestJson,
					),
					matchingInitialAndNativeJson: delta(
						baseline.matching.initialAndNativeJson,
						candidate.matching.initialAndNativeJson,
					),
					distinctResponse: delta(baseline.distinct.response, candidate.distinct.response),
				}
			: null,
	};
	if (baseline)
		assert.equal(
			report.lockfileSha256,
			report.baselineLockfileSha256,
			'Pinned dependency inputs must match.',
		);
	if (process.env.BENCH_JSON) {
		assert.ok(path.isAbsolute(process.env.BENCH_JSON), 'BENCH_JSON must be an absolute path.');
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n', {
			flag: 'wx',
		});
	}
	t.diagnostic(
		JSON.stringify({
			delta: report.delta,
			sameBuildOptionDelta: report.sameBuildOptionDelta,
			sharedValueSerializations: variants.map((variant) => ({
				label: variant.label,
				matching: variant.matching.sharedValueSerializations,
				distinct: variant.distinct.distinctValueSerializations,
			})),
		}),
	);
});
