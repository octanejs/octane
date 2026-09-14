// Register the existing naive JSX/TSRX work driver with the unified ratio gate.
// The driver owns semantic and reached-work assertions; this adapter owns only
// isolated production builds, clean/observed comparison, and BENCH_JSON output.
process.env.NODE_ENV = 'production';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const repo = path.resolve(import.meta.dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-audit-naive-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const count = (value) => ({ median: value, min: value });
const targets = [];
const builds = [];
let chromiumVersion;

function run(args, cwd, env = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, {
			cwd,
			env: { ...process.env, ...env },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', (chunk) => {
			output += chunk;
		});
		child.stderr.on('data', (chunk) => {
			output += chunk;
		});
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) resolve(output);
			else reject(new Error(`Command exited ${code}: ${args.join(' ')}\n${output}`));
		});
	});
}

function serve(directory) {
	const server = http.createServer((request, response) => {
		const pathname = new URL(request.url, 'http://localhost').pathname;
		const filename = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
		if (!filename.startsWith(directory + path.sep) || !fs.existsSync(filename)) {
			response.writeHead(404).end();
			return;
		}
		response.setHeader(
			'Content-Type',
			filename.endsWith('.js')
				? 'text/javascript'
				: filename.endsWith('.css')
					? 'text/css'
					: 'text/html',
		);
		response.end(fs.readFileSync(filename));
	});
	return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

try {
	for (const dialect of ['jsx', 'tsrx']) {
		const fixture = path.join(repo, 'benchmarks/js-framework', `octane-${dialect}-naive`);
		const outDir = path.join(scratch, dialect);
		const require = createRequire(path.join(fixture, 'package.json'));
		const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
		await run([vite, 'build', '--minify', 'false', '--outDir', outDir], fixture);
		const assets = fs
			.readdirSync(path.join(outDir, 'assets'))
			.filter((name) => name.endsWith('.js'));
		assert(assets.length > 0, 'the real production app must contain JavaScript');
		builds.push({
			dialect,
			assets: assets.map((name) => ({
				name,
				sha256: hash(fs.readFileSync(path.join(outDir, 'assets', name))),
			})),
		});
		const server = await serve(outDir);
		try {
			const results = [];
			for (const clean of [true, false]) {
				const output = path.join(scratch, `${dialect}-${clean}.json`);
				await run([path.join(repo, 'benchmarks/js-framework/style-work.mjs')], repo, {
					WORK_DIALECT: dialect,
					WORK_CLEAN: clean ? '1' : '0',
					WORK_JSON: output,
					WORK_MODE: '',
					TARGET_URL: `http://127.0.0.1:${server.address().port}/`,
				});
				results.push(JSON.parse(fs.readFileSync(output, 'utf8')));
			}
			assert.deepEqual(
				results.map((result) => result.failures),
				[[], []],
			);
			assert.equal(results[0].chromium, results[1].chromium);
			chromiumVersion = results[0].chromium;
			for (const [operation, observed] of Object.entries(results[1].results)) {
				const clean = results[0].results[operation];
				for (const key of ['rows', 'selected', 'htmlSha256'])
					assert.equal(observed[key], clean[key], `${dialect} ${operation}: clean/observed ${key}`);
				const ops = Object.fromEntries(
					[
						'setStyle',
						'applyStyleValue',
						'applyStyleProperty',
						'setStyleProperty',
						'Row',
						'renderBlockInner',
						'styleSets',
						'styleRemoves',
						'fontWeightWrites',
						'fontStyleWrites',
					].map((name) => [name, count(observed[name])]),
				);
				targets.push({
					name: `naive-${dialect}-${operation}`,
					ops,
					semantic: { htmlSha256: clean.htmlSha256, rows: clean.rows, selected: clean.selected },
				});
				// A positive per-row denominator keeps every zero-work guard defined.
				targets.push({
					name: `naive-${dialect}-${operation}-rows`,
					ops: Object.fromEntries(Object.keys(ops).map((name) => [name, count(clean.rows)])),
				});
			}
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	}
	const result = {
		suite: 'audit-981-coverage',
		iterations: 1,
		environment: {
			node: process.version,
			chromium: chromiumVersion,
			platform: process.platform,
			arch: process.arch,
		},
		builds,
		targets,
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result, null, 2));
} finally {
	fs.rmSync(scratch, { recursive: true, force: true });
}
