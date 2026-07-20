import { render, createStream } from 'ripple/server';
import { App, setCards } from './App.tsrx';
import { makeCards, type Scenario } from './data';

// Streaming SSR entry — Ripple target. Ripple's streaming mode is
// `render(App, { stream: sink })` with a `createStream()` web
// ReadableStream: the sync pass streams the shell (fallbacks included), then
// each suspended block's resolved output is pushed as it settles. The chunks
// arrive through a reader loop (web-stream-only API). NOTE Ripple's streamed
// segments are raw block HTML without client swap/seed wiring (an upstream
// TODO in ripple/src/runtime/internal/server/index.js) — fine for this
// server-side chunk-timing bench, but it is doing less per-chunk work than
// octane/React/Solid; see the suite README.
export const streaming = true;

export async function renderStream(
	scenario: Scenario,
	onChunk: (chunk: string) => void,
): Promise<void> {
	setCards(makeCards(scenario));
	const { stream, sink } = createStream();
	const decoder = new TextDecoder();
	const reader = stream.getReader();
	const pump = (async () => {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			onChunk(decoder.decode(value));
		}
	})();
	const result = await render(App, { stream: sink });
	if (result.topLevelError) throw result.topLevelError;
	await pump;
}
