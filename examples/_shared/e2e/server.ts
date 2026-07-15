import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

export type Environment = Readonly<Record<string, string | undefined>>;

export interface ExampleServerAddressOptions {
	/** Full URL override, useful when CI starts the app itself. */
	baseURLEnv?: string;
	/** Port override used when no full URL override is present. */
	portEnv?: string;
	/** A stable local fallback. Omit it to ask the OS for an available port. */
	defaultPort?: number;
	host?: string;
	protocol?: 'http' | 'https';
	env?: Environment;
	/**
	 * Persist an OS-allocated port into `process.env[portEnv]`. Playwright may
	 * evaluate its config again in worker processes; they inherit this value and
	 * therefore connect to the server started from the first evaluation.
	 */
	persistAllocatedPort?: boolean;
}

export interface ExampleServerAddress {
	baseURL: string;
	host: string;
	port: number;
	/** True when `baseURL` came from the environment rather than local allocation. */
	external: boolean;
}

export type ServerTerminationSignal = 'SIGTERM' | 'SIGKILL';

/** The process surface required by the server lifecycle helpers. */
export interface ServerProcess {
	pid?: number;
	exitCode: number | null;
	signalCode: string | null;
	once(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
	off(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
	kill(signal?: ServerTerminationSignal): boolean;
}

export interface SpawnedServer {
	process: ServerProcess;
	/** Whether the child owns a process group that should be signalled together. */
	detached: boolean;
}

export interface SpawnServerOptions {
	cwd: string;
	env?: Environment;
	stdio?: 'ignore' | 'inherit';
}

export interface WaitForServerOptions {
	timeoutMs?: number;
	intervalMs?: number;
}

function parsePort(value: string | number, label: string): number {
	const port = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(
			`${label} must be an integer from 1 to 65535 (received ${JSON.stringify(value)})`,
		);
	}
	return port;
}

function readEnvironment(env: Environment, name: string | undefined): string | undefined {
	if (name === undefined) return undefined;
	const value = env[name]?.trim();
	return value === '' ? undefined : value;
}

function normalizeBaseURL(value: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be an absolute http(s) URL (received ${JSON.stringify(value)})`);
	}
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
		throw new Error(`${label} must be an absolute http(s) URL without credentials`);
	}
	if (url.search || url.hash) {
		throw new Error(`${label} must not contain a query string or fragment`);
	}
	url.pathname = url.pathname.replace(/\/+$/, '') || '/';
	return url;
}

function urlForHost(protocol: 'http' | 'https', host: string, port: number): string {
	const bracketedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
	return `${protocol}://${bracketedHost}:${port}`;
}

/** Ask the OS for an available loopback port instead of sharing fixed CI ports. */
export function getAvailablePort(host = '127.0.0.1'): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, host, () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				server.close();
				reject(new Error(`could not allocate a TCP port on ${host}`));
				return;
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)));
		});
	});
}

/**
 * Resolve one address for both Playwright's `baseURL` and the app server.
 * Environment values win; otherwise callers may choose a stable fallback or
 * an OS-assigned port. The returned URL has no trailing slash.
 */
export async function resolveExampleServerAddress(
	options: ExampleServerAddressOptions = {},
): Promise<ExampleServerAddress> {
	const env = options.env ?? process.env;
	const baseURLEnv = options.baseURLEnv ?? 'OCTANE_EXAMPLE_BASE_URL';
	const portEnv = options.portEnv ?? 'OCTANE_EXAMPLE_PORT';
	const configuredURL = readEnvironment(env, baseURLEnv);

	if (configuredURL !== undefined) {
		const url = normalizeBaseURL(configuredURL, baseURLEnv);
		const defaultProtocolPort = url.protocol === 'https:' ? 443 : 80;
		const port = url.port === '' ? defaultProtocolPort : parsePort(url.port, baseURLEnv);
		const pathname = url.pathname === '/' ? '' : url.pathname;
		return {
			baseURL: `${url.origin}${pathname}`,
			host: url.hostname,
			port,
			external: true,
		};
	}

	const host = options.host ?? '127.0.0.1';
	const protocol = options.protocol ?? 'http';
	const configuredPort = readEnvironment(env, portEnv);
	let port: number;
	if (configuredPort !== undefined) {
		port = parsePort(configuredPort, portEnv);
	} else if (options.defaultPort !== undefined) {
		port = parsePort(options.defaultPort, 'defaultPort');
	} else {
		port = await getAvailablePort(host);
		if (options.persistAllocatedPort === true) {
			if (options.env !== undefined && options.env !== process.env) {
				throw new Error('persistAllocatedPort requires the process environment');
			}
			process.env[portEnv] = String(port);
		}
	}

	return { baseURL: urlForHost(protocol, host, port), host, port, external: false };
}

/**
 * Spawn a server in its own process group on POSIX so package-manager wrappers
 * cannot leave the real app server behind after a test run.
 */
export function spawnServerProcess(
	command: string,
	args: readonly string[],
	options: SpawnServerOptions,
): SpawnedServer {
	const detached = process.platform !== 'win32';
	const child = spawn(command, [...args], {
		cwd: options.cwd,
		detached,
		env: { ...process.env, ...options.env },
		stdio: options.stdio ?? 'inherit',
	});
	return { process: child, detached };
}

function isRunning(child: ServerProcess): boolean {
	return child.exitCode === null && child.signalCode === null;
}

function isServerProcessGroupRunning(server: SpawnedServer): boolean {
	const child = server.process;
	if (!server.detached || child.pid === undefined) return isRunning(child);
	try {
		// Signal 0 performs an existence/permission check without delivering a
		// signal. A detached leader may already have exited while one of its
		// descendants still owns the process group, so the child handle alone is
		// not a sufficient cleanup boundary.
		process.kill(-child.pid, 0);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return false;
		if (code === 'EPERM') return true;
		return isRunning(child);
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Wait for an HTTP response from this child, rejecting immediately if the
 * spawned process exits. A response is accepted only while the child is alive,
 * which avoids accidentally testing an unrelated process that owns the port.
 */
export async function waitForServer(
	server: SpawnedServer,
	url: string,
	options: WaitForServerOptions = {},
): Promise<void> {
	const timeoutMs = options.timeoutMs ?? 60_000;
	const intervalMs = options.intervalMs ?? 250;
	const deadline = Date.now() + timeoutMs;
	const child = server.process;
	let exited: { code: number | null; signal: string | null } | undefined;
	const onExit = (code: number | null, signal: string | null) => {
		exited = { code, signal };
	};
	child.once('exit', onExit);

	try {
		while (Date.now() <= deadline) {
			if (exited !== undefined || !isRunning(child)) {
				const reason = exited?.signal ?? exited?.code ?? child.signalCode ?? child.exitCode;
				throw new Error(`server for ${url} exited (${String(reason)}) before listening`);
			}

			try {
				const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
				if (response.status < 500) {
					// Let a queued exit event land, then prove the response came while our
					// process was still alive rather than from a port-owning imposter.
					await delay(25);
					if (exited === undefined && isRunning(child)) return;
				}
			} catch {
				// Connection failures are expected while the server is starting.
			}
			await delay(intervalMs);
		}
	} finally {
		child.off('exit', onExit);
	}

	throw new Error(`server at ${url} did not become ready within ${timeoutMs}ms`);
}

function signalServer(server: SpawnedServer, signal: ServerTerminationSignal): void {
	const child = server.process;
	if (server.detached && child.pid !== undefined) {
		try {
			process.kill(-child.pid, signal);
			return;
		} catch {
			// The process group may already be gone; fall back to the child handle.
		}
	}
	child.kill(signal);
}

function waitForExit(child: ServerProcess, timeoutMs: number): Promise<boolean> {
	if (!isRunning(child)) return Promise.resolve(true);
	return new Promise((resolve) => {
		let settled = false;
		const finish = (exited: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.off('exit', onExit);
			resolve(exited);
		};
		const onExit = () => finish(true);
		const timer = setTimeout(() => finish(false), timeoutMs);
		child.once('exit', onExit);
		if (!isRunning(child)) finish(true);
	});
}

async function waitForServerProcessGroup(
	server: SpawnedServer,
	timeoutMs: number,
): Promise<boolean> {
	if (!server.detached || server.process.pid === undefined) {
		return waitForExit(server.process, timeoutMs);
	}
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isServerProcessGroupRunning(server)) return true;
		await delay(Math.min(25, Math.max(1, deadline - Date.now())));
	}
	return !isServerProcessGroupRunning(server);
}

/** Stop the managed server (its whole process group on POSIX), with a bounded SIGKILL fallback. */
export async function stopServer(
	server: SpawnedServer | undefined,
	graceMs = 3_000,
): Promise<void> {
	if (server === undefined || !isServerProcessGroupRunning(server)) return;
	signalServer(server, 'SIGTERM');
	if (await waitForServerProcessGroup(server, graceMs)) return;
	signalServer(server, 'SIGKILL');
	if (!(await waitForServerProcessGroup(server, 1_000))) {
		throw new Error(
			`server process group ${String(server.process.pid)} did not stop after SIGKILL`,
		);
	}
}
