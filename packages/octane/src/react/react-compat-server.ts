/** Buffered React islands for the Octane server renderer. */
import { renderToReadableStream } from 'react-dom/server';
import {
	createElement,
	descriptorChildren,
	EXTERNAL_HYDRATION_PROMISE,
	getServerRenderResourceContext,
	puMemo,
	use,
	useContext,
	useId,
	type Context as ServerContext,
	type ServerRenderResourceContext,
} from '../runtime.server.js';
import type { OctaneNode } from '../runtime.js';
import { createReactCompatTree } from './react-compat-envelope.js';
import {
	createReactIslandElement,
	resolveReactIsland,
	validateReactContextBridges,
	type ReactCompatClassComponentProps,
	type ReactCompatComponentProps,
	type ReactCompatProps,
} from './react-compat-shared.js';

const SERVER_RENDER_SLOT = Symbol('octane.react-compat.server.render');
const SERVER_RESULT_SLOT = Symbol('octane.react-compat.server.result');
// Bound the HTML retained by the adapter. React's own rendering allocations
// still depend on the authored tree, as with a standalone buffered React render.
const MAX_ISLAND_HTML_BYTES = 8 * 1024 * 1024;

function bufferReactIsland(
	tree: Parameters<typeof renderToReadableStream>[0],
	identifierPrefix: string,
	owner: ServerRenderResourceContext,
): Promise<string> {
	const controller = new AbortController();
	let finished = false;
	let failure: { reason: unknown } | undefined;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	let fullyRead = false;

	const abort = (reason: unknown): void => {
		if (finished || failure !== undefined) return;
		failure = { reason };
		controller.abort(reason);
	};
	const throwIfFailed = (): void => {
		if (failure !== undefined) throw failure.reason;
	};
	const onAbort = (): void => abort(owner.signal!.reason);
	const release = owner.registerCleanup(() => {
		abort(new Error('<ReactCompat> server rendering ended before the React island completed.'));
	});
	if (owner.signal?.aborted) onAbort();
	else owner.signal?.addEventListener('abort', onAbort, { once: true });
	if (owner.timeoutMs > 0) {
		timeout = setTimeout(() => {
			abort(new Error(`<ReactCompat> server rendering exceeded ${owner.timeoutMs}ms.`));
		}, owner.timeoutMs);
	}

	const result = (async () => {
		try {
			const stream = await renderToReadableStream(tree, {
				identifierPrefix,
				nonce: owner.nonce,
				signal: controller.signal,
				onError(reason) {
					// React's server error boundaries cannot catch render failures.
					// Route every server failure to the enclosing Octane @catch,
					// rather than silently handing it to a future client render.
					if (failure !== undefined) return;
					failure = { reason };
					queueMicrotask(() => controller.abort(reason));
				},
			});
			// Starting consumption only after allReady gives hydrateRoot the
			// complete React HTML, with no progressive reveal scripts to execute.
			await stream.allReady;
			throwIfFailed();
			reader = stream.getReader();
			const decoder = new TextDecoder();
			let bytes = 0;
			let html = '';
			for (;;) {
				const chunk = await reader.read();
				throwIfFailed();
				if (chunk.done) {
					fullyRead = true;
					return html + decoder.decode();
				}
				bytes += chunk.value.byteLength;
				if (bytes > MAX_ISLAND_HTML_BYTES) {
					throw new Error('<ReactCompat> server-rendered island HTML exceeds the 8 MiB limit.');
				}
				html += decoder.decode(chunk.value, { stream: true });
			}
		} finally {
			finished = true;
			if (timeout !== undefined) clearTimeout(timeout);
			owner.signal?.removeEventListener('abort', onAbort);
			release();
			if (!fullyRead) {
				controller.abort(failure?.reason);
				await reader?.cancel().catch(() => {});
			}
			reader?.releaseLock();
		}
	})();
	// A synchronous Octane render can return its fallback and cancel this work
	// before the usual async settle loop attaches. Observe that rejection here.
	result.catch(() => {});
	Object.defineProperty(result, EXTERNAL_HYDRATION_PROMISE, { value: true });
	return result;
}

function ReactCompatServer<C extends import('react').ComponentClass<any>>(
	props: ReactCompatClassComponentProps<C>,
): OctaneNode;
function ReactCompatServer<P>(props: ReactCompatComponentProps<P>): OctaneNode;
function ReactCompatServer(props: ReactCompatProps): OctaneNode;
function ReactCompatServer(
	props: ReactCompatProps | ReactCompatComponentProps<unknown>,
): OctaneNode {
	const child = resolveReactIsland(props);
	const contexts = validateReactContextBridges(props.contexts).map(({ source, target }) => ({
		context: target,
		value: useContext(source as ServerContext<unknown>),
	}));
	const identifierPrefix = `react-compat-${useId()}`;
	const owner = getServerRenderResourceContext();
	if (owner === null) {
		throw new Error(
			'<ReactCompat> server rendering requires an owned Octane render request. ' +
				'Nesting it inside React-hosted <OctaneCompat> on the server is not supported.',
		);
	}
	// Frame/async-scope ownership, rather than reconstructed props identity,
	// preserves one request-local Fizz attempt across every Octane retry.
	const pending = puMemo(
		() =>
			bufferReactIsland(
				createReactCompatTree(createReactIslandElement(child), contexts, null),
				identifierPrefix,
				owner,
			),
		[child.type, child.key, identifierPrefix],
		SERVER_RENDER_SLOT,
	);
	const html = use(pending, SERVER_RESULT_SLOT);
	return createElement('div', {
		'data-react-compat': '',
		suppressHydrationWarning: true,
		dangerouslySetInnerHTML: { __html: html },
	});
}

export const ReactCompat = descriptorChildren(ReactCompatServer);
