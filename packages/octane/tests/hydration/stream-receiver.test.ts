import { describe, expect, it, vi } from 'vitest';
import {
	createStreamedRegionReceiver,
	StreamedReceiverError,
	type HistoricalFrameLease,
	type StreamedResultConsumer,
} from '../../src/hydration/stream-receiver.js';
import type {
	StreamedRegionPlacementFrame,
	StreamedSignalResultFrame,
	StreamFrameIdentity,
} from '../../src/streamed-signals-protocol.js';

function identity(overrides: Partial<StreamFrameIdentity> = {}): StreamFrameIdentity {
	return {
		protocol: 1,
		buildId: 'build-1',
		documentId: 'document-1',
		ownerKey: 'account-1',
		instanceKey: 'conversation',
		nodeKey: 'messages',
		selectionKey: 'conversation-a',
		selectionGeneration: 0,
		attempt: 0,
		...overrides,
	};
}

function placement(
	frameIdentity: StreamFrameIdentity,
	overrides: Partial<StreamedRegionPlacementFrame> = {},
): StreamedRegionPlacementFrame {
	return {
		identity: frameIdentity,
		sequence: 0,
		channel: 'placement',
		kind: 'html',
		contentRevision: 11,
		mode: 'full',
		html: '<!--[--><p>revision 11</p><!--]-->',
		historicalFrame: { version: 1, scopeKey: 'account-1', entries: [] },
		styles: ['conversation.css'],
		...overrides,
	};
}

describe('streamed region receiver', () => {
	it('retains a transport failure until the result module attaches', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const selected = identity();
		receiver.registerSelection(selected);
		const blockedFailure = vi.fn();
		const detach = receiver.attachResult(selected, { accept: () => false, fail: blockedFailure });
		await receiver.receive({
			identity: selected,
			sequence: 0,
			channel: 'result',
			kind: 'open',
			resource: 'promise',
		});
		const error = new StreamedReceiverError('terminal', 'Transport ended before completion.');
		expect(receiver.failSelection(selected, error)).toBe(true);
		expect(receiver.failSelection(selected, error)).toBe(false);
		expect(blockedFailure).toHaveBeenCalledExactlyOnceWith(error);
		detach();
		const frames: string[] = [];
		const failures: StreamedReceiverError[] = [];
		receiver.attachResult(selected, {
			accept(frame) {
				frames.push(frame.kind);
			},
			fail(error) {
				failures.push(error);
			},
		});
		expect(frames).toEqual([]);
		expect(failures).toEqual([error]);
		receiver.dispose();
	});

	it('preserves a completed pre-code result when later HTML fails', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const selected = identity();
		receiver.registerSelection(selected);
		await receiver.receive({
			identity: selected,
			sequence: 0,
			channel: 'result',
			kind: 'open',
			resource: 'promise',
		});
		await receiver.receive({
			identity: selected,
			sequence: 1,
			channel: 'result',
			kind: 'value',
			value: ['string', 'ready'],
		});
		await receiver.receive({
			identity: selected,
			sequence: 2,
			channel: 'result',
			kind: 'complete',
		});
		receiver.failSelection(
			selected,
			new StreamedReceiverError('styles', 'The placement stylesheet failed.'),
		);
		const frames: StreamedSignalResultFrame[] = [];
		const failures: StreamedReceiverError[] = [];
		receiver.attachResult(selected, {
			accept(frame) {
				frames.push(frame);
			},
			fail(error) {
				failures.push(error);
			},
		});
		expect(frames.map((frame) => frame.kind)).toEqual(['open', 'value', 'complete']);
		expect(frames[1]).toMatchObject({ value: ['string', 'ready'] });
		expect(failures).toEqual([]);
		receiver.dispose();
	});

	it('does not fail a newer selection when an old transport is canceled', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const old = identity();
		const selected = identity({ selectionGeneration: 1 });
		receiver.registerSelection(old);
		receiver.registerSelection(selected);
		expect(
			receiver.failSelection(old, new StreamedReceiverError('terminal', 'Old response canceled.')),
		).toBe(false);
		await expect(
			receiver.receive({
				identity: selected,
				sequence: 0,
				channel: 'result',
				kind: 'open',
				resource: 'promise',
			}),
		).resolves.toBe('accepted');
		receiver.dispose();
	});

	it('does not treat a terminal rejected by the mailbox bound as successful completion', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
			maxPendingFrames: 2,
		});
		const selected = identity();
		receiver.registerSelection(selected);
		const blockedFailure = vi.fn();
		const detach = receiver.attachResult(selected, { accept: () => false, fail: blockedFailure });
		await receiver.receive({
			identity: selected,
			sequence: 0,
			channel: 'result',
			kind: 'open',
			resource: 'promise',
		});
		await receiver.receive({
			identity: selected,
			sequence: 1,
			channel: 'result',
			kind: 'value',
			value: ['string', 'ready'],
		});
		await expect(
			receiver.receive({ identity: selected, sequence: 2, channel: 'result', kind: 'complete' }),
		).rejects.toMatchObject({ code: 'overflow' });
		expect(blockedFailure).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ code: 'overflow' }),
		);
		detach();
		const frames: string[] = [];
		const failures: StreamedReceiverError[] = [];
		receiver.attachResult(selected, {
			accept(frame) {
				frames.push(frame.kind);
			},
			fail(error) {
				failures.push(error);
			},
		});
		expect(frames).toEqual([]);
		expect(failures).toMatchObject([{ code: 'overflow' }]);
		receiver.dispose();
	});

	it('buffers a result before code and rejects out-of-order frames', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const selected = identity();
		receiver.registerSelection(selected);
		await receiver.receive({
			identity: selected,
			sequence: 0,
			channel: 'result',
			kind: 'open',
			resource: 'promise',
		} satisfies StreamedSignalResultFrame);
		await receiver.receive({
			identity: selected,
			sequence: 1,
			channel: 'result',
			kind: 'value',
			value: ['string', 'ready'],
		} satisfies StreamedSignalResultFrame);

		const accepted: string[] = [];
		let ready = false;
		const consumer = {
			accept(frame) {
				if (!ready) return false as const;
				accepted.push(frame.kind);
			},
			fail(error) {
				throw error;
			},
		} satisfies StreamedResultConsumer;
		receiver.attachResult(selected, consumer);
		expect(accepted).toEqual([]);
		ready = true;
		receiver.attachResult(selected, consumer);
		expect(accepted).toEqual(['open', 'value']);
		await expect(
			receiver.receive({
				identity: selected,
				sequence: 3,
				channel: 'result',
				kind: 'complete',
			} satisfies StreamedSignalResultFrame),
		).rejects.toMatchObject({ code: 'sequence' });
	});

	it('fences stale A to B to A generations before DOM mutation', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const firstA = identity();
		const secondA = identity({ selectionGeneration: 2 });
		receiver.registerSelection(firstA, 10);
		receiver.registerSelection(
			identity({ selectionKey: 'conversation-b', selectionGeneration: 1 }),
		);
		receiver.registerSelection(secondA, 10);

		expect(await receiver.receive(placement(firstA))).toBe('stale');
	});

	it('loads styles and leases history before placing while preserving a typed node', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const selected = identity();
		receiver.registerSelection(selected, 10);
		const host = document.createElement('div');
		const start = document.createComment('[');
		const input = document.createElement('input');
		input.setAttribute('data-octane-input', 'draft');
		input.value = 'typed';
		const end = document.createComment(']');
		host.append(start, input, end);
		document.body.appendChild(host);
		const order: string[] = [];
		const release = vi.fn();
		receiver.registerRegion({
			identity: selected,
			start,
			end,
			contentRevision: 10,
			isActive: () => false,
			loadStyles: async () => {
				order.push('styles');
			},
			adoptHistoricalFrame: () => {
				order.push('history');
				return { release } satisfies HistoricalFrameLease;
			},
		});

		expect(
			await receiver.receive(
				placement(selected, {
					html: '<!--[--><section><input data-octane-input="draft"></section><!--]-->',
				}),
			),
		).toBe('accepted');
		expect(order).toEqual(['styles', 'history']);
		expect(host.querySelector('input')).toBe(input);
		expect(input.value).toBe('typed');
		expect(host.textContent).toBe('');
		expect(release).not.toHaveBeenCalled();
		receiver.dispose();
		expect(release).toHaveBeenCalledOnce();
		host.remove();
	});

	it('never lets server HTML take ownership from an active renderer', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const selected = identity();
		receiver.registerSelection(selected, 10);
		const host = document.createElement('div');
		const start = document.createComment('[');
		const text = document.createTextNode('client-owned');
		const end = document.createComment(']');
		host.append(start, text, end);
		const loadStyles = vi.fn();
		receiver.registerRegion({
			identity: selected,
			start,
			end,
			contentRevision: 10,
			isActive: () => true,
			loadStyles,
			adoptHistoricalFrame: () => ({ release() {} }),
		});

		expect(await receiver.receive(placement(selected))).toBe('stale');
		expect(host.textContent).toBe('client-owned');
		expect(loadStyles).not.toHaveBeenCalled();
	});

	it('requires an exact base revision and renderer delta implementation', async () => {
		const receiver = createStreamedRegionReceiver({
			buildId: 'build-1',
			documentId: 'document-1',
			ownerKey: 'account-1',
		});
		const selected = identity();
		receiver.registerSelection(selected, 10);
		const host = document.createElement('div');
		const start = document.createComment('[');
		const end = document.createComment(']');
		host.append(start, end);
		receiver.registerRegion({
			identity: selected,
			start,
			end,
			contentRevision: 10,
			isActive: () => false,
			loadStyles() {},
			adoptHistoricalFrame: () => ({ release() {} }),
		});

		expect(
			await receiver.receive(
				placement(selected, { mode: 'delta', baseRevision: 9, contentRevision: 11 }),
			),
		).toBe('stale');
		await expect(
			receiver.receive(
				placement(selected, {
					sequence: 1,
					mode: 'delta',
					baseRevision: 10,
					contentRevision: 11,
				}),
			),
		).rejects.toBeInstanceOf(StreamedReceiverError);
	});

	it.each(['superseded', 'disposed'] as const)(
		'does not commit a placement after style loading when the receiver is %s',
		async (ending) => {
			const receiver = createStreamedRegionReceiver({
				buildId: 'build-1',
				documentId: 'document-1',
				ownerKey: 'account-1',
			});
			const selected = identity();
			receiver.registerSelection(selected, 10);
			const host = document.createElement('div');
			const start = document.createComment('[');
			const text = document.createTextNode('revision 10');
			const end = document.createComment(']');
			host.append(start, text, end);
			let releaseStyles!: () => void;
			const styles = new Promise<void>((resolve) => {
				releaseStyles = resolve;
			});
			receiver.registerRegion({
				identity: selected,
				start,
				end,
				contentRevision: 10,
				isActive: () => false,
				loadStyles: () => styles,
				adoptHistoricalFrame: () => ({ release() {} }),
			});
			const pending = receiver.receive(placement(selected));
			await Promise.resolve();
			if (ending === 'disposed') receiver.dispose();
			else {
				receiver.registerSelection(
					identity({ selectionKey: 'conversation-b', selectionGeneration: 1 }),
					10,
				);
			}
			releaseStyles();

			expect(await pending).toBe('stale');
			expect(host.textContent).toBe('revision 10');
		},
	);
});
