import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
	decode_napi as decodeNativeBundleWithNapi,
	decode_wasm as decodeNativeBundleWithWasm,
	supportNapi,
} from '@lynx-js/tasm';
import { expect, it } from 'vitest';

const WORKSPACE_ROOT = resolve(import.meta.dirname, '../../..');

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				server.close();
				reject(new Error('Could not reserve a TCP port for the Lynx demo.'));
				return;
			}
			server.close((error) => {
				if (error) reject(error);
				else resolvePort(address.port);
			});
		});
	});
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForBundle(
	child: ChildProcess,
	url: string,
	output: () => string,
	timeoutMs: number,
): Promise<Buffer> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(`Lynx demo exited before serving ${url}.\n${output()}`);
		}
		try {
			const response = await fetch(url);
			if (response.ok) {
				await delay(50);
				if (child.exitCode !== null || child.signalCode !== null) {
					throw new Error(`Lynx demo exited while serving ${url}.\n${output()}`);
				}
				return Buffer.from(await response.arrayBuffer());
			}
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Lynx demo exited')) throw error;
		}
		await delay(100);
	}
	throw new Error(`Lynx demo did not serve ${url} within ${timeoutMs}ms.\n${output()}`);
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
	return new Promise((resolveExit) => {
		const timer = setTimeout(() => {
			child.off('exit', onExit);
			resolveExit(false);
		}, timeoutMs);
		const onExit = () => {
			clearTimeout(timer);
			resolveExit(true);
		};
		child.once('exit', onExit);
	});
}

async function stopProcessTree(child: ChildProcess): Promise<void> {
	if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
	if (process.platform === 'win32') {
		try {
			execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
		} catch {
			child.kill();
		}
		await waitForExit(child, 3_000);
		return;
	}
	const signalGroup = (signal: NodeJS.Signals) => {
		try {
			process.kill(-child.pid!, signal);
		} catch {
			child.kill(signal);
		}
	};
	signalGroup('SIGTERM');
	if (await waitForExit(child, 3_000)) return;
	signalGroup('SIGKILL');
	await waitForExit(child, 3_000);
}

async function waitForServerStop(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		try {
			await fetch(url, { signal: AbortSignal.timeout(500) });
		} catch {
			return;
		}
		await delay(100);
	}
	throw new Error(`Lynx demo continued serving ${url} after shutdown.`);
}

function nativeScriptText(script: unknown): string {
	if (typeof script === 'string') return script;
	if (Array.isArray(script)) {
		if (script.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			return Buffer.from(script).toString('latin1');
		}
		return script.map(nativeScriptText).join('\n');
	}
	if (script !== null && typeof script === 'object') {
		return Object.values(script).map(nativeScriptText).join('\n');
	}
	return '';
}

async function decodeNativeBundle(content: Buffer): Promise<Record<string, unknown>> {
	return supportNapi()
		? decodeNativeBundleWithNapi(content)
		: await decodeNativeBundleWithWasm(content);
}

it('starts the advertised development command, serves its bundle, and shuts down', async () => {
	const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-lynx-demo-dev-'));
	const port = await getFreePort();
	const url = `http://127.0.0.1:${port}/main.lynx.bundle`;
	let output = '';
	const child = spawn('pnpm', ['lynx:demo'], {
		cwd: WORKSPACE_ROOT,
		detached: process.platform !== 'win32',
		env: {
			...process.env,
			CI: '1',
			NO_COLOR: '1',
			OCTANE_LYNX_DEMO_DIST: temporaryRoot,
			OCTANE_LYNX_DEMO_PORT: String(port),
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');
	child.stdout?.on('data', (chunk: string) => {
		output += chunk;
	});
	child.stderr?.on('data', (chunk: string) => {
		output += chunk;
	});

	try {
		const bundle = await waitForBundle(child, url, () => output, 60_000);
		expect(bundle.byteLength).toBeGreaterThan(1_000);
		expect(output).toContain(`:${port}/main.lynx.bundle`);
	} finally {
		await stopProcessTree(child);
		await waitForServerStop(url, 5_000);
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
}, 90_000);

function withoutKnownDiagnosticText(content: string): string {
	// The native decoder includes receiver string tables. This describes a
	// first-screen render phase; it is not a reference to the browser global.
	return content.replaceAll('render window has closed', 'render phase has closed');
}

it('builds the one-command demo as a React-free Octane Lynx application', async () => {
	const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-lynx-demo-'));
	try {
		execFileSync('pnpm', ['lynx:demo:check'], {
			cwd: WORKSPACE_ROOT,
			encoding: 'utf8',
			env: {
				...process.env,
				CI: '1',
				OCTANE_LYNX_DEMO_DIST: temporaryRoot,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 120_000,
		});

		const bundle = readFileSync(join(temporaryRoot, 'main.lynx.bundle'));
		const decoded = await decodeNativeBundle(bundle);
		const mainThread = nativeScriptText(decoded['main-thread-script']);
		const background = nativeScriptText(decoded['background-thread-script']);
		const completeBundleText = nativeScriptText(decoded);

		expect(decoded['engine-version']).toBe('3.9');
		expect(mainThread).toMatch(/getJSContext/);
		expect(background).toMatch(/getCoreContext/);
		for (const program of [mainThread, background]) {
			expect(program).toContain('octane-lynx-demo');
			expect(program).toContain('Compiled components. Native canvas.');
			expect(program).toContain('octane-demo-increment');
		}
		expect(bundle.includes(Buffer.from('#ff6b35'))).toBe(true);
		expect(completeBundleText).not.toMatch(
			/(?:^|[^$\w])(?:react|react-dom|preact|ReactLynx)(?:[^$\w]|$)/i,
		);
		expect(completeBundleText).not.toMatch(/LYNX_BACKGROUND_VALIDATION|forbiddenImports/);
		expect(withoutKnownDiagnosticText(completeBundleText)).not.toMatch(
			/\b(?:document|window|HTMLElement|MutationObserver)\b/,
		);
	} finally {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
}, 120_000);
