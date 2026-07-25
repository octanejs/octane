#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, createReadStream, createWriteStream } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const LYNX_EXPLORER_VERSION = '3.9.0';

const RELEASE_ROOT = `https://github.com/lynx-family/lynx/releases/download/${LYNX_EXPLORER_VERSION}`;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = resolve(SCRIPT_DIRECTORY, '../../..');
const EXPLORER_EXECUTABLE_RELATIVE_PATH = join(
	'LynxExplorer.app',
	'Contents',
	'MacOS',
	'LynxExplorer',
);
const DEFAULT_READY_TIMEOUT_MS = 90_000;
const DEFAULT_STOP_TIMEOUT_MS = 3_000;
const LYNX_BUNDLE_MAGIC = Object.freeze([0x8b, 0x81, 0x0e, 0x00]);

export const LYNX_EXPLORER_ASSETS = Object.freeze({
	arm64: Object.freeze({
		arch: 'arm64',
		archiveName: 'LynxExplorer-macos-arm64.app.tar.gz',
		sha256: 'e540f6b30334e511d1fa2438864fda821fb8ed7ec2a543e57bd8d53f113ebd3e',
		size: 17_072_100,
		url: `${RELEASE_ROOT}/LynxExplorer-macos-arm64.app.tar.gz`,
	}),
	x64: Object.freeze({
		arch: 'x64',
		archiveName: 'LynxExplorer-macos-x64.app.tar.gz',
		sha256: '7ea655bc9a92427af6f4a202ee9686c4dd2e68f9df35f22c202c57af49162fab',
		size: 16_981_840,
		url: `${RELEASE_ROOT}/LynxExplorer-macos-x64.app.tar.gz`,
	}),
});

export function selectExplorerAsset({ platform = process.platform, arch = process.arch } = {}) {
	if (platform !== 'darwin') {
		throw new Error(
			`The Octane Lynx native demo launcher requires macOS; received ${platform}. Use pnpm lynx:demo for a device or simulator on other hosts.`,
		);
	}
	const asset = LYNX_EXPLORER_ASSETS[arch];
	if (asset === undefined) {
		throw new Error(
			`The Octane Lynx native demo launcher supports macOS arm64 and x64; received ${arch}.`,
		);
	}
	return asset;
}

export function parseDemoPort(value) {
	if (value === undefined) return undefined;
	if (!/^\d+$/.test(value)) {
		throw new Error(`OCTANE_LYNX_DEMO_PORT must be an integer from 1 to 65535; received ${value}.`);
	}
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`OCTANE_LYNX_DEMO_PORT must be an integer from 1 to 65535; received ${value}.`);
	}
	return port;
}

function resolveConfiguredPath(value, fallback, cwd) {
	if (value === undefined || value.trim() === '') return fallback;
	return isAbsolute(value) ? value : resolve(cwd, value);
}

/**
 * Produce the complete filesystem, server, and process plan without doing I/O.
 */
export function createNativeDemoPlan({
	platform = process.platform,
	arch = process.arch,
	env = process.env,
	homeDirectory = homedir(),
	workspaceRoot = DEFAULT_WORKSPACE_ROOT,
	cwd = process.cwd(),
	port = Number.NaN,
} = {}) {
	const asset = selectExplorerAsset({ platform, arch });
	if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`The Lynx demo port must be an integer from 1 to 65535; received ${port}.`);
	}
	const cacheRoot = resolveConfiguredPath(
		env.OCTANE_LYNX_EXPLORER_CACHE_DIR,
		join(homeDirectory, 'Library', 'Caches', 'octane', 'lynx-explorer', LYNX_EXPLORER_VERSION),
		cwd,
	);
	const configuredExecutable = env.OCTANE_LYNX_EXPLORER_EXECUTABLE;
	const executableOverride =
		configuredExecutable === undefined || configuredExecutable.trim() === ''
			? undefined
			: resolveConfiguredPath(configuredExecutable, '', cwd);
	const assetRoot = join(cacheRoot, asset.arch);
	const executablePath = executableOverride ?? join(assetRoot, EXPLORER_EXECUTABLE_RELATIVE_PATH);
	const bundleUrl = `http://127.0.0.1:${port}/main.lynx.bundle`;

	return {
		asset,
		assetRoot,
		archivePath: join(cacheRoot, asset.archiveName),
		bundleUrl,
		cacheRoot,
		executableOverride: executableOverride !== undefined,
		executablePath,
		demoCommand: {
			args: ['lynx:demo'],
			command: 'pnpm',
			cwd: workspaceRoot,
			env: { ...env, OCTANE_LYNX_DEMO_PORT: String(port) },
		},
		explorerCommand: {
			args: [`--url=${bundleUrl}`],
			command: executablePath,
			cwd: dirname(executablePath),
			env,
		},
		port,
		workspaceRoot,
	};
}

export function validateExplorerArchiveEntries(entries) {
	const names = entries.split(/\r?\n/u).filter(Boolean);
	if (names.length === 0) throw new Error('The Lynx Explorer archive is empty.');
	for (const name of names) {
		const normalized = name.startsWith('./') ? name.slice(2) : name;
		if (
			(normalized === 'LynxExplorer.app' ||
				normalized === 'LynxExplorer.app/' ||
				normalized.startsWith('LynxExplorer.app/')) &&
			!normalized.split('/').includes('..')
		) {
			continue;
		}
		throw new Error(`The Lynx Explorer archive contains an unsafe path: ${name}`);
	}
}

export async function sha256File(filename) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(filename)) hash.update(chunk);
	return hash.digest('hex');
}

export async function verifyFileSha256(filename, expectedSha256) {
	const actualSha256 = await sha256File(filename);
	if (actualSha256 !== expectedSha256) {
		throw new Error(
			`SHA-256 mismatch for ${basename(filename)}: expected ${expectedSha256}, received ${actualSha256}.`,
		);
	}
	return actualSha256;
}

export async function preflightExplorerExecutable(filename) {
	let metadata;
	try {
		metadata = await lstat(filename);
	} catch (error) {
		throw new Error(`Lynx Explorer executable was not found at ${filename}.`, { cause: error });
	}
	if (!metadata.isFile()) {
		throw new Error(`Lynx Explorer executable is not a regular file: ${filename}`);
	}
	try {
		await access(filename, fsConstants.X_OK);
	} catch (error) {
		throw new Error(`Lynx Explorer executable is not executable: ${filename}`, { cause: error });
	}
	return filename;
}

export function findFreePort(host = '127.0.0.1') {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.unref();
		server.once('error', reject);
		server.listen({ exclusive: true, host, port: 0 }, () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				server.close();
				reject(new Error(`Could not select a free TCP port on ${host}.`));
				return;
			}
			server.close((error) => {
				if (error) reject(error);
				else resolvePort(address.port);
			});
		});
	});
}

export function assertPortAvailable(port, host = '127.0.0.1') {
	return new Promise((resolveAvailable, reject) => {
		const server = createServer();
		server.unref();
		server.once('error', (error) => {
			reject(new Error(`Port ${port} is unavailable on ${host}.`, { cause: error }));
		});
		server.listen({ exclusive: true, host, port }, () => {
			server.close((error) => {
				if (error) reject(error);
				else resolveAvailable();
			});
		});
	});
}

function processGroupIsRunning(pid) {
	try {
		process.kill(-pid, 0);
		return true;
	} catch (error) {
		return error?.code === 'EPERM';
	}
}

async function waitForProcessTreeExit(
	child,
	timeoutMs,
	isProcessGroupRunning = processGroupIsRunning,
) {
	if (child.pid === undefined) return true;
	const deadline = Date.now() + timeoutMs;
	while (isProcessGroupRunning(child.pid)) {
		if (Date.now() >= deadline) return false;
		await new Promise((resolveWait) => {
			setTimeout(resolveWait, 25);
		});
	}
	return true;
}

function signalProcessTree(child, signal) {
	if (child.pid === undefined) return;
	try {
		process.kill(-child.pid, signal);
	} catch {
		if (child.exitCode === null && child.signalCode === null) {
			try {
				child.kill(signal);
			} catch {
				// The leader may have exited between the status check and fallback.
			}
		}
	}
}

export async function stopProcessTree(
	child,
	{
		signal = 'SIGTERM',
		signalProcess = signalProcessTree,
		stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
		waitForExit = waitForProcessTreeExit,
	} = {},
) {
	if (child === undefined || child.pid === undefined) return true;
	signalProcess(child, signal);
	if (await waitForExit(child, stopTimeoutMs)) return true;
	signalProcess(child, 'SIGKILL');
	return waitForExit(child, stopTimeoutMs);
}

export async function cleanupNativeDemo(
	{ demo, explorer, preparedExplorer },
	stopProcessTreeImpl = stopProcessTree,
) {
	const [explorerStopped, demoStopped] = await Promise.all([
		stopProcessTreeImpl(explorer),
		stopProcessTreeImpl(demo),
	]);
	// Keep the temporary application leased until the Explorer process group is
	// confirmed gone. A false result deliberately leaves the files behind rather
	// than deleting an executable a descendant may still be using.
	if (explorerStopped !== false) await preparedExplorer?.dispose();
	const failures = [];
	if (explorerStopped === false) failures.push('Lynx Explorer');
	if (demoStopped === false) failures.push('pnpm lynx:demo');
	if (failures.length > 0) {
		throw new Error(`Could not stop the ${failures.join(' and ')} process group.`);
	}
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ signal?: AbortSignal }} [options]
 */
function runCommand(command, args, { signal } = {}) {
	return new Promise((resolveCommand, reject) => {
		const child = spawn(command, args, {
			...(signal === undefined ? {} : { signal }),
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		let spawnError;
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.once('error', (error) => {
			spawnError = error;
		});
		// Wait for close, not error/exit: an AbortSignal may report AbortError
		// before the subprocess and its stdio have actually stopped. Extraction
		// cleanup must not remove a directory that tar can still be writing.
		child.once('close', (code, closeSignal) => {
			if (spawnError !== undefined) {
				reject(spawnError);
				return;
			}
			if (code === 0) {
				resolveCommand({ stderr, stdout });
				return;
			}
			reject(
				new Error(
					`${command} ${args.join(' ')} failed with ${
						closeSignal === null ? `exit code ${code}` : closeSignal
					}.\n${stderr || stdout}`,
				),
			);
		});
	});
}

async function downloadArchive(asset, archivePath, fetchImpl, signal) {
	await mkdir(dirname(archivePath), { mode: 0o700, recursive: true });
	const temporaryPath = `${archivePath}.download-${process.pid}-${randomUUID()}`;
	try {
		const response = await fetchImpl(asset.url, {
			redirect: 'follow',
			...(signal === undefined ? {} : { signal }),
		});
		if (!response.ok || response.body === null) {
			throw new Error(
				`Could not download Lynx Explorer ${LYNX_EXPLORER_VERSION} from ${asset.url}: HTTP ${response.status}.`,
			);
		}
		const source = Readable.fromWeb(response.body);
		const destination = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
		if (signal === undefined) await pipeline(source, destination);
		else await pipeline(source, destination, { signal });
		await verifyFileSha256(temporaryPath, asset.sha256);
		// Publish only verified bytes. Replacing an existing archive atomically,
		// instead of deleting it first, lets concurrent launchers keep reading a
		// previously verified file while another launcher repairs the cache.
		await rename(temporaryPath, archivePath);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

async function ensureVerifiedArchive(plan, fetchImpl, signal) {
	try {
		await verifyFileSha256(plan.archivePath, plan.asset.sha256);
		return;
	} catch {
		// A missing or corrupt shared archive stays in place until a verified
		// replacement is ready, avoiding a read/remove race between launchers.
	}
	await downloadArchive(plan.asset, plan.archivePath, fetchImpl, signal);
}

function pathIsInside(parent, candidate) {
	const pathFromParent = relative(parent, candidate);
	return (
		pathFromParent === '' ||
		(!pathFromParent.startsWith(`..${sep}`) &&
			pathFromParent !== '..' &&
			!isAbsolute(pathFromParent))
	);
}

async function extractExplorer(plan, runCommandImpl, signal) {
	const listing = await runCommandImpl('tar', ['-tzf', plan.archivePath], { signal });
	validateExplorerArchiveEntries(listing.stdout);
	await mkdir(plan.cacheRoot, { mode: 0o700, recursive: true });
	const stagingRoot = await mkdtemp(join(plan.cacheRoot, `.extract-${plan.asset.arch}-`));
	const stagedExecutable = join(stagingRoot, EXPLORER_EXECUTABLE_RELATIVE_PATH);
	let retained = false;
	try {
		await runCommandImpl('tar', ['-xzf', plan.archivePath, '-C', stagingRoot], { signal });
		await preflightExplorerExecutable(stagedExecutable);
		const [resolvedStagingRoot, resolvedExecutable] = await Promise.all([
			realpath(stagingRoot),
			realpath(stagedExecutable),
		]);
		if (!pathIsInside(resolvedStagingRoot, resolvedExecutable)) {
			throw new Error('The Lynx Explorer archive resolved its executable outside the cache.');
		}
		retained = true;
		let disposed = false;
		return {
			async dispose() {
				if (disposed) return;
				disposed = true;
				await rm(stagingRoot, { force: true, recursive: true });
			},
			executablePath: stagedExecutable,
		};
	} finally {
		if (!retained) await rm(stagingRoot, { force: true, recursive: true });
	}
}

/**
 * @param {ReturnType<typeof createNativeDemoPlan>} plan
 * @param {{
 *   fetchImpl?: typeof fetch;
 *   runCommandImpl?: typeof runCommand;
 *   signal?: AbortSignal;
 * }} [options]
 */
export async function ensureExplorer(
	plan,
	{ fetchImpl = fetch, runCommandImpl = runCommand, signal } = {},
) {
	if (plan.executableOverride) {
		return {
			async dispose() {},
			executablePath: await preflightExplorerExecutable(plan.executablePath),
		};
	}
	// Rebuild an isolated application from the verified archive on every launch.
	// The per-run extraction prevents a stale executable from bypassing provenance
	// and lets concurrent launchers coexist without mutating each other's app.
	await ensureVerifiedArchive(plan, fetchImpl, signal);
	return extractExplorer(plan, runCommandImpl, signal);
}

function delay(milliseconds) {
	return new Promise((resolveDelay) => {
		const timer = setTimeout(resolveDelay, milliseconds);
		timer.unref();
	});
}

export async function waitForBundle(child, url, timeoutMs, fetchImpl) {
	let spawnError;
	const onError = (error) => {
		spawnError = error;
	};
	child.once('error', onError);
	const deadline = Date.now() + timeoutMs;
	try {
		while (Date.now() <= deadline) {
			if (spawnError !== undefined) {
				throw new Error(`Could not start pnpm lynx:demo: ${spawnError.message}`, {
					cause: spawnError,
				});
			}
			if (child.exitCode !== null || child.signalCode !== null) {
				throw new Error(
					`pnpm lynx:demo exited before serving ${url} (${
						child.signalCode ?? `exit code ${child.exitCode}`
					}).`,
				);
			}
			let validBundle = false;
			try {
				const response = await fetchImpl(url, {
					signal: AbortSignal.timeout(1_000),
				});
				validBundle = response.ok && isLynxBundle(new Uint8Array(await response.arrayBuffer()));
			} catch {
				// Rspeedy may still be compiling or binding its server.
			}
			if (validBundle) {
				if (child.exitCode !== null || child.signalCode !== null) {
					throw new Error(
						`pnpm lynx:demo exited while serving ${url} (${
							child.signalCode ?? `exit code ${child.exitCode}`
						}).`,
					);
				}
				return;
			}
			await delay(100);
		}
	} finally {
		child.off('error', onError);
	}
	throw new Error(`pnpm lynx:demo did not serve ${url} within ${timeoutMs}ms.`);
}

export function isLynxBundle(content) {
	return (
		content.byteLength >= LYNX_BUNDLE_MAGIC.length &&
		LYNX_BUNDLE_MAGIC.every((byte, index) => content[index] === byte)
	);
}

function childOutcome(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
	}
	return new Promise((resolveOutcome, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolveOutcome({ code, signal }));
	});
}

function installSignalHandlers() {
	let resolveSignal;
	let receivedSignal;
	const promise = new Promise((resolveReceivedSignal) => {
		resolveSignal = resolveReceivedSignal;
	});
	const handlers = new Map();
	for (const signal of ['SIGINT', 'SIGTERM']) {
		const handler = () => {
			receivedSignal ??= signal;
			resolveSignal(receivedSignal);
		};
		handlers.set(signal, handler);
		process.on(signal, handler);
	}
	return {
		dispose() {
			for (const [signal, handler] of handlers) process.off(signal, handler);
		},
		get receivedSignal() {
			return receivedSignal;
		},
		promise,
	};
}

function waitForPendingSignal(signals, timeoutMs = 50) {
	if (signals.receivedSignal !== undefined) return Promise.resolve(signals.receivedSignal);
	return new Promise((resolveSignal) => {
		const timer = setTimeout(() => {
			resolveSignal(undefined);
		}, timeoutMs);
		signals.promise.then((signal) => {
			clearTimeout(timer);
			resolveSignal(signal);
		});
	});
}

function signalExitCode(signal) {
	return signal === 'SIGINT' ? 130 : 143;
}

export async function runNativeDemo({
	arch = process.arch,
	assertPortAvailableImpl = assertPortAvailable,
	ensureExplorerImpl = ensureExplorer,
	env = process.env,
	fetchImpl = fetch,
	findFreePortImpl = findFreePort,
	installSignalHandlersImpl = installSignalHandlers,
	platform = process.platform,
	spawnImpl = spawn,
	readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
	stopProcessTreeImpl = stopProcessTree,
	waitForBundleImpl = waitForBundle,
	workspaceRoot = DEFAULT_WORKSPACE_ROOT,
} = {}) {
	const requestedPort = parseDemoPort(env.OCTANE_LYNX_DEMO_PORT);
	let demo;
	let explorer;
	let preparedExplorer;
	const signals = installSignalHandlersImpl();
	const preparationAbort = new AbortController();
	void signals.promise.then(() => {
		preparationAbort.abort();
	});
	try {
		const preparationPlan = createNativeDemoPlan({
			arch,
			env,
			platform,
			port: requestedPort ?? 1,
			workspaceRoot,
		});
		try {
			preparedExplorer = await ensureExplorerImpl(preparationPlan, {
				fetchImpl,
				signal: preparationAbort.signal,
			});
		} catch (error) {
			if (signals.receivedSignal !== undefined) {
				return signalExitCode(signals.receivedSignal);
			}
			throw error;
		}
		if (signals.receivedSignal !== undefined) {
			return signalExitCode(signals.receivedSignal);
		}

		// Select the port immediately before server startup. The demo config also
		// uses strictPort, so a process claiming it after this check causes a hard
		// startup failure instead of silently moving Rspeedy to another server.
		const port = requestedPort ?? (await findFreePortImpl());
		if (requestedPort !== undefined) await assertPortAvailableImpl(port);
		if (signals.receivedSignal !== undefined) {
			return signalExitCode(signals.receivedSignal);
		}
		const basePlan = createNativeDemoPlan({
			arch,
			env,
			platform,
			port,
			workspaceRoot,
		});
		const plan = {
			...basePlan,
			executablePath: preparedExplorer.executablePath,
			explorerCommand: {
				...basePlan.explorerCommand,
				command: preparedExplorer.executablePath,
				cwd: dirname(preparedExplorer.executablePath),
			},
		};
		demo = spawnImpl(plan.demoCommand.command, plan.demoCommand.args, {
			cwd: plan.demoCommand.cwd,
			detached: true,
			env: plan.demoCommand.env,
			stdio: ['ignore', 'inherit', 'inherit'],
		});
		const bundleReady = waitForBundleImpl(demo, plan.bundleUrl, readyTimeoutMs, fetchImpl).then(
			() => ({
				kind: 'ready',
			}),
		);
		const readiness = await Promise.race([
			bundleReady,
			signals.promise.then((signal) => ({ kind: 'signal', signal })),
		]);
		if (readiness.kind === 'signal' || signals.receivedSignal !== undefined) {
			// Promise.race does not cancel the readiness operation. Observe its
			// eventual rejection before stopping the demo so cancellation cannot
			// leave a late process-exit rejection behind.
			void bundleReady.catch(() => {});
			const signal = readiness.kind === 'signal' ? readiness.signal : signals.receivedSignal;
			await stopProcessTreeImpl(demo, { signal });
			return signalExitCode(signal);
		}
		if (demo.exitCode !== null || demo.signalCode !== null) {
			throw new Error(
				`pnpm lynx:demo exited before Explorer launch (${
					demo.signalCode ?? `exit code ${demo.exitCode}`
				}).`,
			);
		}
		explorer = spawnImpl(plan.explorerCommand.command, plan.explorerCommand.args, {
			cwd: plan.explorerCommand.cwd,
			detached: true,
			env: plan.explorerCommand.env,
			stdio: ['ignore', 'inherit', 'inherit'],
		});
		console.log(`Octane Lynx demo opened in Lynx Explorer ${LYNX_EXPLORER_VERSION}.`);
		console.log(`Bundle: ${plan.bundleUrl}`);
		console.log('Close Explorer or press Ctrl-C to stop the demo server.');

		const outcome = await Promise.race([
			childOutcome(demo).then((result) => ({ kind: 'demo', result })),
			childOutcome(explorer).then((result) => ({ kind: 'explorer', result })),
			signals.promise.then((signal) => ({ kind: 'signal', signal })),
		]);
		const receivedSignal =
			outcome.kind === 'signal' ? outcome.signal : await waitForPendingSignal(signals);
		if (receivedSignal !== undefined) {
			await Promise.all([
				stopProcessTreeImpl(explorer, { signal: receivedSignal }),
				stopProcessTreeImpl(demo, { signal: receivedSignal }),
			]);
			return signalExitCode(receivedSignal);
		}
		if (outcome.kind === 'demo') {
			throw new Error(
				`pnpm lynx:demo stopped while Explorer was open (${
					outcome.result.signal ?? `exit code ${outcome.result.code}`
				}).`,
			);
		}
		if (outcome.result.code !== 0) {
			throw new Error(
				`Lynx Explorer stopped unexpectedly (${
					outcome.result.signal ?? `exit code ${outcome.result.code}`
				}).`,
			);
		}
		return 0;
	} finally {
		signals.dispose();
		await cleanupNativeDemo({ demo, explorer, preparedExplorer }, stopProcessTreeImpl);
	}
}

const invokedFilename = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedFilename === fileURLToPath(import.meta.url)) {
	runNativeDemo()
		.then((exitCode) => {
			process.exitCode = exitCode;
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : error);
			process.exitCode = 1;
		});
}
