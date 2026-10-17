/**
 * The gzip-aware module order for scripts/split-runtime.mjs (`order`).
 *
 * Rolldown emits the runtime's concept modules in evaluation order, so their
 * order changes what gzip finds in its window, not what ships: every order the
 * map's constraints permit keeps the same code. The search builds the split
 * once with source maps (the shell_ app's framework chunk, the full-surface
 * ceiling that run.mjs reports as full_fw, and every Rolldown scenario of
 * run-minimal.mjs), cuts each chunk into the runs each module emitted, and
 * scores a candidate order by putting those runs in that order and gzipping.
 * A move that leaves the order of a chunk's modules unchanged reuses its size.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'packages/octane/src');
const SHELL = path.join(ROOT, 'benchmarks/bundle-size/apps/app-shell/octane-jsx');
const CEILING = path.join(ROOT, 'benchmarks/js-framework/octane-tsrx');
const isFrameworkModule = (id) => {
	const clean = id.split('?')[0];
	return (
		id.startsWith('\0') || clean.includes('node_modules') || clean.includes('/packages/octane/')
	);
};
const output = { codeSplitting: { groups: [{ name: 'framework', test: isFrameworkModule }] } };
const gz = (text) => zlib.gzipSync(text, { level: 9 }).length;

/** Source-map VLQ: the generated column and source index of each mapping, per line. */
function decodeMappings(mappings) {
	const lines = [];
	let column = 0;
	let source = 0;
	for (const line of mappings.split(';')) {
		const segments = [];
		column = 0;
		for (const segment of line.split(',')) {
			if (!segment) continue;
			const values = [];
			let value = 0;
			let shift = 0;
			for (const char of segment) {
				const digit = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(
					char,
				);
				value += (digit & 31) << shift;
				if (digit & 32) shift += 5;
				else {
					values.push(value & 1 ? -(value >>> 1) : value >>> 1);
					value = 0;
					shift = 0;
				}
			}
			column += values[0];
			if (values.length >= 4) {
				source += values[1];
				segments.push([column, source]);
			}
		}
		lines.push(segments);
	}
	return lines;
}

/** A chunk's runs, each emitted by one runtime module (`key`) or by anything else. */
function runsOf(code, map) {
	// Sources are relative to wherever the build put its output.
	const keys = map.sources.map(
		(s) => /packages\/octane\/src\/runtime\/([^/]+)\.ts$/.exec(s)?.[1] ?? null,
	);
	const starts = [0];
	for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
	const points = decodeMappings(map.mappings)
		.flatMap((segments, line) => segments.map(([column, s]) => [starts[line] + column, keys[s]]))
		.sort((a, b) => a[0] - b[0]);
	const runs = [];
	let key = null;
	let start = 0;
	for (const [offset, k] of points) {
		if (k === key) continue;
		if (offset > start) runs.push({ key, text: code.slice(start, offset) });
		key = k;
		start = offset;
	}
	runs.push({ key, text: code.slice(start) });
	return { runs, modules: new Set(runs.map((r) => r.key).filter(Boolean)), gz: gz(code) };
}

/** Builds the scored chunks from the split currently written under packages/octane/src. */
export async function buildChunks() {
	process.env.NODE_ENV = 'production';
	const require = createRequire(path.join(ROOT, 'benchmarks/bundle-size/package.json'));
	const { build } = await import(pathToFileURL(require.resolve('vite')).href);
	const out = fs.mkdtempSync(path.join(os.tmpdir(), 'split-runtime-order-'));
	try {
		const framework = async (name, config) => {
			const outDir = path.join(out, name);
			await build({
				logLevel: 'error',
				...config,
				build: {
					outDir,
					minify: 'oxc',
					target: 'esnext',
					sourcemap: true,
					...config.build,
					rollupOptions: { ...config.build?.rollupOptions, output },
				},
			});
			const assets = path.join(outDir, 'assets');
			const file = path.join(
				assets,
				fs.readdirSync(assets).find((f) => /^framework-.*\.js$/.test(f)),
			);
			const code = fs.readFileSync(file, 'utf8').replace(/\n\/\/# sourceMappingURL=.*\s*$/, '');
			return runsOf(code, JSON.parse(fs.readFileSync(file + '.map', 'utf8')));
		};
		const chunks = {};
		chunks.shell = await framework('shell', {
			root: SHELL,
			configFile: path.join(SHELL, 'vite.config.js'),
		});
		const entry = path.join(out, 'ceiling.js');
		fs.writeFileSync(
			entry,
			`import * as m0 from ${JSON.stringify(path.join(SOURCE, 'index.ts'))};\n` +
				`import * as m1 from ${JSON.stringify(path.join(SOURCE, 'internal/client.ts'))};\n` +
				'globalThis.__bundleSizeCeiling = [m0, m1];\n',
		);
		chunks.full = await framework('full', {
			root: CEILING,
			build: { rollupOptions: { input: entry } },
		});
		const minimal = path.join(out, 'minimal');
		fs.mkdirSync(minimal);
		const run = spawnSync(
			process.execPath,
			[path.join(ROOT, 'benchmarks/bundle-size/run-minimal.mjs')],
			{
				cwd: ROOT,
				env: { ...process.env, BUNDLE_SIZE_MAP_DIR: minimal },
				encoding: 'utf8',
				maxBuffer: 1 << 28,
			},
		);
		if (run.status !== 0) throw new Error(`run-minimal.mjs failed:\n${run.stdout}\n${run.stderr}`);
		for (const file of fs
			.readdirSync(minimal)
			.filter((f) => f.endsWith('.js'))
			.sort()) {
			const code = fs.readFileSync(path.join(minimal, file), 'utf8');
			const map = JSON.parse(fs.readFileSync(path.join(minimal, file + '.map'), 'utf8'));
			chunks[`minimal/${path.basename(file, '.js')}`] = runsOf(code, map);
		}
		return chunks;
	} finally {
		fs.rmSync(out, { recursive: true, force: true });
	}
}

/**
 * The permitted order with the lowest gzip total over every chunk: the best of
 * `seeds` simulated-annealing runs from `chain`, each moving one module or
 * swapping two while every module stays after the modules `before` names for
 * it. Deterministic for given arguments.
 */
export function searchOrder({ chain, before, chunks, evals = 40000, seeds = 4 }) {
	const cache = new Map();
	const size = (name, order) => {
		const { runs, modules } = chunks[name];
		const present = order.filter((m) => modules.has(m));
		const key = `${name}\0${present.join(' ')}`;
		let bytes = cache.get(key);
		if (bytes === undefined) {
			const rank = new Map(present.map((m, i) => [m, i]));
			const slots = [];
			const placed = [];
			runs.forEach((run, i) => {
				if (!rank.has(run.key)) return;
				slots.push(i);
				placed.push({ run, i });
			});
			placed.sort((a, b) => rank.get(a.run.key) - rank.get(b.run.key) || a.i - b.i);
			const text = runs.map((r) => r.text);
			slots.forEach((slot, j) => (text[slot] = placed[j].run.text));
			bytes = gz(text.join(''));
			cache.set(key, bytes);
		}
		return bytes;
	};
	const score = (order) => {
		let total = 0;
		for (const name of Object.keys(chunks)) total += size(name, order);
		return total;
	};
	const valid = (order) => {
		const position = new Map(order.map((m, i) => [m, i]));
		return order.every((m) =>
			[...(before.get(m) ?? [])].every((a) => position.get(a) < position.get(m)),
		);
	};
	let best = { order: chain, total: score(chain) };
	for (let seed = 1; seed <= seeds; seed++) {
		let state = seed;
		const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
		let order = [...chain];
		let current = score(order);
		let temperature = 60;
		for (let step = 0; step < evals; step++) {
			const next = [...order];
			if (random() < 0.6) {
				const [m] = next.splice(Math.floor(random() * next.length), 1);
				next.splice(Math.floor(random() * (next.length + 1)), 0, m);
			} else {
				const i = Math.floor(random() * next.length);
				const j = Math.floor(random() * next.length);
				[next[i], next[j]] = [next[j], next[i]];
			}
			temperature = Math.max(1, temperature * 0.9995);
			if (!valid(next)) continue;
			const total = score(next);
			if (total < current || random() < Math.exp((current - total) / temperature)) {
				order = next;
				current = total;
				if (total < best.total) best = { order: next, total };
			}
		}
	}
	const sizes = (o) => Object.fromEntries(Object.keys(chunks).map((name) => [name, size(name, o)]));
	return { order: best.order, before: sizes(chain), after: sizes(best.order) };
}
