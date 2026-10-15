import { expect, it, vi } from 'vitest';
import { act, enableSignalBindings, hydrateRoot } from '../../src/runtime.js';
import { renderToReadableStream } from '../../src/runtime.server.js';
import { bootstrapStreamedSignalResults } from '../../src/hydration/streamed-signals.js';
import * as Signals from '../../src/signals/index.js';
import { __queryAt } from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A server module that reads module signals installs the native read
// collector as it loads, for every later render in the process. A render that
// reads a pending query's snapshot then completed with a read it could not
// seed, and threw. The snapshot rendered the pending state as it is, and the
// client resolves it itself or takes the stream's delivery, as here, so the
// read carries no seed (signals-hydration.test.ts covers a render without one).

const MODULE_SIGNALS = `import { signal$ } from 'octane/signals';
export const label$ = signal$('module');
export function App() @{ <p>{label$.get() as string}</p> }`;

const PENDING_SNAPSHOT = `import { value$ } from './state';
export function App() @{ <p>{value$.snapshot().status as string}</p> }`;

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let result = '';
	for (;;) {
		const next = await reader.read();
		if (next.done) return result + decoder.decode();
		result += decoder.decode(next.value, { stream: true });
	}
}

/** The stream's selection, its frames before the result, and the result frames. */
function streamedFrames(html: string) {
	const frames = [
		...html.matchAll(/__octaneStreamedRenderer\.receive\((\{.*?\})\);<\/script>/g),
	].map((match) => JSON.parse(match[1]!) as { kind: string });
	const selection = html.match(/v\.register\((\{.*?\})\);\}\)\(globalThis\);<\/script>/);
	expect(selection).not.toBeNull();
	expect(frames.map((frame) => frame.kind)).toEqual(['open', 'value', 'complete']);
	const renderer = {
		version: 1,
		frames: frames.slice(0, 1),
		receive(frame: unknown) {
			renderer.frames.push(frame as { kind: string });
		},
	};
	const target = {
		__octaneStreamedSignalSelections: {
			version: 1,
			identities: [JSON.parse(selection![1]!)],
			register() {},
		},
		__octaneStreamedRenderer: renderer,
	};
	// The bootstrap may take over the receiver, so deliver through the target.
	const deliver = () => {
		for (const frame of frames.slice(1)) target.__octaneStreamedRenderer.receive(frame);
	};
	return { target, deliver };
}

it('renders and hydrates a pending snapshot after a module-signal module loads', async () => {
	// A module-signal server module, as any application bundle may contain.
	const page = loadCompiledFixtureSource(MODULE_SIGNALS, {
		id: '/src/module-signal-page.tsrx',
		compileOptions: { dev: false, hmr: false },
		runtimeModules: { 'octane/signals': Signals },
		mode: 'server',
	});
	expect(await text(await renderToReadableStream(page.App, undefined))).toContain('module');

	let resolve!: (value: string) => void;
	const load = vi.fn(() => new Promise<string>((accept) => (resolve = accept)));
	const value$ = __queryAt('g:pending-snapshot-seed', () => 'conversation', load, {
		key: 'pending-snapshot-seed',
	});
	const options = {
		id: '/src/pending-snapshot.tsrx',
		compileOptions: { dev: false, hmr: false },
		runtimeModules: { './state': { value$ } },
	};
	const server = loadCompiledFixtureSource(PENDING_SNAPSHOT, { ...options, mode: 'server' });
	const client = loadCompiledFixtureSource(PENDING_SNAPSHOT, { ...options, mode: 'client' });
	const streamed = { buildId: 'build:pending-snapshot', documentId: 'document:pending-snapshot' };
	const output = text(
		await renderToReadableStream(server.App, undefined, { streamedSignals: streamed }),
	);
	resolve('server result');
	const html = await output;
	expect(html).toContain('<p>pending</p>');
	expect(html).not.toContain('data-octane-native-signals');
	expect(load).toHaveBeenCalledTimes(1);

	// The client hydrates the pending state the server rendered, then takes the
	// stream's result without fetching it.
	enableSignalBindings();
	const stream = streamedFrames(html);
	const hydration = bootstrapStreamedSignalResults({ ...streamed, target: stream.target });
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const paragraph = container.querySelector('p')!;
	const errors: unknown[] = [];
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		await act(() => {
			root = hydrateRoot(
				container,
				client.App,
				{},
				{
					signalOwner: hydration.signalOwner,
					onRecoverableError: (error) => errors.push(error),
					onUncaughtError: (error) => errors.push(error),
				},
			);
		});
		expect(container.querySelector('p')).toBe(paragraph);
		expect(paragraph.textContent).toBe('pending');
		await act(() => stream.deliver());
		expect(container.querySelector('p')).toBe(paragraph);
		expect(paragraph.textContent).toBe('ready');
		expect(load).toHaveBeenCalledTimes(1);
	} finally {
		root?.unmount();
		hydration.dispose();
		container.remove();
	}
	expect(errors).toEqual([]);
});
