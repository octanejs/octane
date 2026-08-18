import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	cleanupNativeDemo,
	createExplorerPlan,
	createNativeDemoPlan,
	ensureExplorer,
	isLynxBundle,
	LYNX_EXPLORER_ASSETS,
	parseDemoPort,
	preflightExplorerExecutable,
	readBundleHeader,
	runNativeDemo,
	selectExplorerAsset,
	sha256File,
	stopProcessTree,
	sweepExtractionLeases,
	validateExplorerArchiveEntries,
	verifyFileSha256,
	waitForBundle,
} from '../scripts/run-lynx-explorer-demo.mjs';

const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('macOS Lynx Explorer native demo', () => {
	it('selects the exact official Lynx 3.9.0 release artifact for each macOS architecture', () => {
		expect(selectExplorerAsset({ arch: 'arm64', platform: 'darwin' })).toEqual({
			arch: 'arm64',
			archiveName: 'LynxExplorer-macos-arm64.app.tar.gz',
			sha256: 'e540f6b30334e511d1fa2438864fda821fb8ed7ec2a543e57bd8d53f113ebd3e',
			size: 17_072_100,
			url: 'https://github.com/lynx-family/lynx/releases/download/3.9.0/LynxExplorer-macos-arm64.app.tar.gz',
		});
		expect(selectExplorerAsset({ arch: 'x64', platform: 'darwin' })).toBe(LYNX_EXPLORER_ASSETS.x64);
		expect(LYNX_EXPLORER_ASSETS.x64.sha256).toBe(
			'7ea655bc9a92427af6f4a202ee9686c4dd2e68f9df35f22c202c57af49162fab',
		);
		expect(() => selectExplorerAsset({ arch: 'arm64', platform: 'linux' })).toThrow(
			/requires macOS/,
		);
		expect(() => selectExplorerAsset({ arch: 'ia32', platform: 'darwin' })).toThrow(
			/supports macOS arm64 and x64/,
		);
	});

	it('constructs the existing demo command and direct Explorer URL launch', () => {
		const plan = createNativeDemoPlan({
			arch: 'arm64',
			cwd: '/workspace',
			env: {
				OCTANE_LYNX_EXPLORER_CACHE_DIR: '/cache/octane',
			},
			homeDirectory: '/Users/octane',
			platform: 'darwin',
			port: 43_219,
			workspaceRoot: '/workspace/octane',
		});

		expect(plan.archivePath).toBe('/cache/octane/LynxExplorer-macos-arm64.app.tar.gz');
		expect(plan.executablePath).toBe(
			'/cache/octane/arm64/LynxExplorer.app/Contents/MacOS/LynxExplorer',
		);
		expect(plan.bundleUrl).toBe('http://127.0.0.1:43219/main.lynx.bundle');
		expect(plan.demoCommand).toMatchObject({
			args: ['lynx:demo'],
			command: 'pnpm',
			cwd: '/workspace/octane',
			env: {
				OCTANE_LYNX_DEMO_PORT: '43219',
			},
		});
		expect(plan.explorerCommand).toMatchObject({
			args: ['--url=http://127.0.0.1:43219/main.lynx.bundle'],
			command: '/cache/octane/arm64/LynxExplorer.app/Contents/MacOS/LynxExplorer',
		});
		expect(
			readFileSync(new URL('../examples/demo/lynx.config.mjs', import.meta.url), 'utf8'),
		).toContain('strictPort: true');
	});

	it('uses an explicit Explorer executable without changing the served bundle contract', () => {
		const plan = createNativeDemoPlan({
			arch: 'x64',
			env: {
				OCTANE_LYNX_EXPLORER_EXECUTABLE: '/Applications/LynxExplorer',
			},
			platform: 'darwin',
			port: 3_000,
		});

		expect(plan.executableOverride).toBe(true);
		expect(plan.explorerCommand).toMatchObject({
			args: ['--url=http://127.0.0.1:3000/main.lynx.bundle'],
			command: '/Applications/LynxExplorer',
		});
	});

	it('rejects invalid port overrides before starting either process', () => {
		expect(parseDemoPort(undefined)).toBeUndefined();
		expect(parseDemoPort('49152')).toBe(49_152);
		for (const value of ['', '0', '1.5', '65536', 'demo']) {
			expect(() => parseDemoPort(value)).toThrow(/integer from 1 to 65535/);
		}
	});

	it('rejects an archive whose bytes do not match the pinned digest', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-lynx-native-checksum-'));
		temporaryRoots.push(root);
		const archive = join(root, 'LynxExplorer.app.tar.gz');
		writeFileSync(archive, 'tampered');

		await expect(verifyFileSha256(archive, '0'.repeat(64))).rejects.toThrow(
			/SHA-256 mismatch.*expected.*received/,
		);
	});

	it('prepares Explorer from a plan that describes no development server', () => {
		// Explorer preparation runs before a port is chosen, so its plan must not
		// carry a fabricated server address that a later step could act on.
		const plan = createExplorerPlan({
			arch: 'arm64',
			env: { OCTANE_LYNX_EXPLORER_CACHE_DIR: '/tmp/octane-lynx-cache' },
			platform: 'darwin',
		});

		expect(plan.archivePath).toBe('/tmp/octane-lynx-cache/LynxExplorer-macos-arm64.app.tar.gz');
		expect(plan.executablePath).toBe(
			'/tmp/octane-lynx-cache/arm64/LynxExplorer.app/Contents/MacOS/LynxExplorer',
		);
		expect(plan).not.toHaveProperty('bundleUrl');
		expect(plan).not.toHaveProperty('port');
		expect(plan).not.toHaveProperty('demoCommand');
		expect(plan).not.toHaveProperty('explorerCommand');
	});

	it('reclaims only extraction leases whose owner is gone and which are stale', async () => {
		const cacheRoot = mkdtempSync(join(tmpdir(), 'octane-lynx-native-sweep-'));
		temporaryRoots.push(cacheRoot);
		const abandoned = join(cacheRoot, '.extract-arm64-abandoned');
		const live = join(cacheRoot, '.extract-arm64-live');
		// A lease left by a launcher that predates owner records.
		const ownerless = join(cacheRoot, '.extract-arm64-ownerless');
		const application = join(cacheRoot, 'arm64');
		for (const root of [abandoned, live, ownerless, application]) {
			mkdirSync(root, { recursive: true });
		}
		writeFileSync(join(abandoned, '.owner'), '4321');
		writeFileSync(join(live, '.owner'), '1234');
		const isOwnerRunning = (pid: number): boolean => pid === 1234;

		// A departed owner alone must not reclaim a lease that a launcher could
		// still be creating.
		expect(await sweepExtractionLeases(cacheRoot, { isOwnerRunning })).toEqual([]);
		expect(existsSync(abandoned)).toBe(true);

		const removed = await sweepExtractionLeases(cacheRoot, {
			isOwnerRunning,
			now: Date.now() + 7 * 60 * 60 * 1_000,
		});

		expect(removed.sort()).toEqual([abandoned, ownerless].sort());
		expect(existsSync(abandoned)).toBe(false);
		expect(existsSync(ownerless)).toBe(false);
		expect(existsSync(live)).toBe(true);
		expect(existsSync(application)).toBe(true);
	});

	it('ignores a stale cached app and prepares an isolated checksum-backed executable', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-lynx-native-cache-'));
		temporaryRoots.push(root);
		const basePlan = createNativeDemoPlan({
			arch: 'arm64',
			env: { OCTANE_LYNX_EXPLORER_CACHE_DIR: root },
			platform: 'darwin',
			port: 43_219,
		});
		writeFileSync(basePlan.archivePath, 'verified archive');
		const plan = {
			...basePlan,
			asset: {
				...basePlan.asset,
				sha256: await sha256File(basePlan.archivePath),
			},
		};
		mkdirSync(join(plan.assetRoot, 'LynxExplorer.app', 'Contents', 'MacOS'), {
			recursive: true,
		});
		writeFileSync(plan.executablePath, 'stale executable');
		chmodSync(plan.executablePath, 0o755);
		let extracted = false;

		const prepared = await ensureExplorer(plan, {
			fetchImpl: async () => {
				throw new Error('a verified cached archive must not be downloaded');
			},
			runCommandImpl: async (command, args) => {
				expect(command).toBe('tar');
				if (args[0] === '-tzf') {
					return {
						stderr: '',
						stdout: 'LynxExplorer.app/\nLynxExplorer.app/Contents/MacOS/LynxExplorer\n',
					};
				}
				const destination = args[args.indexOf('-C') + 1]!;
				const executable = join(
					destination,
					'LynxExplorer.app',
					'Contents',
					'MacOS',
					'LynxExplorer',
				);
				mkdirSync(join(destination, 'LynxExplorer.app', 'Contents', 'MacOS'), {
					recursive: true,
				});
				writeFileSync(executable, 'verified executable');
				chmodSync(executable, 0o755);
				extracted = true;
				return { stderr: '', stdout: '' };
			},
		});

		expect(extracted).toBe(true);
		expect(prepared.executablePath).not.toBe(plan.executablePath);
		expect(readFileSync(prepared.executablePath, 'utf8')).toBe('verified executable');
		expect(readFileSync(plan.executablePath, 'utf8')).toBe('stale executable');
		// The lease records its owner so a killed launcher's leftovers stay
		// attributable to a process a later sweep can find gone.
		const lease = readdirSync(root).find((entry) => entry.startsWith('.extract-'))!;
		expect(readFileSync(join(root, lease, '.owner'), 'utf8')).toBe(String(process.pid));
		await prepared.dispose();
		expect(existsSync(prepared.executablePath)).toBe(false);
	});

	it('prepares concurrent launchers in independent extraction roots', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-lynx-native-concurrent-'));
		temporaryRoots.push(root);
		const basePlan = createNativeDemoPlan({
			arch: 'arm64',
			env: { OCTANE_LYNX_EXPLORER_CACHE_DIR: root },
			platform: 'darwin',
			port: 43_219,
		});
		writeFileSync(basePlan.archivePath, 'corrupt archive');
		const expectedArchive = join(root, 'expected.tar.gz');
		writeFileSync(expectedArchive, 'verified archive');
		const plan = {
			...basePlan,
			asset: {
				...basePlan.asset,
				sha256: await sha256File(expectedArchive),
			},
		};
		const runCommandImpl = async (_command: string, args: readonly string[]) => {
			if (args[0] === '-tzf') {
				return {
					stderr: '',
					stdout: 'LynxExplorer.app/\nLynxExplorer.app/Contents/MacOS/LynxExplorer\n',
				};
			}
			const destination = args[args.indexOf('-C') + 1]!;
			const executable = join(destination, 'LynxExplorer.app', 'Contents', 'MacOS', 'LynxExplorer');
			mkdirSync(join(destination, 'LynxExplorer.app', 'Contents', 'MacOS'), {
				recursive: true,
			});
			writeFileSync(executable, 'verified executable');
			chmodSync(executable, 0o755);
			return { stderr: '', stdout: '' };
		};

		const [first, second] = await Promise.all([
			ensureExplorer(plan, {
				fetchImpl: async () => new Response('verified archive'),
				runCommandImpl,
			}),
			ensureExplorer(plan, {
				fetchImpl: async () => new Response('verified archive'),
				runCommandImpl,
			}),
		]);

		expect(first.executablePath).not.toBe(second.executablePath);
		expect(readFileSync(plan.archivePath, 'utf8')).toBe('verified archive');
		expect(readFileSync(first.executablePath, 'utf8')).toBe('verified executable');
		expect(readFileSync(second.executablePath, 'utf8')).toBe('verified executable');
		await Promise.all([first.dispose(), second.dispose()]);
		expect(existsSync(first.executablePath)).toBe(false);
		expect(existsSync(second.executablePath)).toBe(false);
	});

	it('keeps a corrupt shared archive intact when replacement download fails', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-lynx-native-repair-failure-'));
		temporaryRoots.push(root);
		const basePlan = createNativeDemoPlan({
			arch: 'arm64',
			env: { OCTANE_LYNX_EXPLORER_CACHE_DIR: root },
			platform: 'darwin',
			port: 43_219,
		});
		writeFileSync(basePlan.archivePath, 'corrupt archive');
		const expectedArchive = join(root, 'expected.tar.gz');
		writeFileSync(expectedArchive, 'verified archive');
		const plan = {
			...basePlan,
			asset: {
				...basePlan.asset,
				sha256: await sha256File(expectedArchive),
			},
		};

		await expect(
			ensureExplorer(plan, {
				fetchImpl: async () => {
					throw new Error('network unavailable');
				},
			}),
		).rejects.toThrow(/network unavailable/);

		expect(readFileSync(plan.archivePath, 'utf8')).toBe('corrupt archive');
		expect(readdirSync(root).some((name) => name.includes('.download-'))).toBe(false);
	});

	it('removes partial download and extraction roots after cancellation', async () => {
		const downloadRoot = mkdtempSync(join(tmpdir(), 'octane-lynx-native-abort-download-'));
		temporaryRoots.push(downloadRoot);
		const downloadPlan = createNativeDemoPlan({
			arch: 'arm64',
			env: { OCTANE_LYNX_EXPLORER_CACHE_DIR: downloadRoot },
			platform: 'darwin',
			port: 43_219,
		});
		const downloadAbort = new AbortController();
		let startDownload!: () => void;
		const downloadStarted = new Promise<void>((resolve) => {
			startDownload = resolve;
		});
		const download = ensureExplorer(downloadPlan, {
			fetchImpl: async () =>
				new Response(
					new ReadableStream({
						start() {
							startDownload();
						},
					}),
				),
			signal: downloadAbort.signal,
		});
		await downloadStarted;
		downloadAbort.abort();
		await expect(download).rejects.toMatchObject({ name: 'AbortError' });
		expect(readdirSync(downloadRoot).some((name) => name.includes('.download-'))).toBe(false);

		const extractRoot = mkdtempSync(join(tmpdir(), 'octane-lynx-native-abort-extract-'));
		temporaryRoots.push(extractRoot);
		const baseExtractPlan = createNativeDemoPlan({
			arch: 'arm64',
			env: { OCTANE_LYNX_EXPLORER_CACHE_DIR: extractRoot },
			platform: 'darwin',
			port: 43_219,
		});
		writeFileSync(baseExtractPlan.archivePath, 'verified archive');
		const extractPlan = {
			...baseExtractPlan,
			asset: {
				...baseExtractPlan.asset,
				sha256: await sha256File(baseExtractPlan.archivePath),
			},
		};
		const extractAbort = new AbortController();
		let startExtraction!: () => void;
		const extractionStarted = new Promise<void>((resolve) => {
			startExtraction = resolve;
		});
		const extraction = ensureExplorer(extractPlan, {
			runCommandImpl: async (_command, args, { signal }: { signal?: AbortSignal } = {}) => {
				if (args[0] === '-tzf') {
					return {
						stderr: '',
						stdout: 'LynxExplorer.app/\nLynxExplorer.app/Contents/MacOS/LynxExplorer\n',
					};
				}
				startExtraction();
				await new Promise((resolveExtraction, rejectExtraction) => {
					signal?.addEventListener(
						'abort',
						() => {
							setTimeout(() => rejectExtraction(new DOMException('cancelled', 'AbortError')), 10);
						},
						{ once: true },
					);
				});
				throw new Error('extraction should have been aborted');
			},
			signal: extractAbort.signal,
		});
		await extractionStarted;
		extractAbort.abort();
		await expect(extraction).rejects.toMatchObject({ name: 'AbortError' });
		expect(readdirSync(extractRoot).some((name) => name.startsWith('.extract-'))).toBe(false);
	});

	it('rejects unsafe archive entries before extraction', () => {
		expect(() =>
			validateExplorerArchiveEntries(
				'LynxExplorer.app/\nLynxExplorer.app/Contents/MacOS/LynxExplorer\n',
			),
		).not.toThrow();
		expect(() => validateExplorerArchiveEntries('LynxExplorer.app/\n../outside-cache\n')).toThrow(
			/unsafe path/,
		);
	});

	it('preflights the configured Explorer executable before starting the server', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-lynx-native-preflight-'));
		temporaryRoots.push(root);
		await expect(preflightExplorerExecutable(join(root, 'missing'))).rejects.toThrow(
			/was not found/,
		);
		const directory = join(root, 'LynxExplorer');
		mkdirSync(directory);
		await expect(preflightExplorerExecutable(directory)).rejects.toThrow(/not a regular file/);
		const executable = join(root, 'executable');
		writeFileSync(executable, '#!/bin/sh\n');
		chmodSync(executable, 0o755);
		await expect(preflightExplorerExecutable(executable)).resolves.toBe(executable);
	});

	it('gracefully stops a managed process tree during cleanup', async () => {
		const child = Object.assign(new EventEmitter(), {
			exitCode: null as number | null,
			kill() {
				throw new Error('the process group signal should be used');
			},
			pid: 42,
			signalCode: null as NodeJS.Signals | null,
		});
		const signals: NodeJS.Signals[] = [];

		await stopProcessTree(child, {
			signalProcess(target, signal) {
				signals.push(signal);
				target.exitCode = 0;
				target.emit('exit', 0, null);
			},
			stopTimeoutMs: 10,
		});

		expect(signals).toEqual(['SIGTERM']);
		expect(child.exitCode).toBe(0);
	});

	it('signals a detached process group after its leader has already exited', async () => {
		const child = Object.assign(new EventEmitter(), {
			exitCode: 0,
			kill() {
				throw new Error('an exited leader must not receive the fallback signal');
			},
			pid: 42,
			signalCode: null as NodeJS.Signals | null,
		});
		const signals: NodeJS.Signals[] = [];
		let waited = false;

		await stopProcessTree(child, {
			signalProcess(_target, signal) {
				signals.push(signal);
			},
			waitForExit: async () => {
				waited = true;
				return true;
			},
		});

		expect(signals).toEqual(['SIGTERM']);
		expect(waited).toBe(true);
	});

	it('surfaces a development-server process group that cleanup cannot stop', async () => {
		const demo = { pid: 41 } as ChildProcess;
		const explorer = { pid: 42 } as ChildProcess;
		let disposed = false;

		await expect(
			cleanupNativeDemo(
				{
					demo,
					explorer,
					preparedExplorer: {
						async dispose() {
							disposed = true;
						},
						executablePath: '/tmp/LynxExplorer',
					},
				},
				async (child) => child !== demo,
			),
		).rejects.toThrow(/Could not stop the pnpm lynx:demo process group/);

		expect(disposed).toBe(true);
	});

	it('escalates cleanup for a detached descendant after its leader exits', async () => {
		if (process.platform === 'win32') return;
		const descendantSource = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000);";
		const leaderSource = `
			const { spawn } = require('node:child_process');
			const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}], {
				stdio: 'ignore',
			});
			descendant.unref();
			process.stdout.write(String(descendant.pid));
		`;
		const leader = spawn(process.execPath, ['-e', leaderSource], {
			detached: true,
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		let descendantText = '';
		leader.stdout!.setEncoding('utf8');
		leader.stdout!.on('data', (chunk: string) => {
			descendantText += chunk;
		});
		await once(leader, 'close');
		const descendantPid = Number(descendantText);
		expect(Number.isSafeInteger(descendantPid)).toBe(true);
		expect(() => process.kill(descendantPid, 0)).not.toThrow();

		try {
			await expect(stopProcessTree(leader, { stopTimeoutMs: 100 })).resolves.toBe(true);
			expect(() => process.kill(descendantPid, 0)).toThrow();
		} finally {
			try {
				process.kill(-leader.pid!, 'SIGKILL');
			} catch {
				// The expected path already removed the complete process group.
			}
		}
	});

	it('recognizes only the Lynx binary header as a ready bundle', () => {
		expect(isLynxBundle(new Uint8Array([0x8b, 0x81, 0x0e, 0x00, 0x01]))).toBe(true);
		expect(isLynxBundle(new TextEncoder().encode('<html>occupied port</html>'))).toBe(false);
		expect(isLynxBundle(new Uint8Array([0x8b, 0x81, 0x0e]))).toBe(false);
	});

	it('classifies a served bundle from its header without draining the response', async () => {
		// The served bundle grows with the application, so a readiness poll that
		// downloads it once per attempt scales with the demo instead of the header.
		const totalChunks = 64;
		let pulled = 0;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (pulled === totalChunks) {
					controller.close();
					return;
				}
				const chunk = new Uint8Array(4_096);
				if (pulled === 0) chunk.set([0x8b, 0x81, 0x0e, 0x00]);
				pulled += 1;
				controller.enqueue(chunk);
			},
			cancel() {
				cancelled = true;
			},
		});

		const header = await readBundleHeader(new Response(body));

		expect(isLynxBundle(header)).toBe(true);
		expect(pulled).toBeLessThan(totalChunks);
		expect(cancelled).toBe(true);
	});

	it('releases the body of every response the readiness poll rejects', async () => {
		// An unread body keeps its connection checked out of the agent pool for
		// the rest of the wait, which can stall the poll it belongs to.
		let cancelled = false;
		const pending = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array(4_096));
			},
			cancel() {
				cancelled = true;
			},
		});
		const child = Object.assign(new EventEmitter(), {
			exitCode: null as number | null,
			pid: 42,
			signalCode: null as NodeJS.Signals | null,
		});
		let compiling = true;

		await waitForBundle(child, 'http://127.0.0.1:43219/main.lynx.bundle', 5_000, async () => {
			if (!compiling) return new Response(new Uint8Array([0x8b, 0x81, 0x0e, 0x00]));
			compiling = false;
			return new Response(pending, { status: 404 });
		});

		expect(cancelled).toBe(true);
	});

	it('rejects a valid response if the demo exits while its body is read', async () => {
		const child = Object.assign(new EventEmitter(), {
			exitCode: null as number | null,
			pid: 42,
			signalCode: null as NodeJS.Signals | null,
		});

		await expect(
			waitForBundle(child, 'http://127.0.0.1:43219/main.lynx.bundle', 100, async () => {
				child.exitCode = 1;
				return new Response(new Uint8Array([0x8b, 0x81, 0x0e, 0x00, 0x01]));
			}),
		).rejects.toThrow(/exited while serving/);
	});

	it('orchestrates the demo, Explorer URL, and server cleanup through injected processes', async () => {
		const children: ChildProcess[] = [];
		const stopped: Array<{ child: ChildProcess; signal?: NodeJS.Signals }> = [];
		const order: string[] = [];
		let disposedSignals = false;
		let disposedExplorer = false;
		const createChild = (pid: number): ChildProcess =>
			Object.assign(new EventEmitter(), {
				exitCode: null,
				kill: () => true,
				pid,
				signalCode: null,
				stderr: null,
				stdin: null,
				stdout: null,
			}) as unknown as ChildProcess;

		const exitCode = await runNativeDemo({
			arch: 'arm64',
			assertPortAvailableImpl: async (port) => {
				order.push('port');
				expect(port).toBe(43_219);
			},
			ensureExplorerImpl: async () => {
				order.push('prepare');
				return {
					async dispose() {
						disposedExplorer = true;
						order.push('dispose');
					},
					executablePath: '/tmp/LynxExplorer',
				};
			},
			env: {
				OCTANE_LYNX_DEMO_PORT: '43219',
				OCTANE_LYNX_EXPLORER_EXECUTABLE: '/tmp/LynxExplorer',
			},
			fetchImpl: async () =>
				new Response(new Uint8Array([0x8b, 0x81, 0x0e, 0x00, 0x01]), {
					status: 200,
				}),
			installSignalHandlersImpl: () => ({
				dispose() {
					disposedSignals = true;
				},
				get receivedSignal() {
					return undefined;
				},
				promise: new Promise<NodeJS.Signals>(() => {}),
			}),
			platform: 'darwin',
			spawnImpl: ((command: string, args: readonly string[]) => {
				const child = createChild(50_000 + children.length);
				children.push(child);
				if (children.length === 1) {
					order.push('demo');
					expect(command).toBe('pnpm');
					expect(args).toEqual(['lynx:demo']);
				} else {
					order.push('explorer');
					expect(command).toBe('/tmp/LynxExplorer');
					expect(args).toEqual(['--url=http://127.0.0.1:43219/main.lynx.bundle']);
					queueMicrotask(() => {
						(child as unknown as { exitCode: number | null }).exitCode = 0;
						child.emit('exit', 0, null);
					});
				}
				return child;
			}) as never,
			stopProcessTreeImpl: async (child, options = {}) => {
				if (child === undefined) return true;
				order.push(child === children[1] ? 'stop-explorer' : 'stop-demo');
				if (child.exitCode !== null || child.signalCode !== null) return true;
				stopped.push({
					child,
					signal: options.signal as NodeJS.Signals | undefined,
				});
				child.exitCode = 0;
				child.emit('exit', 0, null);
				return true;
			},
			workspaceRoot: '/workspace/octane',
		});

		expect(exitCode).toBe(0);
		expect(children).toHaveLength(2);
		expect(stopped).toEqual([{ child: children[0]!, signal: undefined }]);
		expect(disposedSignals).toBe(true);
		expect(disposedExplorer).toBe(true);
		expect(order).toEqual([
			'prepare',
			'port',
			'demo',
			'explorer',
			'stop-explorer',
			'stop-demo',
			'dispose',
		]);
	});

	it('observes a late readiness rejection when startup cancellation wins', async () => {
		const demo = Object.assign(new EventEmitter(), {
			exitCode: null,
			kill: () => true,
			pid: 60_000,
			signalCode: null,
			stderr: null,
			stdin: null,
			stdout: null,
		}) as unknown as ChildProcess;
		let receivedSignal: NodeJS.Signals | undefined;
		let resolveSignal!: (signal: NodeJS.Signals) => void;
		const signalPromise = new Promise<NodeJS.Signals>((resolve) => {
			resolveSignal = resolve;
		});
		let rejectReadiness!: (error: Error) => void;
		const readiness = new Promise<void>((_resolve, reject) => {
			rejectReadiness = reject;
		});
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			unhandled.push(reason);
		};
		process.on('unhandledRejection', onUnhandled);

		try {
			const exitCode = await runNativeDemo({
				arch: 'arm64',
				assertPortAvailableImpl: async () => {},
				ensureExplorerImpl: async () => ({
					async dispose() {},
					executablePath: '/tmp/LynxExplorer',
				}),
				env: {
					OCTANE_LYNX_DEMO_PORT: '43219',
					OCTANE_LYNX_EXPLORER_EXECUTABLE: '/tmp/LynxExplorer',
				},
				installSignalHandlersImpl: () => ({
					dispose() {},
					get receivedSignal() {
						return receivedSignal;
					},
					promise: signalPromise,
				}),
				platform: 'darwin',
				spawnImpl: (() => demo) as never,
				stopProcessTreeImpl: async (child) => {
					if (child === demo) {
						rejectReadiness(new Error('demo stopped during readiness'));
						Object.defineProperty(demo, 'exitCode', {
							configurable: true,
							value: 0,
						});
						demo.emit('exit', 0, null);
					}
					return true;
				},
				waitForBundleImpl: async () => {
					queueMicrotask(() => {
						receivedSignal = 'SIGINT';
						resolveSignal(receivedSignal);
					});
					return readiness;
				},
			});

			expect(exitCode).toBe(130);
			await new Promise<void>((resolveTurn) => {
				setImmediate(resolveTurn);
			});
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('aborts Explorer preparation before selecting a port or spawning a process', async () => {
		let receivedSignal: NodeJS.Signals | undefined;
		let resolveSignal!: (signal: NodeJS.Signals) => void;
		const signalPromise = new Promise<NodeJS.Signals>((resolve) => {
			resolveSignal = resolve;
		});
		let selectedPort = false;
		let spawnCount = 0;

		const exitCode = await runNativeDemo({
			arch: 'arm64',
			ensureExplorerImpl: async (_plan, { signal } = {}) => {
				if (signal === undefined) throw new Error('preparation signal was not provided');
				expect(signal.aborted).toBe(false);
				queueMicrotask(() => {
					receivedSignal = 'SIGINT';
					resolveSignal(receivedSignal);
				});
				await new Promise((resolvePreparation, rejectPreparation) => {
					signal.addEventListener(
						'abort',
						() => {
							rejectPreparation(new DOMException('cancelled', 'AbortError'));
						},
						{ once: true },
					);
				});
				throw new Error('preparation should have been aborted');
			},
			env: {},
			findFreePortImpl: async () => {
				selectedPort = true;
				return 43_219;
			},
			installSignalHandlersImpl: () => ({
				dispose() {},
				get receivedSignal() {
					return receivedSignal;
				},
				promise: signalPromise,
			}),
			platform: 'darwin',
			spawnImpl: (() => {
				spawnCount++;
				throw new Error('no process should be spawned');
			}) as never,
		});

		expect(exitCode).toBe(130);
		expect(selectedPort).toBe(false);
		expect(spawnCount).toBe(0);
	});
});
