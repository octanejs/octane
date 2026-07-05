import { renderToPipeableStream } from 'octane/server';
import { App } from './App.tsrx';
import { makeCards, type Scenario } from './data';

// Streaming SSR entry — octane target. The harness (../run.mjs) imports the
// BUILT bundle of this module and times renderStream(): data promises start at
// call time (like backend requests fired when the HTTP request arrives), then
// octane's renderToPipeableStream drives its pass-based out-of-order stream
// into the harness-supplied chunk callback. Octane's signature convention is
// (Component, props?, options?) and chunks buffer until pipe() — piping the
// plain { write, end } destination immediately makes every write land in
// onChunk in real time.
export const streaming = true;

export function renderStream(scenario: Scenario, onChunk: (chunk: string) => void): Promise<void> {
	return new Promise((resolve, reject) => {
		const { pipe } = renderToPipeableStream(
			App,
			{ cards: makeCards(scenario) },
			{ onShellError: reject },
		);
		pipe({
			write: onChunk,
			end: resolve,
		});
	});
}
