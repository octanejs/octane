import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = (bytes) => ({ bytes: bytes.length, sha256: hash(bytes) });

function filesIn(directory, excluded = []) {
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => {
			if (excluded.includes(entry.name)) return [];
			const file = path.join(directory, entry.name);
			return entry.isDirectory() ? filesIn(file, excluded) : entry.isFile() ? [file] : [];
		});
}

function command(file, args, cwd) {
	try {
		return execFileSync(file, args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	} catch (error) {
		return { unavailable: error.message };
	}
}

function packageVersions(tree) {
	const require = createRequire(path.join(tree, 'package.json'));
	return Object.fromEntries(
		['vite', 'esbuild', 'rolldown', 'playwright', '@tsrx/core', '@tsrx/oxc'].map((name) => {
			try {
				return [
					name,
					JSON.parse(fs.readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version,
				];
			} catch (error) {
				return [name, { unavailable: error.message }];
			}
		}),
	);
}

// Runs before any fixture's warmup/timing. Response bodies are decoded HTTP
// entity bytes, directly comparable to the exact on-disk production assets.
export async function capturePairedArtifacts(directory, { trees, fixtures, chromiumExecutable }) {
	fs.mkdirSync(directory, { recursive: true });
	const manifest = {
		capturedAt: new Date().toISOString(),
		environment: {
			node: process.version,
			pnpm: command('pnpm', ['--version']),
			chromium: command(chromiumExecutable, ['--version']),
			chromiumExecutable,
			platform: os.platform(),
			release: os.release(),
			arch: os.arch(),
			cpu: os.cpus()[0]?.model,
			cpuCount: os.cpus().length,
			totalMemory: os.totalmem(),
			loadavg: os.loadavg(),
			runId: process.env.GITHUB_RUN_ID ?? null,
			runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
			job: process.env.GITHUB_JOB ?? null,
		},
		trees: {},
	};
	try {
		for (const [side, tree] of Object.entries(trees)) {
			const entry = (manifest.trees[side] = {
				commit: command('git', ['rev-parse', 'HEAD'], tree),
				tree: command('git', ['rev-parse', 'HEAD^{tree}'], tree),
				packages: packageVersions(tree),
				inputs: {},
				fixtures: {},
			});
			for (const relative of [
				'pnpm-lock.yaml',
				'benchmarks/js-framework/pair.mjs',
				'benchmarks/js-framework/pair-artifacts.mjs',
				'benchmarks/js-framework/operations.mjs',
				'benchmarks/lib/stats.mjs',
			]) {
				const bytes = fs.readFileSync(path.join(tree, relative));
				entry.inputs[relative] = record(bytes);
			}
			for (const fixture of fixtures) {
				const source = path.join(tree, 'benchmarks/js-framework', fixture.directory);
				const dist = path.join(source, 'dist');
				const capture = path.join(directory, side, fixture.name);
				const output = (entry.fixtures[fixture.name] = { source: {}, dist: {}, served: {} });
				for (const file of filesIn(source, ['node_modules', 'dist'])) {
					output.source[path.relative(source, file)] = record(fs.readFileSync(file));
				}
				for (const file of filesIn(dist)) {
					const relative = path.relative(dist, file);
					const bytes = fs.readFileSync(file);
					const snapshot = path.join(capture, 'dist', relative);
					fs.mkdirSync(path.dirname(snapshot), { recursive: true });
					fs.writeFileSync(snapshot, bytes);
					output.dist[relative] = record(bytes);
				}
				for (const [relative, expected] of Object.entries(output.dist)) {
					const suffix =
						relative === 'index.html'
							? ''
							: relative.split(path.sep).map(encodeURIComponent).join('/');
					const url = `http://localhost:${fixture[side]}/${suffix}`;
					const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
					const bytes = Buffer.from(await response.arrayBuffer());
					const snapshot = path.join(capture, 'served', relative);
					fs.mkdirSync(path.dirname(snapshot), { recursive: true });
					fs.writeFileSync(snapshot, bytes);
					output.served[relative] = {
						url,
						responseUrl: response.url,
						status: response.status,
						headers: Object.fromEntries(response.headers),
						...record(bytes),
					};
					if (!response.ok || hash(bytes) !== expected.sha256) {
						throw new Error(
							`Served artifact differs from build: ${side}/${fixture.name}/${relative} (${response.status})`,
						);
					}
				}
			}
		}
	} catch (error) {
		manifest.failed = error.stack ?? String(error);
		throw error;
	} finally {
		fs.writeFileSync(
			path.join(directory, 'manifest.json'),
			JSON.stringify(manifest, null, 2) + '\n',
		);
	}
}

export function writePairedSamples(directory, fixture, operation, samples) {
	const target = path.join(directory, 'samples', fixture);
	fs.mkdirSync(target, { recursive: true });
	fs.writeFileSync(path.join(target, `${operation}.json`), JSON.stringify(samples, null, 2) + '\n');
}

function isListening(port, timeoutMs) {
	return new Promise((resolve) => {
		const socket = net.connect(port, 'localhost');
		const finish = (listening) => {
			clearTimeout(timer);
			socket.destroy();
			resolve(listening);
		};
		const timer = setTimeout(() => finish(true), timeoutMs);
		socket.once('connect', () => finish(true));
		socket.once('error', () => finish(false));
	});
}

// Only the caller's process groups are terminated. A reused port stays a hard
// error; never kill a process merely because it now owns a fixture port.
export async function waitForPreviewPortsClosed(ports, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const listening = await Promise.all(
			ports.map((port) => isListening(port, Math.max(1, Math.min(250, deadline - Date.now())))),
		);
		if (!listening.some(Boolean)) return;
		if (Date.now() >= deadline)
			throw new Error(
				`Preview ports still open after cleanup: ${ports.filter((_, i) => listening[i]).join(', ')}`,
			);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}
