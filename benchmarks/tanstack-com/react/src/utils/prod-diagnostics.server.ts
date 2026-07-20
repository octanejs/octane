import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { supportsProcessDiagnostics } from '~/server/runtime/host.server';
import { getClientIp } from '~/utils/request.server';

const isProduction = process.env.NODE_ENV === 'production';
const requestStorage = new AsyncLocalStorage<RequestDiagnostics>();

let fetchProbeInstalled = false;
let processProbeInstalled = false;
let fdHighWatermark = 0;

type HostCounter = Map<string, number>;

type RequestDiagnostics = {
	requestId: string;
	method: string;
	pathname: string;
	startedAt: number;
	clientIp: string;
	outboundHosts: HostCounter;
	outboundFetchCount: number;
	outboundFetchErrors: number;
};

function incrementMapCount(map: HostCounter, key: string): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

function getFdCount(): number {
	try {
		return readdirSync('/proc/self/fd').length;
	} catch {
		return -1;
	}
}

function getResourceSummary(): Record<string, number> {
	const summary: Record<string, number> = {};

	const getActiveResourcesInfo = process.getActiveResourcesInfo;
	if (typeof getActiveResourcesInfo !== 'function') {
		return summary;
	}

	try {
		for (const resource of getActiveResourcesInfo()) {
			summary[resource] = (summary[resource] ?? 0) + 1;
		}
	} catch {
		return summary;
	}

	return summary;
}

function getTopHosts(outboundHosts: HostCounter, limit = 8): Array<[string, number]> {
	return [...outboundHosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function toUrl(input: RequestInfo | URL): URL | null {
	if (typeof input === 'string') {
		return new URL(input);
	}

	if (input instanceof URL) {
		return input;
	}

	return new URL(input.url);
}

function logDiagnostic(payload: Record<string, unknown>): void {
	console.log(
		JSON.stringify({
			logType: 'prod_diagnostics',
			pid: process.pid,
			...payload,
		}),
	);
}

function maybeLogFdHighWatermark(): void {
	if (!supportsProcessDiagnostics()) {
		return;
	}

	const fdCount = getFdCount();
	if (fdCount > fdHighWatermark) {
		fdHighWatermark = fdCount;
		logDiagnostic({
			event: 'fd_high_watermark',
			fdCount,
			resourceSummary: getResourceSummary(),
		});
	}
}

export function installProductionFetchProbe(): void {
	if (!isProduction || fetchProbeInstalled) {
		return;
	}

	fetchProbeInstalled = true;
	const originalFetch = globalThis.fetch.bind(globalThis);

	const wrappedFetch: typeof fetch = async (input, init) => {
		const context = requestStorage.getStore();
		if (!context) {
			return originalFetch(input, init);
		}

		context.outboundFetchCount += 1;

		try {
			const url = toUrl(input);
			if (url) {
				incrementMapCount(context.outboundHosts, url.host);
			}
		} catch {
			incrementMapCount(context.outboundHosts, 'unknown');
		}

		try {
			return await originalFetch(input, init);
		} catch (error) {
			context.outboundFetchErrors += 1;
			throw error;
		}
	};

	globalThis.fetch = wrappedFetch;
}

export function installProductionProcessProbe(): void {
	if (
		!isProduction ||
		processProbeInstalled ||
		!supportsProcessDiagnostics() ||
		typeof process.on !== 'function'
	) {
		return;
	}

	processProbeInstalled = true;

	const heartbeat = setInterval(() => {
		maybeLogFdHighWatermark();
		logDiagnostic({
			event: 'process_heartbeat',
			pid: process.pid,
			fdCount: getFdCount(),
			resourceSummary: getResourceSummary(),
		});
	}, 30_000);

	if (
		typeof heartbeat === 'object' &&
		heartbeat &&
		'unref' in heartbeat &&
		typeof heartbeat.unref === 'function'
	) {
		heartbeat.unref();
	}

	process.on('unhandledRejection', (reason) => {
		const message = reason instanceof Error ? reason.message : String(reason ?? 'unknown');
		const stack = reason instanceof Error ? reason.stack : undefined;
		maybeLogFdHighWatermark();
		logDiagnostic({
			event: 'unhandled_rejection',
			pid: process.pid,
			fdCount: getFdCount(),
			resourceSummary: getResourceSummary(),
			errorMessage: message,
			errorStack: stack,
		});
	});

	process.on('uncaughtException', (error) => {
		maybeLogFdHighWatermark();
		logDiagnostic({
			event: 'uncaught_exception',
			pid: process.pid,
			fdCount: getFdCount(),
			resourceSummary: getResourceSummary(),
			errorMessage: error.message,
			errorStack: error.stack,
		});
	});
}

export function runWithRequestDiagnostics<T>(
	request: Request,
	fn: (context: RequestDiagnostics) => Promise<T>,
): Promise<T> {
	if (!isProduction) {
		return fn({
			requestId: randomUUID(),
			method: request.method,
			pathname: new URL(request.url).pathname,
			startedAt: Date.now(),
			clientIp: getClientIp(request, 'unknown'),
			outboundHosts: new Map<string, number>(),
			outboundFetchCount: 0,
			outboundFetchErrors: 0,
		});
	}

	const context: RequestDiagnostics = {
		requestId: randomUUID(),
		method: request.method,
		pathname: new URL(request.url).pathname,
		startedAt: Date.now(),
		clientIp: getClientIp(request, 'unknown'),
		outboundHosts: new Map<string, number>(),
		outboundFetchCount: 0,
		outboundFetchErrors: 0,
	};

	return requestStorage.run(context, () => fn(context));
}

export function logRequestStart(context: RequestDiagnostics): void {
	if (!isProduction) {
		return;
	}

	const fdCount = getFdCount();
	maybeLogFdHighWatermark();
	logDiagnostic({
		event: 'request_start',
		requestId: context.requestId,
		method: context.method,
		pathname: context.pathname,
		clientIp: context.clientIp,
		fdCount,
	});
}

export function logRequestEnd(
	context: RequestDiagnostics,
	status: number,
	extra?: Record<string, unknown>,
): void {
	if (!isProduction) {
		return;
	}

	const durationMs = Date.now() - context.startedAt;
	const fdCount = getFdCount();
	maybeLogFdHighWatermark();
	logDiagnostic({
		event: 'request_end',
		requestId: context.requestId,
		method: context.method,
		pathname: context.pathname,
		status,
		durationMs,
		fdCount,
		outboundFetchCount: context.outboundFetchCount,
		outboundFetchErrors: context.outboundFetchErrors,
		topOutboundHosts: getTopHosts(context.outboundHosts),
		resourceSummary: getResourceSummary(),
		...extra,
	});
}

export function logRequestError(
	context: RequestDiagnostics,
	error: unknown,
	extra?: Record<string, unknown>,
): void {
	if (!isProduction) {
		return;
	}

	const durationMs = Date.now() - context.startedAt;
	const fdCount = getFdCount();
	maybeLogFdHighWatermark();

	const errorDetails =
		error instanceof Error
			? {
					errorName: error.name,
					errorMessage: error.message,
					errorStack: error.stack,
				}
			: {
					errorName: 'UnknownError',
					errorMessage: String(error),
					errorStack: undefined,
				};

	logDiagnostic({
		event: 'request_error',
		requestId: context.requestId,
		method: context.method,
		pathname: context.pathname,
		durationMs,
		fdCount,
		outboundFetchCount: context.outboundFetchCount,
		outboundFetchErrors: context.outboundFetchErrors,
		topOutboundHosts: getTopHosts(context.outboundHosts),
		resourceSummary: getResourceSummary(),
		...errorDetails,
		...extra,
	});
}

export function logUploadthingProbe(
	method: string,
	phase: 'start' | 'end' | 'error',
	details: Record<string, unknown>,
): void {
	if (!isProduction) {
		return;
	}

	maybeLogFdHighWatermark();
	logDiagnostic({
		event: 'uploadthing_probe',
		method,
		phase,
		fdCount: getFdCount(),
		resourceSummary: getResourceSummary(),
		...details,
	});
}
