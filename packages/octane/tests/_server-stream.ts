/**
 * Shared public-API helpers for server-stream tests.
 *
 * Keep transport plumbing and jsdom's explicit inline-script activation here so
 * conformance tests can concentrate on observable shell, reveal, error, abort,
 * and hydration outcomes. Tests should not assert renderer-private protocol ids
 * or marker spelling through these helpers.
 */
import * as ServerRuntime from 'octane/server';
import type { StreamOptions } from 'octane/server';

type ServerComponent = Parameters<typeof ServerRuntime.renderToPipeableStream>[0];

export interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T | PromiseLike<T>): void;
	reject(reason?: unknown): void;
}

export function deferred<T>(): Deferred<T> {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export interface PipeableCollector {
	/** Chunks in the order accepted by the destination. */
	readonly chunks: string[];
	/** Resolves to the concatenated response when the destination ends. */
	readonly ended: Promise<string>;
	/** A minimal Node-style destination accepted by renderToPipeableStream. */
	readonly destination: {
		write(chunk: string | Uint8Array): boolean;
		end(): void;
	};
}

/**
 * Create a controllable destination without starting a render. This is the
 * useful form for tests that inspect the shell before settling a boundary.
 */
export function createPipeableCollector(): PipeableCollector {
	const chunks: string[] = [];
	const decoder = new TextDecoder();
	let resolveEnded!: (html: string) => void;
	const ended = new Promise<string>((resolve) => {
		resolveEnded = resolve;
	});
	let didEnd = false;

	return {
		chunks,
		ended,
		destination: {
			write(chunk) {
				chunks.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk));
				return true;
			},
			end() {
				if (didEnd) return;
				didEnd = true;
				resolveEnded(chunks.join(''));
			},
		},
	};
}

export interface CollectedServerStream {
	/** Complete streamed response. */
	html: string;
	/** Transport chunks in acceptance order. */
	chunks: string[];
	/** Errors reported through the public onError callback. */
	errors: unknown[];
}

/** Collect a Node-style stream to completion through the public API. */
export async function collectPipeableStream(
	component: ServerComponent,
	props?: any,
	options?: StreamOptions,
): Promise<CollectedServerStream> {
	const collector = createPipeableCollector();
	const errors: unknown[] = [];
	let rejectShell!: (reason?: unknown) => void;
	const shellFailure = new Promise<never>((_resolve, reject) => {
		rejectShell = reject;
	});
	// Avoid an unhandled rejection if a destination ends in the same turn as a
	// shell failure; Promise.race below still observes the rejection.
	shellFailure.catch(() => {});

	const render = ServerRuntime.renderToPipeableStream(component, props, {
		...options,
		onError(error) {
			errors.push(error);
			options?.onError?.(error);
		},
		onShellError(error) {
			options?.onShellError?.(error);
			rejectShell(error);
		},
	});
	render.pipe(collector.destination);
	const html = await Promise.race([collector.ended, shellFailure]);
	return { html, chunks: collector.chunks, errors };
}

/**
 * Collect a web stream while actively pulling it. `allReady` is deliberately
 * awaited only after consumption because backpressure can keep it pending.
 */
export async function collectReadableStream(
	component: ServerComponent,
	props?: any,
	options?: StreamOptions,
): Promise<CollectedServerStream> {
	const errors: unknown[] = [];
	const stream = await ServerRuntime.renderToReadableStream(component, props, {
		...options,
		onError(error) {
			errors.push(error);
			options?.onError?.(error);
		},
	});
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(decoder.decode(value, { stream: true }));
	}
	const trailing = decoder.decode();
	if (trailing !== '') chunks.push(trailing);
	await stream.allReady;
	return { html: chunks.join(''), chunks, errors };
}

export interface ActivateStreamedMarkupOptions {
	/** Remove executed inline scripts, matching the established hydration fixtures. */
	removeScripts?: boolean;
}

/**
 * Execute executable inline scripts from collected stream markup in document
 * order. Browsers do this while parsing a response; scripts inserted through
 * `innerHTML` in jsdom are inert, so streaming-to-hydration tests opt in here.
 */
export function activateStreamedMarkup(
	container: ParentNode,
	options: ActivateStreamedMarkupOptions = {},
): void {
	const removeScripts = options.removeScripts ?? true;
	for (const script of Array.from(container.querySelectorAll('script'))) {
		const type = script.getAttribute('type');
		if (type === 'application/json' || script.hasAttribute('src')) continue;
		const code = script.textContent ?? '';
		if (code !== '') {
			// Indirect eval runs in the jsdom window global, like an inline script.
			// eslint-disable-next-line no-eval
			(0, eval)(code);
		}
		if (removeScripts) script.remove();
	}
}

/** Clear renderer-installed stream globals between browser-simulation cases. */
export function resetStreamRuntimeGlobals(): void {
	if (typeof window === 'undefined') return;
	delete (window as any).$OCTS;
	delete (window as any).$OCTRC;
	delete (window as any).$OCTRX;
}
