// Tauri desktop-shell benchmark — octane vs React inside the REAL webview.
//
// Why this suite exists separately from the browser benchmarks: a Tauri app on
// macOS runs on WKWebView/JavaScriptCore and on Linux on WebKitGTK, not on the
// Chromium/V8 that the Playwright suites drive. A framework's ranking on V8 does
// not carry over to JSC, and the desktop cold start (process spawn, webview
// init, custom-protocol asset load) has no browser equivalent at all.
//
// It cannot be driven from outside either: tauri-driver is Linux/Windows only,
// because WKWebView exposes no WebDriver. So each target measures itself inside
// the window and reports through an IPC command, and this runner only spawns
// processes and aggregates.
//
// Ops:
//   boot_ms    navigation start → first presented frame (module parse+exec+mount)
//   stream_async_ms  4000 events pushed from Rust into a 200-row capped log tail
//   create_ms  commit 10,000 keyed rows
//   update_ms  commit a change to every tenth of those rows
//   swap_ms    commit a swap of two rows at opposite ends
//   clear_ms   commit the removal of all 10,000
//   js_bytes   shipped client JavaScript, raw and gzip
//
// The four row ops are synchronously flushed and time only the commit: their
// input arrays are built by shared code outside the measured region.
//
// WebKit quantizes performance.now() to 1ms, which is a large share of a fast
// op. Each launch therefore repeats the row ops ROW_PASSES times and reports
// every sample, so the aggregate averages the quantization out instead of
// reporting one heavily rounded number.
//
// Run:  node benchmarks/tauri-shell/run.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, constants as zc } from 'node:zlib';
import { summarizeSamples } from '../lib/stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGETS = ['octane-tsrx', 'react', 'inferno'];
const ACTIVE_DIR = path.join(__dirname, 'dist-active');
const BINARY = path.join(__dirname, 'src-tauri/target/release/tauri-shell-bench');
const WARMUPS = 1;
const REPS = Number(process.env.BENCH_REPS ?? 5);
const LAUNCH_TIMEOUT_MS = 240_000;

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
	}
}

function* walk(dir) {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) yield* walk(full);
		else yield full;
	}
}

function jsBytes(distDir) {
	let raw = 0;
	let gzip = 0;
	for (const file of walk(distDir)) {
		if (!file.endsWith('.js')) continue;
		const buf = fs.readFileSync(file);
		raw += buf.length;
		gzip += gzipSync(buf, { level: zc.Z_BEST_COMPRESSION }).length;
	}
	return { raw, gzip };
}

// The terminating newline is what proves the report line is whole. Under /m a
// bare `$` also matches end-of-string, so a chunk that stops mid-JSON would
// match as a finished line, JSON.parse would throw on the truncation, and the
// child would be killed before the rest of the line ever arrived.
const RESULT_LINE = /^BENCH_RESULT (.*)\r?\n/m;

/**
 * Boot the host once against whatever sits in dist-active and resolve the
 * measurements the page reported. Every repetition is a fresh process, so the
 * boot number is a real cold start rather than a reload.
 */
function launchOnce() {
	return new Promise((resolve, reject) => {
		const child = spawn(BINARY, [], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error(`benchmark window produced no result within ${LAUNCH_TIMEOUT_MS}ms`));
		}, LAUNCH_TIMEOUT_MS);

		child.stdout.on('data', (chunk) => {
			stdout += chunk;
			const match = RESULT_LINE.exec(stdout);
			if (match === null) return;
			clearTimeout(timer);
			try {
				resolve(JSON.parse(match[1]));
			} catch (error) {
				reject(error);
			}
			child.kill('SIGTERM');
		});
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			if (!RESULT_LINE.test(stdout)) {
				reject(new Error(`host exited with ${code} before reporting\n${stderr}`));
			}
		});
	});
}

function activate(target) {
	fs.rmSync(ACTIVE_DIR, { recursive: true, force: true });
	fs.cpSync(path.join(__dirname, target, 'dist'), ACTIVE_DIR, { recursive: true });
}

async function measure(target) {
	const streamRenders = [];
	const streamSyncRenders = [];
	const samples = {
		boot_ms: [],
		stream_async_ms: [],
		stream_sync_ms: [],
		create_ms: [],
		update_ms: [],
		swap_ms: [],
		clear_ms: [],
	};
	for (let i = 0; i < WARMUPS + REPS; i++) {
		const result = await launchOnce();
		// The window runs incognito so WKWebView cannot serve the previous target's
		// index.html out of its URL cache. This assertion is what caught that
		// happening; keep it as the guard that the swap actually took.
		if (result.target !== target) {
			throw new Error(`expected a report from ${target}, received ${result.target}`);
		}
		// The first launch pays for OS and WebKit caches the later ones reuse;
		// keeping it would charge that one-time cost to whichever target ran first.
		if (i < WARMUPS) continue;
		// Row ops report one array per launch (many passes each); boot and stream
		// happen once per process and report a scalar.
		for (const op of Object.keys(samples)) {
			const value = result[op];
			if (Array.isArray(value)) samples[op].push(...value);
			else samples[op].push(value);
		}
		streamRenders.push(result.stream_async_renders);
		streamSyncRenders.push(result.stream_sync_renders);
	}
	return { samples, streamRenders, streamSyncRenders };
}

const results = {};
for (const target of TARGETS) {
	console.log(`\n--- building ${target} ---`);
	run('pnpm', ['exec', 'vite', 'build'], path.join(__dirname, target));
}

for (const target of TARGETS) {
	// generate_context! EMBEDS frontendDist into the executable, so swapping the
	// directory after a build changes nothing. The host is rebuilt per target;
	// only this crate recompiles, its dependency graph is already cached.
	console.log(`\n--- building the Tauri host for ${target} (release) ---`);
	activate(target);
	run('cargo', ['build', '--release'], path.join(__dirname, 'src-tauri'));

	console.log(`\n--- measuring ${target} (${WARMUPS} warmup + ${REPS} runs) ---`);
	const { samples, streamRenders, streamSyncRenders } = await measure(target);
	results[target] = {
		bytes: jsBytes(path.join(__dirname, target, 'dist')),
		stream_async_renders: summarizeSamples(streamRenders).median,
		stream_sync_renders: summarizeSamples(streamSyncRenders).median,
		ops: Object.fromEntries(
			Object.entries(samples).map(([op, values]) => [op, summarizeSamples(values)]),
		),
	};
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const ms = (n) => `${n.toFixed(1)} ms`;
const ratio = (a, b) => (b === 0 ? '-' : `${(a / b).toFixed(2)}x`);

console.log('\n=== Tauri desktop shell: Octane, React, and Inferno (WKWebView) ===\n');
const TIMED = [
	['boot_ms', 'cold start'],
	['stream_async_ms', '4000 IPC events, default batching'],
	['stream_sync_ms', '4000 IPC events, one commit each'],
	['create_ms', 'create 10k rows'],
	['update_ms', 'update every 10th'],
	['swap_ms', 'swap two rows'],
	['clear_ms', 'clear 10k rows'],
];
// WebKit's 1ms clock makes any median at or below 2ms mostly quantization, so
// a ratio built on it is not a number worth quoting to two decimals.
const FLOOR_MS = 2;
const atFloor = (op) => TARGETS.some((t) => results[t].ops[op].median <= FLOOR_MS);

const rows = [
	['op', ...TARGETS, 'react/octane'],
	...TIMED.map(([op, caption]) => [
		`${op} (${caption})`,
		...TARGETS.map((t) => ms(results[t].ops[op].median)),
		atFloor(op)
			? `~${ratio(results.react.ops[op].median, results['octane-tsrx'].ops[op].median)} (clock floor)`
			: ratio(results.react.ops[op].median, results['octane-tsrx'].ops[op].median),
	]),
	[
		'commits during stream_async_ms',
		...TARGETS.map((t) => String(results[t].stream_async_renders)),
		ratio(results.react.stream_async_renders, results['octane-tsrx'].stream_async_renders),
	],
	[
		'commits during stream_sync_ms',
		...TARGETS.map((t) => String(results[t].stream_sync_renders)),
		ratio(results.react.stream_sync_renders, results['octane-tsrx'].stream_sync_renders),
	],
	[
		'js bytes',
		...TARGETS.map((t) => kb(results[t].bytes.raw)),
		ratio(results.react.bytes.raw, results['octane-tsrx'].bytes.raw),
	],
	[
		'js bytes (gzip)',
		...TARGETS.map((t) => kb(results[t].bytes.gzip)),
		ratio(results.react.bytes.gzip, results['octane-tsrx'].bytes.gzip),
	],
];
const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => row[col].length)));
for (const row of rows) {
	console.log(row.map((cell, col) => cell.padEnd(widths[col])).join('  '));
}

const outFile = process.env.BENCH_JSON ?? path.join(__dirname, 'results.json');
fs.writeFileSync(outFile, `${JSON.stringify({ suite: 'tauri-shell', results }, null, 2)}\n`);
console.log(`\nwrote ${outFile}`);
