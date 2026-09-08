import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from '@babel/core';
import reactCompilerPlugin from 'babel-plugin-react-compiler';
import infernoCompilerPlugin from 'babel-plugin-inferno';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEWS = path.resolve(HERE, '../news');
const newsRequire = createRequire(path.join(NEWS, 'package.json'));
const octaneRequire = createRequire(path.join(NEWS, 'octane-tsrx', 'package.json'));
const { transformWithEsbuild } = await import(pathToFileURL(newsRequire.resolve('vite')).href);
const { compile: compileOctane } = await import(
	pathToFileURL(octaneRequire.resolve('octane/compiler')).href
);
const TARGETS = ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'];
const iterations = Number.parseInt(process.argv[2] ?? '5', 10);
const sizes = iterations <= 2 ? [10, 100] : [10, 100, 1_000];

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Compiler throughput iterations must be a positive integer');
}

function sourceFor(target, count, revision = 0) {
	const rows = Array.from({ length: count }, (_, index) => {
		const id = index === count - 1 ? index + revision : index;
		if (target === 'svelte') return `<article data-index="${id}">{value}</article>`;
		if (target === 'vue-vapor') return `<article data-index="${id}">{{ props.value }}</article>`;
		if (target === 'octane-tsrx') {
			return `<article data-index="${id}">{props.value as string}</article>`;
		}
		return `<article data-index="${id}">{props.value}</article>`;
	}).join('\n');
	if (target === 'octane-tsrx') return `export function Benchmark(props) @{ <main>${rows}</main> }`;
	if (target === 'svelte') return `<script>let { value } = $props();</script><main>${rows}</main>`;
	if (target === 'vue-vapor') {
		return `<script setup vapor>const props = defineProps(['value'])</script><template><main>${rows}</main></template>`;
	}
	return `export function Benchmark(props) { return <main>${rows}</main>; }`;
}

async function loadFromTarget(target, specifier) {
	let require = createRequire(path.join(NEWS, target, 'package.json'));
	try {
		return await import(pathToFileURL(require.resolve(specifier)).href);
	} catch (error) {
		const compilerPlugin =
			target === 'solid'
				? 'vite-plugin-solid'
				: target === 'vue-vapor'
					? '@vitejs/plugin-vue'
					: null;
		if (compilerPlugin === null) throw error;
		require = createRequire(require.resolve(compilerPlugin));
		return import(pathToFileURL(require.resolve(specifier)).href);
	}
}

async function compilerFor(target) {
	if (target === 'octane-tsrx') {
		return (source, filename) =>
			compileOctane(source, filename, { mode: 'client', hmr: false, dev: false }).code;
	}
	if (target === 'react') {
		return async (source, filename) => {
			const compiled = transformSync(source, {
				babelrc: false,
				configFile: false,
				filename,
				parserOpts: { plugins: ['jsx'] },
				plugins: [reactCompilerPlugin],
			});
			if (!compiled?.code) throw new Error('React Compiler emitted no JavaScript');
			return (
				await transformWithEsbuild(compiled.code, filename, {
					loader: 'jsx',
					jsx: 'automatic',
					jsxImportSource: target,
					minify: false,
				})
			).code;
		};
	}
	if (target === 'preact') {
		return async (source, filename) =>
			(
				await transformWithEsbuild(source, filename, {
					loader: 'jsx',
					jsx: 'automatic',
					jsxImportSource: target,
					minify: false,
				})
			).code;
	}
	if (target === 'inferno') {
		return (source, filename) => {
			const compiled = transformSync(source, {
				babelrc: false,
				configFile: false,
				filename,
				parserOpts: { plugins: ['jsx'] },
				plugins: [[infernoCompilerPlugin, { imports: true }]],
			});
			if (!compiled?.code) throw new Error('Inferno compiler emitted no JavaScript');
			return compiled.code;
		};
	}
	if (target === 'solid') {
		const babel = await loadFromTarget(target, '@babel/core');
		const preset = await loadFromTarget(target, 'babel-preset-solid');
		return (source, filename) =>
			babel.transformSync(source, {
				babelrc: false,
				configFile: false,
				filename,
				presets: [[preset.default ?? preset, { generate: 'dom', hydratable: true }]],
			}).code;
	}
	if (target === 'svelte') {
		const compiler = await loadFromTarget(target, 'svelte/compiler');
		const { compile } = compiler.default ?? compiler;
		return (source, filename) =>
			compile(source, { filename, generate: 'client', dev: false }).js.code;
	}
	const { compileScript, compileTemplate, parse } = await loadFromTarget(
		target,
		'@vue/compiler-sfc',
	);
	return (source, filename) => {
		const { descriptor, errors } = parse(source, { filename });
		if (errors.length > 0) throw new Error(String(errors[0]));
		const script = compileScript(descriptor, { id: 'benchmark', inlineTemplate: false });
		const template = compileTemplate({
			id: 'benchmark',
			filename,
			source: descriptor.template.content,
			compilerOptions: { vapor: true },
		});
		if (template.errors.length > 0) throw new Error(String(template.errors[0]));
		return `${script.content}\n${template.code}`;
	};
}

async function measure(compile, target, count, revision) {
	const extension =
		target === 'octane-tsrx'
			? 'tsrx'
			: target === 'svelte'
				? 'svelte'
				: target === 'vue-vapor'
					? 'vue'
					: 'jsx';
	const filename = path.join(NEWS, target, `Benchmark.${extension}`);
	const started = performance.now();
	const output = await compile(sourceFor(target, count, revision), filename);
	const elapsed = performance.now() - started;
	if (typeof output !== 'string' || output.length === 0) {
		throw new Error(`${target}: ${count}-component production compilation emitted no JavaScript`);
	}
	return { elapsed, outputBytes: Buffer.byteLength(output) };
}

const results = [];
let failure;

for (const name of TARGETS) {
	try {
		const compile = await compilerFor(name);
		const ops = {};
		const points = [];
		for (const count of sizes) {
			const beforeHeap = process.memoryUsage().heapUsed;
			const cold = await measure(compile, name, count, 0);
			const warm = [];
			const incremental = [];
			for (let index = 0; index < iterations; index++) {
				warm.push((await measure(compile, name, count, 0)).elapsed);
				incremental.push((await measure(compile, name, count, index + 1)).elapsed);
			}
			ops[`cold_${count}`] = timingStatForJson(summarizeSamples([cold.elapsed]), { p99: true });
			ops[`warm_${count}`] = timingStatForJson(summarizeSamples(warm), { p99: true });
			ops[`incremental_${count}`] = timingStatForJson(summarizeSamples(incremental), { p99: true });
			points.push({
				components: count,
				heapDelta: process.memoryUsage().heapUsed - beforeHeap,
				outputBytes: cold.outputBytes,
			});
		}
		results.push({ name, ops, meta: { correctness: 'pass', points, compiler: name } });
		console.log(`PASS compiler-throughput/${name}: ${sizes.join(', ')} real compiled components`);
	} catch (error) {
		failure = `${name}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
		console.error(`FAIL compiler-throughput/${failure}`);
		break;
	}
}

const payload = {
	suite: 'compiler-throughput',
	iterations,
	targets: results,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
