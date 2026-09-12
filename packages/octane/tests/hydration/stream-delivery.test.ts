import { describe, expect, it, vi } from 'vitest';
import {
	installStreamedRendererGlobal,
	readStreamedRendererResponse,
	type StreamedRendererGlobal,
} from '../../src/hydration/stream-delivery.js';
import {
	createStreamedRegionReceiver,
	StreamedReceiverError,
} from '../../src/hydration/stream-receiver.js';
import { initializeHydrationEventCapture } from '../../src/hydration/event-capture.js';
import {
	__queryAt,
	attachStreamedSignalResult,
	retireSignalOwnerIdentity,
	runWithSignalOwner,
} from '../../src/signals/index.js';
import { renderToReadableStream } from '../../src/runtime.server.js';
import {
	createStreamedRendererFrameStream,
	createStreamedSignalInjection,
	createStreamedSignalResultFrames,
} from '../../src/server/streamed-signals.js';
import type {
	StreamedRendererFrame,
	StreamFrameIdentity,
	StreamedRegionPlacementFrame,
} from '../../src/streamed-signals-protocol.js';

function setup(value: unknown = 'server') {
	const documentOwner = { scopeKey: 'document:stream-delivery' };
	const rendererOwner = {
		scopeKey: 'renderer:stream-delivery',
		documentOwner,
		instanceOwner: {},
		instanceKey: 'todos.main',
	};
	const identity: StreamFrameIdentity = {
		protocol: 1,
		buildId: 'test-build',
		documentId: 'test-document',
		ownerKey: documentOwner.scopeKey,
		instanceKey: rendererOwner.instanceKey,
		nodeKey: 'g:stream-delivery',
		selectionKey: JSON.stringify(['g:stream-delivery', ['string', 'one']]),
		selectionGeneration: 1,
		attempt: 1,
	};
	const receiver = createStreamedRegionReceiver({
		buildId: identity.buildId,
		documentId: identity.documentId,
		ownerKey: identity.ownerKey,
	});
	receiver.registerSelection(identity);
	const detach = attachStreamedSignalResult(receiver, rendererOwner, identity);
	const stream = createStreamedRendererFrameStream(
		createStreamedSignalResultFrames(identity, value),
	);
	return { documentOwner, rendererOwner, identity, receiver, detach, stream };
}

function independentRegions() {
	const receiver = createStreamedRegionReceiver({
		buildId: 'build',
		documentId: 'document',
		ownerKey: 'owner',
	});
	let release!: () => void;
	const styles = new Promise<void>((resolve) => {
		release = resolve;
	});
	const regions = ['A', 'B'].map((name) => {
		const identity: StreamFrameIdentity = {
			protocol: 1,
			buildId: 'build',
			documentId: 'document',
			ownerKey: 'owner',
			instanceKey: name,
			nodeKey: 'messages',
			selectionKey: name,
			selectionGeneration: 0,
			attempt: 0,
		};
		const host = document.createElement('section');
		host.innerHTML = '<!--[--><p>initial</p><!--]-->';
		document.body.append(host);
		receiver.registerSelection(identity);
		receiver.registerRegion({
			identity,
			start: host.firstChild as Comment,
			end: host.lastChild as Comment,
			contentRevision: 0,
			isActive: () => false,
			loadStyles: () => (name === 'A' ? styles : undefined),
			adoptHistoricalFrame: () => ({ release() {} }),
		});
		return { identity, host };
	});
	function frame(index: number, text: string, sequence = 0): StreamedRegionPlacementFrame {
		return {
			identity: regions[index]!.identity,
			sequence,
			channel: 'placement',
			kind: 'html',
			contentRevision: sequence + 1,
			mode: 'full',
			html: '<!--[--><p>' + text + '</p><!--]-->',
			historicalFrame: { version: 1, scopeKey: 'owner', entries: [] },
			styles: ['fixture.css'],
		};
	}
	return {
		receiver,
		regions,
		frame,
		release,
		dispose() {
			release();
			receiver.dispose();
			for (const { host } of regions) host.remove();
		},
	};
}

describe('streamed renderer delivery', () => {
	it.each(['global', 'response'] as const)(
		'delivers an independent sibling while %s placement waits for styles',
		async (mode) => {
			const state = independentRegions();
			const frames = [
				state.frame(0, 'A ready'),
				state.frame(1, 'B first'),
				state.frame(1, 'B ready', 1),
			];
			const realm: Record<string, unknown> = {};
			let uninstall: (() => void) | undefined;
			let reading: Promise<void> | undefined;
			try {
				if (mode === 'global') {
					uninstall = installStreamedRendererGlobal(state.receiver, realm);
					for (const frame of frames)
						(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive(frame);
				} else {
					reading = readStreamedRendererResponse(
						new Response(frames.map((frame) => JSON.stringify(frame) + '\n').join('')),
						state.receiver,
					);
				}
				await vi.waitFor(() => expect(state.regions[1]!.host.textContent).toBe('B ready'), {
					timeout: 150,
				});
				expect(state.regions[0]!.host.textContent).toBe('initial');
				state.release();
				await reading;
				await vi.waitFor(() => expect(state.regions[0]!.host.textContent).toBe('A ready'));
			} finally {
				state.release();
				await reading?.catch(() => {});
				uninstall?.();
				state.dispose();
			}
		},
	);

	it('settles a result consumer when its transport ends without a terminal', async () => {
		const state = setup();
		const open: StreamedRendererFrame = {
			identity: state.identity,
			sequence: 0,
			channel: 'result',
			kind: 'open',
			resource: 'promise',
		};
		try {
			await expect(
				readStreamedRendererResponse(new Response(JSON.stringify(open) + '\n'), state.receiver),
			).rejects.toThrow(/terminal/);
			const value$ = __queryAt(
				'g:stream-delivery',
				() => 'one',
				() => Promise.resolve('duplicate browser work'),
			);
			expect(() => runWithSignalOwner(state.rendererOwner, () => value$.get())).toThrow(/terminal/);
		} finally {
			state.detach();
			state.receiver.dispose();
			retireSignalOwnerIdentity(state.documentOwner);
		}
	});

	it('connects the server producer through the progressive reader to pre-code signal adoption', async () => {
		const state = setup();
		await readStreamedRendererResponse(new Response(state.stream), state.receiver);
		let browserStarts = 0;
		const value$ = __queryAt(
			'g:stream-delivery',
			() => 'one',
			() => {
				browserStarts++;
				return Promise.resolve('browser');
			},
		);

		expect(browserStarts).toBe(0);
		expect(runWithSignalOwner(state.rendererOwner, () => value$.get())).toBe('server');
		state.detach();
		state.receiver.dispose();
		retireSignalOwnerIdentity(state.documentOwner);
	});

	it('installs the initial pre-module global without replacing another document receiver', () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build',
			documentId: 'document',
			ownerKey: 'owner',
		});
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(receiver, realm);
		expect(() => installStreamedRendererGlobal(receiver, realm)).toThrow(/already installed/);
		uninstall();
		expect(realm).not.toHaveProperty('__octaneStreamedRenderer');
		receiver.dispose();
	});

	it('upgrades and drains the bounded pre-module mailbox in frame order', async () => {
		const state = independentRegions();
		const realm: Record<string, unknown> = {
			__octaneStreamedRenderer: {
				version: 1,
				frames: [state.frame(0, 'first'), state.frame(0, 'second', 1)],
				receive() {},
			},
		};
		const uninstall = installStreamedRendererGlobal(state.receiver, realm);
		try {
			await Promise.resolve();
			expect(state.regions[0]!.host.textContent).toBe('initial');
			(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive(
				state.frame(0, 'third', 2),
			);
			state.release();
			await vi.waitFor(() => expect(state.regions[0]!.host.textContent).toBe('third'));
		} finally {
			uninstall();
			state.dispose();
		}
	});

	it('delivers a result independently of its own style-blocked placement', async () => {
		const state = independentRegions();
		const accepted: string[] = [];
		state.receiver.attachResult(state.regions[0]!.identity, {
			accept(frame) {
				accepted.push(frame.kind);
			},
			fail(error) {
				throw error;
			},
		});
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(state.receiver, realm);
		try {
			const entrypoint = realm.__octaneStreamedRenderer as StreamedRendererGlobal;
			entrypoint.receive(state.frame(0, 'placed'));
			for await (const frame of createStreamedSignalResultFrames(
				state.regions[0]!.identity,
				'ready',
			))
				entrypoint.receive(frame);
			await vi.waitFor(() => expect(accepted).toEqual(['open', 'value', 'complete']));
			expect(state.regions[0]!.host.textContent).toBe('initial');
			state.release();
			await vi.waitFor(() => expect(state.regions[0]!.host.textContent).toBe('placed'));
		} finally {
			uninstall();
			state.dispose();
		}
	});

	it('applies response backpressure at the pending window without dropping frames', async () => {
		const state = independentRegions();
		let pulls = 0;
		const frames = [
			state.frame(0, 'A ready'),
			state.frame(1, 'B first'),
			state.frame(1, 'B ready', 1),
		];
		const response = new Response(
			new ReadableStream<Uint8Array>(
				{
					pull(controller) {
						if (pulls === frames.length) {
							controller.close();
							return;
						}
						controller.enqueue(new TextEncoder().encode(JSON.stringify(frames[pulls++]) + '\n'));
					},
				},
				{ highWaterMark: 0 },
			),
		);
		const reading = readStreamedRendererResponse(response, state.receiver, { maxPendingFrames: 1 });
		try {
			await vi.waitFor(() => expect(pulls).toBe(2));
			expect(state.regions[1]!.host.textContent).toBe('initial');
			state.release();
			await reading;
			expect(state.regions.map(({ host }) => host.textContent)).toEqual(['A ready', 'B ready']);
		} finally {
			state.release();
			await reading.catch(() => {});
			state.dispose();
		}
	});

	it('fails only the overflowing inline selection while its accepted sibling can finish', async () => {
		const state = independentRegions();
		const failed: StreamedReceiverError[] = [];
		state.receiver.attachResult(state.regions[1]!.identity, {
			accept() {},
			fail(error) {
				failed.push(error);
			},
		});
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(state.receiver, realm, { maxPendingFrames: 1 });
		try {
			const entrypoint = realm.__octaneStreamedRenderer as StreamedRendererGlobal;
			entrypoint.receive(state.frame(0, 'A ready'));
			entrypoint.receive(state.frame(1, 'overflow'));
			expect(failed).toMatchObject([{ code: 'overflow' }]);
			state.release();
			await vi.waitFor(() => expect(state.regions[0]!.host.textContent).toBe('A ready'));
			expect(state.regions[1]!.host.textContent).toBe('initial');
		} finally {
			uninstall();
			state.dispose();
		}
	});

	it.each(['abort', 'timeout'] as const)(
		'settles %s without waiting for styles or a stalled transport cancellation',
		async (ending) => {
			const state = independentRegions();
			const controller = new AbortController();
			const response = new Response(
				new ReadableStream<Uint8Array>({
					start(stream) {
						stream.enqueue(new TextEncoder().encode(JSON.stringify(state.frame(0, 'late')) + '\n'));
					},
					cancel() {
						return new Promise(() => {});
					},
				}),
			);
			const reading = readStreamedRendererResponse(response, state.receiver, {
				signal: controller.signal,
				timeoutMs: ending === 'timeout' ? 20 : 1000,
			});
			const outcome = reading.catch((error: unknown) => error);
			try {
				if (ending === 'abort') controller.abort();
				await expect(outcome).resolves.toMatchObject({
					code: ending === 'abort' ? 'terminal' : 'timeout',
				});
				state.release();
				await new Promise((resolve) => setTimeout(resolve, 0));
				expect(state.regions[0]!.host.textContent).toBe('initial');
			} finally {
				controller.abort();
				state.dispose();
			}
		},
	);

	it('expires an accepted inline result even after its frame delivery has settled', async () => {
		const state = independentRegions();
		const failures: StreamedReceiverError[] = [];
		state.receiver.attachResult(state.regions[0]!.identity, {
			accept() {},
			fail(error) {
				failures.push(error);
			},
		});
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(state.receiver, realm, { timeoutMs: 20 });
		try {
			(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive({
				identity: state.regions[0]!.identity,
				sequence: 0,
				channel: 'result',
				kind: 'open',
				resource: 'promise',
			});
			await vi.waitFor(() => expect(failures).toMatchObject([{ code: 'timeout' }]), {
				timeout: 150,
			});
		} finally {
			uninstall();
			state.dispose();
		}
	});

	it('bounds unfinished inline results independently of already drained frame work', async () => {
		const state = independentRegions();
		const accepted = [[], []] as string[][];
		const failures = [[], []] as StreamedReceiverError[][];
		for (const [index, { identity }] of state.regions.entries())
			state.receiver.attachResult(identity, {
				accept(frame) {
					accepted[index]!.push(frame.kind);
				},
				fail(error) {
					failures[index]!.push(error);
				},
			});
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(state.receiver, realm, { maxPendingFrames: 1 });
		try {
			const entrypoint = realm.__octaneStreamedRenderer as StreamedRendererGlobal;
			entrypoint.receive({
				identity: state.regions[0]!.identity,
				sequence: 0,
				channel: 'result',
				kind: 'open',
				resource: 'promise',
			});
			await vi.waitFor(() => expect(accepted[0]).toEqual(['open']));
			entrypoint.receive({
				identity: state.regions[1]!.identity,
				sequence: 0,
				channel: 'result',
				kind: 'open',
				resource: 'promise',
			});
			await vi.waitFor(() => expect(failures[1]).toMatchObject([{ code: 'overflow' }]), {
				timeout: 150,
			});
			expect(failures[0]).toEqual([]);
			entrypoint.receive({
				identity: state.regions[0]!.identity,
				sequence: 1,
				channel: 'result',
				kind: 'value',
				value: ['string', 'ready'],
			});
			await vi.waitFor(() => expect(accepted[0]).toEqual(['open', 'value']));
			entrypoint.receive({
				identity: state.regions[0]!.identity,
				sequence: 2,
				channel: 'result',
				kind: 'complete',
			});
			await vi.waitFor(() => expect(accepted[0]).toEqual(['open', 'value', 'complete']));
			uninstall();
			expect(failures[0]).toEqual([]);
		} finally {
			uninstall();
			state.dispose();
		}
	});

	it.each(['uninstall', 'dispose'] as const)(
		'settles an accepted unfinished result on %s after its delivery queue empties',
		async (ending) => {
			const state = independentRegions();
			const accepted: string[] = [];
			const failures: StreamedReceiverError[] = [];
			state.receiver.attachResult(state.regions[0]!.identity, {
				accept(frame) {
					accepted.push(frame.kind);
				},
				fail(error) {
					failures.push(error);
				},
			});
			const realm: Record<string, unknown> = {};
			const uninstall = installStreamedRendererGlobal(state.receiver, realm);
			try {
				(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive({
					identity: state.regions[0]!.identity,
					sequence: 0,
					channel: 'result',
					kind: 'open',
					resource: 'promise',
				});
				await vi.waitFor(() => expect(accepted).toEqual(['open']));
				if (ending === 'uninstall') uninstall();
				else state.receiver.dispose();
				expect(failures).toMatchObject([{ code: 'terminal' }]);
				uninstall();
				state.receiver.dispose();
				expect(failures).toHaveLength(1);
			} finally {
				uninstall();
				state.dispose();
			}
		},
	);

	it.each(['uninstall', 'timeout'] as const)(
		'keeps composition-deferred HTML within the %s lifecycle',
		async (ending) => {
			const state = independentRegions();
			state.release();
			const input = document.createElement('input');
			input.setAttribute('data-octane-input', 'draft');
			state.regions[0]!.host.insertBefore(input, state.regions[0]!.host.lastChild);
			initializeHydrationEventCapture(document);
			const failures: StreamedReceiverError[] = [];
			state.receiver.attachResult(state.regions[0]!.identity, {
				accept() {},
				fail(error) {
					failures.push(error);
				},
			});
			const realm: Record<string, unknown> = {};
			const uninstall = installStreamedRendererGlobal(state.receiver, realm, {
				timeoutMs: ending === 'timeout' ? 20 : 1000,
			});
			try {
				input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
				(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive(state.frame(0, 'late'));
				await new Promise((resolve) => setTimeout(resolve, 0));
				expect(state.regions[0]!.host.textContent).toBe('initial');
				if (ending === 'uninstall') uninstall();
				else await vi.waitFor(() => expect(failures).toMatchObject([{ code: 'timeout' }]));
				input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
				await new Promise((resolve) => setTimeout(resolve, 0));
				expect(state.regions[0]!.host.textContent).toBe('initial');
			} finally {
				uninstall();
				state.dispose();
			}
		},
	);

	it('fences pending inline placements when their entrypoint is removed', async () => {
		const state = independentRegions();
		const realm: Record<string, unknown> = {};
		const uninstall = installStreamedRendererGlobal(state.receiver, realm);
		try {
			(realm.__octaneStreamedRenderer as StreamedRendererGlobal).receive(state.frame(0, 'late'));
			await Promise.resolve();
			uninstall();
			state.release();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(state.regions[0]!.host.textContent).toBe('initial');
		} finally {
			uninstall();
			state.dispose();
		}
	});

	it('does not pull the next server frame until the transport requests it', async () => {
		const selected: StreamFrameIdentity = {
			protocol: 1,
			buildId: 'build',
			documentId: 'document',
			ownerKey: 'owner',
			instanceKey: 'instance',
			nodeKey: 'g:node',
			selectionKey: 'selection',
			selectionGeneration: 0,
			attempt: 0,
		};
		let pulls = 0;
		async function* frames(): AsyncGenerator<StreamedRendererFrame> {
			pulls++;
			yield {
				identity: selected,
				sequence: 0,
				channel: 'result' as const,
				kind: 'open' as const,
				resource: 'promise' as const,
			};
			pulls++;
			yield {
				identity: selected,
				sequence: 1,
				channel: 'result' as const,
				kind: 'value' as const,
				value: ['string', 'ready'],
			};
		}
		const reader = createStreamedRendererFrameStream(frames()).getReader();
		expect(pulls).toBe(0);
		await reader.read();
		expect(pulls).toBe(1);
		await reader.cancel();
	});

	it('supports an explicitly budgeted result larger than one MiB', async () => {
		const large = 'x'.repeat(1024 * 1024 + 4096);
		const state = setup(large);
		await readStreamedRendererResponse(new Response(state.stream), state.receiver, {
			maxFrameBytes: 2 * 1024 * 1024,
		});
		const value$ = __queryAt(
			'g:stream-delivery',
			() => 'one',
			() => Promise.resolve('browser'),
		);
		expect(runWithSignalOwner(state.rendererOwner, () => value$.get())).toHaveLength(large.length);
		state.detach();
		state.receiver.dispose();
		retireSignalOwnerIdentity(state.documentOwner);
	});

	it('emits the bounded mailbox before a streamed result injection', async () => {
		const state = setup();
		const injection = createStreamedSignalInjection(state.identity, 'ready');
		const stream = await renderToReadableStream(() => '', {}, { injection });
		const html = await new Response(stream).text();
		expect(html.indexOf('version:1,frames:q')).toBeGreaterThanOrEqual(0);
		expect(html.indexOf('version:1,frames:q')).toBeLessThan(
			html.indexOf('globalThis.__octaneStreamedRenderer.receive'),
		);
		state.detach();
		state.receiver.dispose();
		retireSignalOwnerIdentity(state.documentOwner);
	});

	it('enforces serialized inline-frame budgets before publishing oversized data', async () => {
		const state = setup();
		const injection = createStreamedSignalInjection(state.identity, 'x'.repeat(10_000), {
			maxFrameBytes: 512,
			maxTotalBytes: 1024,
		});
		const unsubscribe = injection.subscribe(() => {
			injection.take();
			injection.accepted?.();
		});
		await expect(injection.done).rejects.toThrow(/byte budget/);
		unsubscribe();
		state.detach();
		state.receiver.dispose();
		retireSignalOwnerIdentity(state.documentOwner);
	});

	it('times out an injection whose server result never settles', async () => {
		const state = setup();
		const injection = createStreamedSignalInjection(state.identity, new Promise(() => {}), {
			timeoutMs: 5,
		});
		const unsubscribe = injection.subscribe(() => {
			injection.take();
			injection.accepted?.();
		});
		await expect(injection.done).rejects.toThrow(/timed out/);
		unsubscribe();
		state.detach();
		state.receiver.dispose();
		retireSignalOwnerIdentity(state.documentOwner);
	});
});
