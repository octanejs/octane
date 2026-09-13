import type { Context } from '@octanejs/app-core';
import type { ServerCallContext } from 'octane/server';
import { bodyRows, historyRows, scenarioConfig } from './data.mjs';

type TraceEvent = { event: string; at: number; revision?: number; count?: number };
type RequestTrace = {
	requestId: number;
	scenario: string;
	latency: string;
	bodyCount: number;
	historyCount: number;
	events: TraceEvent[];
};
type RunTrace = { run: string; requests: RequestTrace[]; truncated: boolean };
type RequestState = {
	config: ReturnType<typeof scenarioConfig>;
	trace: RequestTrace;
	run: RunTrace;
	viewer: object;
	ready: boolean;
	auth?: Promise<object>;
};

const requests = new WeakMap<Request, RequestState>();
const traces = new Map<string, RunTrace>();
const authGates = new Map<RequestState, () => void>();
let nextRequest = 0;

export function requestState(request: Request): RequestState {
	const existing = requests.get(request);
	if (existing !== undefined) return existing;
	const header = request.headers.get('x-conversation-bench');
	if (header !== null && header.length > 1_024) throw new TypeError('Configuration is too large');
	const config = scenarioConfig(header === null ? {} : JSON.parse(header));
	let run = traces.get(config.run);
	if (run === undefined) {
		if (traces.size >= 64) traces.delete(traces.keys().next().value!);
		run = { run: config.run, requests: [], truncated: false };
		traces.set(config.run, run);
	}
	const trace: RequestTrace = {
		requestId: ++nextRequest,
		scenario: config.scenario,
		latency: config.latency,
		bodyCount: config.bodyCount,
		historyCount: config.historyCount,
		events: [],
	};
	if (run.requests.length < 64) run.requests.push(trace);
	else run.truncated = true;
	const state: RequestState = {
		config,
		trace,
		run,
		viewer: Object.freeze({ requestId: trace.requestId }),
		ready: false,
	};
	requests.set(request, state);
	request.signal.addEventListener('abort', () => record(state, 'request:abort'), { once: true });
	return state;
}

function record(state: RequestState, event: string, revision?: number, count?: number) {
	if (state.trace.events.length >= 128) {
		state.run.truncated = true;
		return;
	}
	state.trace.events.push({
		event,
		at: performance.now(),
		...(revision === undefined ? {} : { revision }),
		...(count === undefined ? {} : { count }),
	});
}

async function wait(milliseconds: number, signal: AbortSignal) {
	signal.throwIfAborted();
	if (milliseconds === 0) {
		// CPU mode retains asynchronous suspension without sleeping on a timer.
		await Promise.resolve();
		signal.throwIfAborted();
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', abort);
			resolve();
		}, milliseconds);
		signal.addEventListener('abort', abort, { once: true });
	});
	signal.throwIfAborted();
}

export function authorizeRequest(request: Request): Promise<object> {
	const state = requestState(request);
	if (state.auth !== undefined) return state.auth;
	record(state, 'auth:start');
	state.auth = (async () => {
		if (state.config.holdAuth) await holdAuthorization(state, request.signal);
		await wait(state.config.authDelay, request.signal);
		if (state.config.scenario === 'denied') {
			record(state, 'auth:denied');
			throw new Error('Fixture authorization denied');
		}
		state.ready = true;
		record(state, 'auth:ready');
		return state.viewer;
	})();
	return state.auth;
}

async function holdAuthorization(state: RequestState, signal: AbortSignal) {
	signal.throwIfAborted();
	if (authGates.size >= 64) throw new Error('Too many held fixture requests');
	await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timer);
			authGates.delete(state);
			signal.removeEventListener('abort', abort);
		};
		const abort = () => {
			cleanup();
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			cleanup();
			record(state, 'auth:hold-timeout');
			reject(new Error('Fixture authorization hold expired'));
		}, 30_000);
		authGates.set(state, () => {
			cleanup();
			record(state, 'auth:released');
			resolve();
		});
		signal.addEventListener('abort', abort, { once: true });
		record(state, 'auth:held');
	});
}

function authorized(context: ServerCallContext): RequestState {
	context.signal.throwIfAborted();
	const state = requests.get(context.request);
	if (state === undefined || !state.ready || context.viewer !== state.viewer) {
		throw new Error('Private fixture reads require the current authorized context');
	}
	return state;
}

export function authorization(context: ServerCallContext) {
	authorized(context);
	// Only public readiness crosses the module-server boundary, never viewer.
	return 'authorized';
}

export async function* conversation(context: ServerCallContext) {
	const state = authorized(context);
	record(state, 'body:start');
	const rows = bodyRows(state.config.bodyCount);
	try {
		for (let revision = 1; revision <= state.config.waves; revision++) {
			await wait(revision === 1 ? state.config.bodyDelay : state.config.waveDelay, context.signal);
			const visible = rows.slice(0, Math.ceil((rows.length * revision) / state.config.waves));
			record(state, 'body:yield', revision, visible.length);
			yield { revision, total: rows.length, rows: visible };
		}
		record(state, 'body:complete');
	} finally {
		if (context.signal.aborted) record(state, 'body:abort');
	}
}

export async function* history(context: ServerCallContext) {
	const state = authorized(context);
	record(state, 'history:start');
	const rows = historyRows(state.config.historyCount);
	try {
		for (let revision = 1; revision <= state.config.waves; revision++) {
			await wait(
				revision === 1 ? state.config.historyDelay : state.config.waveDelay,
				context.signal,
			);
			const visible = rows.slice(0, Math.ceil((rows.length * revision) / state.config.waves));
			record(state, 'history:yield', revision, visible.length);
			yield { revision, total: rows.length, rows: visible };
		}
		record(state, 'history:complete');
	} finally {
		if (context.signal.aborted) record(state, 'history:abort');
	}
}

export function traceResponse(context: Context): Response {
	const run = new URL(context.request.url).searchParams.get('run') ?? '';
	return Response.json(traces.get(run) ?? { run, requests: [], truncated: false }, {
		headers: { 'Cache-Control': 'no-store' },
	});
}

export function releaseAuthorization(context: Context): Response {
	if (context.request.method !== 'POST') {
		return new Response('Use POST to release the local fixture gate', {
			status: 405,
			headers: { Allow: 'POST' },
		});
	}
	const run = new URL(context.request.url).searchParams.get('run') ?? '';
	if (!/^[a-zA-Z0-9_-]{1,80}$/.test(run)) return new Response('Invalid run', { status: 400 });
	let released = 0;
	for (const [state, release] of authGates) {
		if (state.config.run === run) {
			release();
			released++;
		}
	}
	return Response.json({ run, released }, { headers: { 'Cache-Control': 'no-store' } });
}
