import { expect, it } from 'vitest';
import {
	__queryAt,
	retireSignalOwnerIdentity,
	runWithSignalOwner,
	type SignalRendererOwnerIdentity,
} from 'octane/signals';
import {
	runWithServerSignalQueryAttemptObserver,
	type ServerSignalQueryAttempt,
} from '../src/signals/query-attempt-observer.js';
import { controlledStream, drainProducers } from './_fixtures/signals-async-controls';

it('mirrors each current server stream attempt once and fences a retry', async () => {
	const documentOwner = { scopeKey: 'document:query-attempt-observer' };
	const rendererOwner: SignalRendererOwnerIdentity = {
		scopeKey: 'renderer:query-attempt-observer',
		documentOwner,
		instanceOwner: {},
		instanceKey: 'todos:main',
	};
	const streams = [controlledStream<string>(), controlledStream<string>()];
	let started = 0;
	const value$ = __queryAt(
		'g:observed-stream',
		() => 'selected',
		() => streams[started++]!.iterable,
		{ kind: 'stream' },
	);
	const observed: ServerSignalQueryAttempt[] = [];
	const runObserved = <T>(callback: () => T): T =>
		runWithServerSignalQueryAttemptObserver(
			rendererOwner,
			(attempt) => observed.push(attempt),
			() => runWithSignalOwner(rendererOwner, callback),
		);

	runObserved(() => value$.snapshot());
	expect(observed).toHaveLength(1);
	expect(observed[0]).toMatchObject({
		ownerKey: documentOwner.scopeKey,
		instanceKey: rendererOwner.instanceKey,
		nodeKey: 'g:observed-stream',
		selectionKey: JSON.stringify(['g:observed-stream', ['string', 'selected']]),
		attempt: 1,
		kind: 'stream',
	});
	expect(observed[0]!.isCurrent()).toBe(true);

	const firstMirror = (observed[0]!.result as AsyncIterable<string>)[Symbol.asyncIterator]();
	const firstValue = firstMirror.next();
	streams[0]!.emit('first');
	await expect(firstValue).resolves.toEqual({ done: false, value: 'first' });
	await drainProducers();
	expect(streams[0]!.nextCalls).toBe(1);

	const obsoleteRead = firstMirror.next();
	runObserved(() => value$.refetch());
	await expect(obsoleteRead).rejects.toMatchObject({ name: 'AbortError' });
	expect(observed).toHaveLength(2);
	expect(observed.map(({ attempt }) => attempt)).toEqual([1, 2]);
	expect(observed[0]!.signal.aborted).toBe(true);
	expect(observed[0]!.isCurrent()).toBe(false);
	expect(observed[1]!.isCurrent()).toBe(true);
	expect(streams[0]!.cancellations).toBe(1);

	const secondMirror = (observed[1]!.result as AsyncIterable<string>)[Symbol.asyncIterator]();
	const secondValue = secondMirror.next();
	streams[1]!.emit('second');
	await expect(secondValue).resolves.toEqual({ done: false, value: 'second' });
	const complete = secondMirror.next();
	streams[1]!.end();
	await expect(complete).resolves.toEqual({ done: true, value: undefined });
	observed[1]!.release();
	retireSignalOwnerIdentity(documentOwner);
});
