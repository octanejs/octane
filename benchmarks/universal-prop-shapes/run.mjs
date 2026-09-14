// Untimed V8 shape evidence for public universal component and host props.
process.env.NODE_ENV = 'production';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { pathToFileURL } from 'node:url';

if (!process.execArgv.includes('--allow-natives-syntax')) {
	const child = spawnSync(
		process.execPath,
		['--allow-natives-syntax', ...process.execArgv, import.meta.filename, ...process.argv.slice(2)],
		{ stdio: 'inherit' },
	);
	process.exit(child.status ?? 1);
}
const observe = process.argv.includes('--observe');
const repo = path.resolve(import.meta.dirname, '../..');
let runtime = process.env.BENCH_RUNTIME_URL;
let bundle = null;
if (runtime === undefined) {
	const requireDependencies = createRequire(path.join(repo, 'packages/octane/package.json'));
	const { build, version: esbuildVersion } = requireDependencies('esbuild');
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-universal-props-'));
	process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
	const sourceRef = process.env.BENCH_SOURCE_REF;
	const source =
		sourceRef === undefined
			? null
			: execFileSync('git', ['show', `${sourceRef}:packages/octane/src/universal-core.ts`], {
					cwd: repo,
					encoding: 'utf8',
				});
	const result = await build({
		entryPoints: [path.join(repo, 'packages/octane/src/universal-native.ts')],
		bundle: true,
		platform: 'node',
		format: 'esm',
		write: false,
		minify: true,
		define: { 'process.env.NODE_ENV': '"production"' },
		plugins:
			source === null
				? []
				: [
						{
							name: 'universal-source',
							setup(builder) {
								builder.onLoad({ filter: /[/\\]universal-core\.ts$/ }, () => ({
									contents: source,
									loader: 'ts',
									resolveDir: path.join(repo, 'packages/octane/src'),
								}));
							},
						},
					],
	});
	const output = path.join(temporary, 'universal.mjs');
	fs.writeFileSync(output, result.outputFiles[0].text);
	bundle = {
		sha256: createHash('sha256').update(result.outputFiles[0].text).digest('hex'),
		esbuildVersion,
		minified: true,
		production: true,
		sourceRef: sourceRef ?? 'working tree',
	};
	runtime = pathToFileURL(output).href;
}
const runtimeExports = await import(runtime);
if (process.argv.includes('--timing')) {
	const { runTiming } = await import('./timing.mjs');
	await runTiming(runtimeExports, bundle);
	process.exit(0);
}
const {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalComponent,
	universalFor,
	universalPlan,
	universalProps,
	universalValue,
} = runtimeExports;
const fast = new Function('props', 'return %HasFastProperties(props);');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const diagnostics = [];
const hostPlan = universalPlan('object', { kind: 'host', type: 'item', propsSlot: 0 });
const emptyPlan = universalPlan('object', { kind: 'host', type: 'empty' });
const leafPlan = universalPlan('object', {
	kind: 'host',
	type: 'item',
	bindings: [
		['id', 0],
		['label', 1],
	],
});
const fallbackPlan = universalPlan('object', {
	kind: 'host',
	type: 'item',
	bindings: [
		['id', 0],
		['onSelect', 1],
		['label', 2],
	],
	children: [{ kind: 'host', type: 'empty' }],
});
for (const mode of [
	'plain-component',
	'keyed-component',
	'spread-keyed-component',
	'plain-host',
	'ownerless-leaf-host',
	'compact-leaf-host',
	'event-host',
	'fallback-event-host',
	'null-event-host',
	'reserved-host',
	'lifecycle-host',
	'local-callback-host',
]) {
	const captured = [];
	const outcomes = [];
	const container = createObjectContainer();
	const base = createObjectDriver();
	const log = [];
	const onSelect = () => log.push('event');
	const onUpdate = () => log.push('update');
	const attach = () => {
		log.push('attach');
		return () => log.push('detach');
	};
	const ref = (host) => log.push(host === null ? 'ref:null' : 'ref:item');
	let templateMounts = 0;
	const root = createUniversalRoot(container, {
		...base,
		capabilities:
			mode === 'fallback-event-host'
				? {
						...base.capabilities,
						templateMount: true,
						collapsedTemplateMount: true,
						templateProgramMount: false,
					}
				: mode.endsWith('leaf-host')
					? { ...base.capabilities, compilerLeafProps: true }
					: base.capabilities,
		prepareBatch(target, batch, context) {
			const commands = [];
			for (const command of batch.commands) {
				assert.ok(command.op !== 'mount-template-range' && command.op !== 'mount-template-run');
				if (command.op !== 'mount-template') {
					commands.push(command);
					continue;
				}
				templateMounts++;
				for (let index = 0; index < command.nodes.length; index++) {
					const node = command.nodes[index];
					commands.push({
						op: 'create',
						id: node.id,
						type: command.shape[index].type,
						props: node.props,
					});
					for (const event of node.events ?? [])
						commands.push({ op: 'event', id: node.id, type: event.type, listener: event.listener });
				}
				for (let index = command.nodes.length - 1; index >= 0; index--) {
					commands.push({
						op: 'insert',
						id: command.nodes[index].id,
						parent: index === 0 ? command.parent : command.nodes[command.shape[index].parent].id,
						before: index === 0 ? command.before : null,
					});
				}
			}
			for (const command of commands) {
				if (
					(command.op === 'create' || command.op === 'update') &&
					!mode.endsWith('component') &&
					Object.hasOwn(command.props, 'id')
				)
					captured.push(command.props);
			}
			return base.prepareBatch(target, { ...batch, commands }, context);
		},
	});
	const Child = defineUniversalComponent('object', (props) => {
		assert.equal(Object.hasOwn(props, 'key'), false);
		assert.deepEqual(Object.keys(props), ['id', 'label']);
		outcomes.push([props.id, props.label]);
		return universalValue(emptyPlan);
	});
	const Scene = defineUniversalComponent('object', ({ version }) => {
		if (mode.endsWith('leaf-host'))
			return universalFor(
				[0],
				(id) => id,
				() => universalValue(leafPlan, [version, `row:${version}`]),
				null,
				true,
				mode === 'compact-leaf-host',
			);
		if (mode === 'fallback-event-host')
			return universalValue(fallbackPlan, [version, onSelect, `row:${version}`]);
		const entries = [
			['set', 'id', version],
			['set', 'label', `row:${version}`],
		];
		if (mode.endsWith('component')) {
			if (mode === 'keyed-component') entries.unshift(['set', 'key', 'stable']);
			const value =
				mode === 'spread-keyed-component'
					? universalComponent('object', Child, {
							key: 'stable',
							id: version,
							label: `row:${version}`,
						})
					: universalComponent('object', Child, universalProps(entries));
			captured.push(value.props.props);
			return value;
		}
		if (mode === 'event-host') entries.splice(1, 0, ['set', 'onSelect', onSelect]);
		if (mode === 'null-event-host') entries.splice(1, 0, ['set', 'onSelect', null]);
		if (mode === 'lifecycle-host') entries.splice(1, 0, ['set', 'onUpdate', onUpdate]);
		if (mode === 'local-callback-host') entries.splice(1, 0, ['set', 'attach', attach]);
		if (mode === 'reserved-host')
			entries.splice(1, 0, ['set', 'ref', ref], ['set', 'children', `child:${version}`]);
		return universalValue(hostPlan, [universalProps(entries)]);
	});
	let retained;
	for (let version = 0; version < 12; version++) {
		root.render(Scene, { version });
		const item = container.children[0];
		if (retained === undefined) retained = item;
		assert.equal(item, retained);
		if (!mode.endsWith('component')) {
			assert.deepEqual(item.props, { id: version, label: `row:${version}` });
			if (mode === 'reserved-host') assert.equal(item.children[0].props.value, `child:${version}`);
			outcomes.push([item.props.id, item.props.label]);
		}
		if (mode === 'event-host' || mode === 'fallback-event-host')
			container.dispatchEvent(item, 'select', undefined);
	}
	root.unmount();
	assert.equal(container.instanceCount, 0);
	if (mode === 'event-host' || mode === 'fallback-event-host')
		assert.deepEqual(log, Array(12).fill('event'));
	if (mode === 'lifecycle-host') assert.deepEqual(log, Array(12).fill('update'));
	if (mode === 'local-callback-host') assert.deepEqual(log, ['attach', 'detach']);
	if (mode === 'reserved-host') assert.deepEqual(log, ['ref:item', 'ref:null']);
	assert.equal(templateMounts, mode === 'fallback-event-host' ? 1 : 0);
	const sampled = captured.slice(4);
	assert.ok(sampled.length > 0);
	const fastProps = sampled.filter(fast).length;
	const result = {
		name: mode,
		records: sampled.length,
		fastProps,
		outputHash: hash([outcomes, log]),
	};
	diagnostics.push(result);
	if (!observe) assert.equal(fastProps, sampled.length, `${mode}: props entered dictionary mode`);
}
const targets = diagnostics.map(({ name, records, fastProps, outputHash }) => ({
	name,
	ops: { dictionary_props: deterministicStatForJson(deterministicCount(records - fastProps)) },
	meta: { records, fastProps, outputHash },
}));
targets.push({
	name: 'normalization-work',
	ops: { dictionary_props: deterministicStatForJson(deterministicCount(8)) },
	meta: { records: 8, outputHash: hash(8) },
});
const payload = {
	suite: 'universal-prop-shapes',
	bundle,
	iterations: 1,
	targets,
	nodeVersion: process.version,
	platform: process.platform,
	architecture: process.arch,
	diagnostics,
};
console.log(JSON.stringify(payload, null, 2));
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
