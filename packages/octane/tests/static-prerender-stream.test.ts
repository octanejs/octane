// React's react-dom/static `prerenderToNodeStream` adapted to Octane: the
// promise resolves only after the await-everything render fully completes
// (identical suspension semantics to `prerender`), and `prelude` is a Node
// Readable carrying the complete document bytes — deduped scoped-style tags
// first, then the folded html — byte-identical to the buffered `prerender`'s
// `css + html`. There is no `postponed` field: Octane has no postpone/resume
// protocol (a documented non-goal), and no `{ prelude }`-with-holes shape.
import { describe, it, expect } from 'vitest';
import * as Server from 'octane/server';
import { prerender, prerenderToNodeStream } from 'octane/static';
import { loadServerFixture } from './_server-fixture.js';

async function collect(stream: AsyncIterable<unknown>): Promise<string> {
	let out = '';
	for await (const chunk of stream) out += String(chunk);
	return out;
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('octane/static — prerenderToNodeStream', () => {
	it('resolves only after every use(thenable) settles; prelude carries the full document', async () => {
		const d = deferred<string>();
		const App = () => {
			const v = Server.use(d.promise);
			return Server.createElement('div', { id: 'app' }, String(v)) as any;
		};
		const pending = prerenderToNodeStream(App as any);
		let settled = false;
		void pending.then(() => {
			settled = true;
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(settled).toBe(false); // still awaiting the thenable
		d.resolve('done');
		const { prelude } = await pending;
		const bytes = await collect(prelude as AsyncIterable<unknown>);
		expect(bytes).toContain('id="app"');
		expect(bytes).toContain('done');
	});

	it('prelude bytes equal the buffered prerender css + html (scoped styles first)', async () => {
		const srv = loadServerFixture('packages/octane/tests/_fixtures/float-resources.tsrx') as Record<
			string,
			any
		>;
		const buffered = await prerender(srv.ScopedControl, {});
		expect(buffered.css).not.toBe(''); // the fixture carries scoped CSS
		const { prelude } = await prerenderToNodeStream(srv.ScopedControl, {});
		const bytes = await collect(prelude as AsyncIterable<unknown>);
		expect(bytes).toBe(buffered.css + buffered.html);
	});

	it('an aborted signal rejects like prerender', async () => {
		const controller = new AbortController();
		controller.abort(new Error('static-abort'));
		const App = () => Server.createElement('div', null, 'x') as any;
		await expect(
			prerenderToNodeStream(App as any, undefined, { signal: controller.signal }),
		).rejects.toThrow('static-abort');
	});
});
