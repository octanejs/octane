import { renderToReadableStream } from 'octane/server';
import { isbot } from 'isbot';
import {
	createSsrStreamResponse,
	getSsrStatus,
	transformReadableStreamWithRouter,
	waitForRequest,
} from '@tanstack/router-core/ssr/server';
import type { ComponentBody } from 'octane';
import type { AnyRouter } from '@tanstack/router-core';

type RouterApp = ComponentBody<{ router: AnyRouter }>;
type ServerComponent = Parameters<typeof renderToReadableStream>[0];

// router-core 1.171.34 redesigned SSR serialization: the previous
// `ServerSsr` buffered-HTML / script-barrier pull API (which octane bridged to
// its native `StreamOptions.injection`) is gone. Octane now renders a plain HTML
// stream and pipes it through router-core's `transformReadableStreamWithRouter`,
// which injects the dehydrated router scripts at the `<Scripts>` boundary and
// prepends `<!DOCTYPE html>`; `createSsrStreamResponse` owns the request-lifetime
// teardown. Dehydration already ran in start-server-core's request handler. Bots
// wait for every suspense boundary (`stream.allReady`) before the response is
// produced so crawlers receive the fully-resolved document.
export async function renderRouterToStream({
	request,
	router,
	responseHeaders,
	App,
}: {
	request: Request;
	router: AnyRouter;
	responseHeaders: Headers;
	App: RouterApp;
}) {
	const signal = request.signal;
	if (signal.aborted) {
		router.serverSsr?.cleanup();
		throw signal.reason;
	}

	let rendererTeardown = false;
	const bot = isbot(request.headers.get('User-Agent'));

	try {
		const stream = await renderToReadableStream(
			App as unknown as ServerComponent,
			{ router },
			{
				signal,
				nonce: router.options.ssr?.nonce,
				onError(error: unknown) {
					if (!rendererTeardown && !signal.aborted && !isAbortError(request, error)) {
						console.error('Error in renderToReadableStream:', error);
					}
				},
			},
		);

		const rendererAbort = bot ? new AbortController() : undefined;
		const responseStream = transformReadableStreamWithRouter(
			router,
			finalizeDocumentShell(stream as unknown as ReadableStream<Uint8Array>),
			{
				rendererSafePoint: 'script-close',
				signal,
				onAbort: (reason: unknown) => {
					rendererTeardown = true;
					rendererAbort?.abort(reason);
				},
			},
		);

		if (rendererAbort) {
			await waitForRequest(stream.allReady, rendererAbort.signal);
		}

		return createSsrStreamResponse(
			router,
			new Response(responseStream, {
				status: getSsrStatus(router),
				headers: responseHeaders,
			}),
		);
	} catch (error) {
		router.serverSsr?.cleanup();
		throw error;
	}
}

// Finalize octane's streamed document shell for the router-core stream path.
// octane (without its former native injection) emits the deduped scoped-style
// tags (`<style data-octane=…>`) ahead of the document shell (before `<html>`)
// and no `<!DOCTYPE html>`, and router-core's *stream* transform injects router
// scripts but neither moves those styles nor adds the doctype (only its string
// transform does). So, for a document render, fold the leading style run into the
// shell `<head>` and prepend the doctype — what octane's native-injection
// document mode (and, before it, an explicit relocate transform) used to do. Only
// the shell prefix (through `</head>`) is buffered; everything after streams
// straight through, preserving out-of-order boundary flushing. A non-document
// render (no `</head>`) passes through unchanged.
function finalizeDocumentShell(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let prefix = '';
	let finalized = false;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (finalized) {
				const { value, done } = await reader.read();
				if (done) controller.close();
				else controller.enqueue(value);
				return;
			}
			for (;;) {
				const { value, done } = await reader.read();
				if (value) prefix += decoder.decode(value, { stream: true });
				if (prefix.includes('</head>')) {
					const htmlStart = prefix.search(/<html[\s/>]/i);
					if (htmlStart >= 0) {
						if (htmlStart > 0) {
							const leading = prefix.slice(0, htmlStart);
							const doc = prefix.slice(htmlStart);
							const headClose = doc.indexOf('</head>');
							prefix = doc.slice(0, headClose) + leading + doc.slice(headClose);
						}
						if (!/^\s*<!doctype/i.test(prefix)) prefix = '<!DOCTYPE html>' + prefix;
					}
					controller.enqueue(encoder.encode(prefix));
					prefix = '';
					finalized = true;
					return;
				}
				if (done) {
					if (prefix) controller.enqueue(encoder.encode(prefix));
					prefix = '';
					finalized = true;
					controller.close();
					return;
				}
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
}

function isAbortError(request: Request, error: unknown) {
	return (
		(request.signal.aborted && error === request.signal.reason) ||
		(error instanceof Error && error.name === 'AbortError')
	);
}
