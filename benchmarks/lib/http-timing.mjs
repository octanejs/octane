// Shared HTTP/process timing for the server-backed SSR suites (ssr-http,
// tanstack-start). The cold-start methodology lives HERE so every suite
// measures the same three segments identically:
//
//   spawn ──(process boot + module eval)──▶ listen ──(first render)──▶ first
//   BODY byte ──▶ stream end
//
// Listen detection uses raw TCP connect probes, NOT HTTP requests: a connect
// probe observes the listener without issuing a request, so the very first
// HTTP request a cold server ever sees is the measured one. TTFB is the first
// response BODY chunk (headers can flush before any HTML exists).
//
// All timestamps come from one monotonic clock (process.hrtime.bigint, in ms)
// so segments computed across helpers subtract cleanly.
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

export function now() {
	return Number(process.hrtime.bigint()) / 1e6;
}

export function getFreePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close((error) => (error ? reject(error) : resolve(port)));
		});
	});
}

/**
 * GET `url`, timestamping headers, every body chunk, and stream end.
 * Returns absolute stamps (same clock as now()) plus derived durations:
 * { status, t0, tHeaders, tFirstByte, tEnd, headersMs, ttfbMs, totalMs,
 *   chunks: [{ t, bytes }], body, firstChunk }.
 * Chunk boundaries are TCP/stream-coalescing artifacts — report them under
 * meta, never guard on them.
 */
export function timedGet(url, { collectBody = true, timeoutMs = 30_000 } = {}) {
	return new Promise((resolve, reject) => {
		const t0 = now();
		const req = http.get(url, (res) => {
			const tHeaders = now();
			let tFirstByte = NaN;
			let tEnd = NaN;
			const chunks = [];
			let body = '';
			let firstChunk = '';
			res.on('data', (chunk) => {
				if (chunk.length === 0) return;
				const t = now();
				if (Number.isNaN(tFirstByte)) {
					tFirstByte = t;
					if (collectBody) firstChunk = String(chunk);
				}
				chunks.push({ t: t - t0, bytes: chunk.length });
				if (collectBody) body += chunk;
			});
			res.on('end', () => {
				tEnd = now();
				resolve({
					status: res.statusCode,
					t0,
					tHeaders,
					tFirstByte,
					tEnd,
					headersMs: tHeaders - t0,
					ttfbMs: tFirstByte - t0,
					totalMs: tEnd - t0,
					chunks,
					body,
					firstChunk,
				});
			});
			res.on('error', reject);
		});
		req.setTimeout(timeoutMs, () => req.destroy(new Error(`GET ${url} timed out`)));
		req.on('error', reject);
	});
}

/**
 * Resolve with the listen timestamp once `port` accepts TCP connections.
 * Exit-aware: rejects immediately (with captured logs when available) if the
 * server process dies first.
 */
export function waitForListen(port, child, { intervalMs = 5, timeoutMs = 30_000, logs } = {}) {
	return new Promise((resolve, reject) => {
		const deadline = now() + timeoutMs;
		let settled = false;
		const fail = (message) => {
			if (settled) return;
			settled = true;
			child?.off?.('exit', onExit);
			reject(new Error(logs ? `${message}\n--- server logs ---\n${logs()}` : message));
		};
		const onExit = (code) => fail(`server exited with ${code} before listening on ${port}`);
		child?.once?.('exit', onExit);
		const probe = () => {
			if (settled) return;
			if (child && child.exitCode !== null) return onExit(child.exitCode);
			const socket = net.connect({ port, host: '127.0.0.1' });
			socket.once('connect', () => {
				const tListen = now();
				socket.destroy();
				if (settled) return;
				settled = true;
				child?.off?.('exit', onExit);
				resolve(tListen);
			});
			socket.once('error', () => {
				socket.destroy();
				if (now() > deadline) return fail(`server never listened on ${port}`);
				setTimeout(probe, intervalMs);
			});
		};
		probe();
	});
}

/**
 * Spawn a server process in its own process group (so stopServer can kill the
 * whole tree), capturing interleaved stdout+stderr for failure reports.
 */
export function spawnServer(command, args, { cwd, env } = {}) {
	const child = spawn(command, args, {
		cwd,
		env: { ...process.env, NODE_ENV: 'production', ...env },
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: process.platform !== 'win32',
	});
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	return { child, logs: () => output };
}

/**
 * SIGTERM the process group, await actual exit, escalate to SIGKILL after
 * `graceMs`. Always awaits the exit event so ports are genuinely free before
 * the next cold iteration spawns.
 */
export function stopServer(child, { graceMs = 2_000 } = {}) {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
	const signalGroup = (signal) => {
		try {
			if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
			else child.kill(signal);
		} catch {
			// Already gone.
		}
	};
	return new Promise((resolve) => {
		const killTimer = setTimeout(() => signalGroup('SIGKILL'), graceMs);
		child.once('exit', () => {
			clearTimeout(killTimer);
			resolve();
		});
		signalGroup('SIGTERM');
	});
}

/**
 * One full cold-start iteration: fresh port → spawn → TCP listen → one GET →
 * kill (and await exit). Returns segment durations in ms plus the response.
 */
export async function coldStartOnce({ command, args, cwd, env = {}, path = '/', timeoutMs }) {
	const port = await getFreePort();
	const tSpawn = now();
	const { child, logs } = spawnServer(command, args, {
		cwd,
		env: { ...env, PORT: String(port) },
	});
	try {
		const tListen = await waitForListen(port, child, { timeoutMs, logs });
		const response = await timedGet(`http://127.0.0.1:${port}${path}`, { timeoutMs });
		return {
			spawnToListen: tListen - tSpawn,
			listenToFirstByte: response.tFirstByte - tListen,
			spawnToFirstByte: response.tFirstByte - tSpawn,
			total: response.tEnd - tSpawn,
			response,
			logs,
		};
	} finally {
		await stopServer(child);
	}
}
