// Universal leaf-update scope benchmark. This intentionally follows the public
// issue #574 reproduction so both the compiler output and native object driver
// participate in the measured update.
process.env.NODE_ENV = 'production';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const rawIterations = process.argv[2] ?? '5';
const iterations = Number(rawIterations);

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
	cwd: REPO,
	stdio: 'inherit',
});
if ((build.status ?? 1) !== 0) throw new Error('The octane package build failed.');

const DIST = path.join(REPO, 'packages/octane/dist');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-universal-leaf-update-'));
let payload;

const appSource = `
import { useState } from 'octane';

function Leaf({ index }) {
  return <view label={'leaf-' + index} />;
}

function Counter() {
  const [count, setCount] = useState(0);
  return <view focusable={true} onPress={() => setCount((value) => value + 1)} label={'count-' + count} />;
}

export default function App({ size }) {
  return (
    <view>
      <Counter />
      {Array.from({ length: size }, (_, index) => (
        <Leaf key={index} index={index} />
      ))}
    </view>
  );
}
`;

try {
	const { compile } = await import(pathToFileURL(path.join(DIST, 'compiler/index.js')).href);
	const runtimeUrl = pathToFileURL(path.join(DIST, 'universal-native.js')).href;
	fs.writeFileSync(
		path.join(tempDir, 'runtime.mjs'),
		`export * from ${JSON.stringify(runtimeUrl)};\n`,
	);
	const compiled = compile(appSource, 'app.jsx', {
		mode: 'client',
		renderer: {
			id: 'object',
			module: './runtime.mjs',
			target: 'universal',
			server: 'unsupported',
			text: 'host',
			capabilities: [],
		},
	});
	if (compiled.diagnostics?.length) {
		throw new Error(`Compiler diagnostics: ${JSON.stringify(compiled.diagnostics)}`);
	}
	fs.writeFileSync(path.join(tempDir, 'app.mjs'), compiled.code);

	const { createObjectContainer, createObjectDriver, createUniversalRoot, flushUniversalSync } =
		await import(runtimeUrl);
	const { default: App } = await import(pathToFileURL(path.join(tempDir, 'app.mjs')).href);

	const findCounter = (children) => {
		for (const child of children) {
			if (String(child.props?.label ?? '').startsWith('count-')) return child;
			const nested = findCounter(child.children ?? []);
			if (nested) return nested;
		}
		return null;
	};

	const sizes = [0, 500, 1_000, 2_000, 4_000];
	const warmupPresses = 30;
	const pressesPerSample = 100;
	const targets = [];
	const failures = [];

	for (const size of sizes) {
		const container = createObjectContainer('object');
		const root = createUniversalRoot(container, createObjectDriver('object'));
		flushUniversalSync(() => root.render(App, { size }));
		const counter = findCounter(container.children);
		if (counter === null) throw new Error(`Counter instance missing at size ${size}.`);
		const scene = container.children[0];
		const leaves = scene.children.slice(1);
		const press = () =>
			flushUniversalSync(() => container.dispatchEvent(counter, 'press', Object.freeze({})));
		for (let index = 0; index < warmupPresses; index++) press();

		const samples = [];
		for (let iteration = 0; iteration < iterations; iteration++) {
			container.commits.length = 0;
			const start = performance.now();
			for (let index = 0; index < pressesPerSample; index++) press();
			samples.push((performance.now() - start) / pressesPerSample);
		}

		const expectedLabel = `count-${warmupPresses + iterations * pressesPerSample}`;
		const actualLabel = String(counter.props?.label ?? '');
		const expectedInstances = size + 2;
		if (actualLabel !== expectedLabel) {
			failures.push(`size ${size}: expected ${expectedLabel}, received ${actualLabel}`);
		}
		if (container.instanceCount !== expectedInstances) {
			failures.push(
				`size ${size}: expected ${expectedInstances} host instances, received ${container.instanceCount}`,
			);
		}
		if (scene.children[0] !== counter || leaves.length !== size) {
			failures.push(`size ${size}: the retained counter/leaf shape changed during its updates`);
		}
		for (let index = 0; index < leaves.length; index++) {
			const leaf = scene.children[index + 1];
			if (leaf !== leaves[index] || leaf.props?.label !== `leaf-${index}`) {
				failures.push(`size ${size}: leaf ${index} lost its identity or label`);
				break;
			}
		}

		const stats = summarizeSamples(samples);
		targets.push({
			name: `siblings-${size}`,
			ops: { leaf_update_ms: timingStatForJson(stats) },
			meta: {
				siblings: size,
				hostInstances: container.instanceCount,
				finalLabel: actualLabel,
				retainedLeaves: leaves.length,
				presses: warmupPresses + iterations * pressesPerSample,
			},
		});
		root.unmount();
	}

	payload = {
		suite: 'universal-leaf-update',
		iterations,
		targets,
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};

	console.log('| stateless siblings | host instances | ms per leaf setState |');
	console.log('| ---: | ---: | ---: |');
	for (const target of targets) {
		console.log(
			`| ${target.meta.siblings} | ${target.meta.hostInstances} | ${target.ops.leaf_update_ms.score.toFixed(3)} |`,
		);
	}
	if (failures.length !== 0) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-leaf-update', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
