// Runs alien-signals' own benchmarks (alien-upstream/benchs) against
// alien-signals and against Octane's engine. See README.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, 'alien-upstream');
const OUT = path.join(HERE, 'dist', 'alien-upstream');
const jitless = process.argv.includes('--jitless');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);

/** `direct` lanes observe a computed value itself instead of wrapping the effect body. */
const LANES = [
	{ name: 'alien', entry: `export * from 'alien-signals';`, direct: false },
	{ name: 'octane', entry: `export * from './octane.mjs';`, direct: false },
	{ name: 'octane-direct', entry: `export * from './octane.mjs';`, direct: true },
];
const EFFECT = /effect\(\(\) => (?:void )?(\w+(?:\[\w+\])?)\(\)\)/g;

for (const lane of LANES) {
	const dir = path.join(OUT, lane.name);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(path.join(dir, 'benchs'), { recursive: true });
	// Every lane is bundled with the same production options.
	await build({
		stdin: { contents: lane.entry, resolveDir: SOURCE, sourcefile: `${lane.name}-entry.mjs` },
		outfile: path.join(dir, 'esm', 'index.mjs'),
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"' },
		logLevel: 'warning',
	});
	for (const file of fs.readdirSync(path.join(SOURCE, 'benchs'))) {
		let source = fs.readFileSync(path.join(SOURCE, 'benchs', file), 'utf8');
		if (lane.direct) {
			const observed = source.replace(EFFECT, 'observe($1)').replace('effect,', 'observe,');
			if (observed === source || observed.includes('effect(')) {
				throw new Error(`${file}: no effect call to observe directly`);
			}
			source = observed;
		}
		fs.writeFileSync(path.join(dir, 'benchs', file), source);
	}
}

function run(lane, file, flags) {
	const result = spawnSync(process.execPath, [...flags, '--expose-gc', `benchs/${file}`], {
		cwd: path.join(OUT, lane.name),
		encoding: 'utf8',
	});
	if (result.status !== 0) throw new Error(`${lane.name} ${file} failed:\n${result.stderr}`);
	return result.stdout;
}

const UNITS = { ps: 1e-6, ns: 1e-3, µs: 1, ms: 1e3, s: 1e6 };
/** Each lane's operations, in the shape benchmarks/bench.mjs collects. */
const ops = new Map(LANES.map((lane) => [lane.name, {}]));

/** Print one benchmark's rows with each lane's ratio to alien-signals. */
function report(title, rows) {
	console.log(`\n${title}`);
	const table = {};
	for (const [name, values] of rows) {
		const row = (table[name] = {});
		for (const lane of LANES) {
			row[lane.name] = values[lane.name];
			if (lane.name !== 'alien') {
				row[`${lane.name}÷alien`] = Number((values[lane.name] / values.alien).toFixed(2));
			}
		}
	}
	console.table(table);
}

if (only !== 'propagate') {
	const rows = new Map();
	for (const lane of LANES) {
		for (const [, name, kb] of run(lane, 'memoryUsage.mjs', []).matchAll(
			/^(\w+): ([\d.]+) KB$/gm,
		)) {
			if (!rows.has(name)) rows.set(name, {});
			rows.get(name)[lane.name] = Number(kb);
			ops.get(lane.name)[`heap_kb_${name}`] = {
				score: Number(kb),
				median: Number(kb),
				min: Number(kb),
				samples: 1,
			};
		}
	}
	if (rows.size === 0) throw new Error('memoryUsage.mjs printed no result rows');
	report('memoryUsage.mjs (KB)', rows);
}

if (only !== 'memory') {
	const rows = new Map();
	const time = '`\\s*([\\d.]+) (\\S+?)(?:/iter)?`';
	const row = new RegExp(`^\\| propagate: (\\d+) \\* (\\d+)\\s*\\| ${time} \\| ${time} \\|`, 'gm');
	for (const lane of LANES) {
		const output = run(lane, 'propagate.mjs', jitless ? ['--jitless'] : []);
		for (const [, w, h, average, unit, least, leastUnit] of output.matchAll(row)) {
			const name = `${w} * ${h}`;
			const micros = Number(average) * UNITS[unit];
			if (!rows.has(name)) rows.set(name, {});
			rows.get(name)[lane.name] = Number(micros.toFixed(3));
			// The shared runner's timing operations are milliseconds.
			ops.get(lane.name)[`propagate_${w}x${h}`] = {
				score: micros / 1e3,
				median: micros / 1e3,
				min: (Number(least) * UNITS[leastUnit]) / 1e3,
				samples: 1,
			};
		}
	}
	if (rows.size === 0) throw new Error('propagate.mjs printed no result rows');
	report(`propagate.mjs${jitless ? ' --jitless' : ''} (µs per update, chains * depth)`, rows);
}

if (process.env.BENCH_JSON) {
	const payload = {
		suite: 'alien-signals-upstream',
		iterations: 1,
		targets: LANES.map((lane) => ({ name: lane.name, ops: ops.get(lane.name), meta: { jitless } })),
	};
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, 2)}\n`);
}
