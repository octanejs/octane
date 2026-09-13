import { expect, it } from 'vitest';
import {
	createResource,
	createScope,
	query,
	runWithSignalOwner,
	type SignalRendererOwnerIdentity,
} from 'octane/signals';
import {
	runWithServerSignalQueryAttemptObserver,
	type ServerSignalQueryAttempt,
} from '../src/signals/query-attempt-observer.js';
import { createServerSignalQueryAttemptObservations } from '../src/server/signal-query-observation.js';
import { controlledStream, drainProducers } from './_fixtures/signals-async-controls';

it('mirrors each current server stream attempt once and fences a retry', async () => {
	const documentOwner = createScope({ scopeKey: 'document:query-attempt-observer' });
	const rendererOwner: SignalRendererOwnerIdentity = {
		scopeKey: 'renderer:query-attempt-observer',
		documentOwner,
		instanceOwner: {},
		instanceKey: 'todos:main',
	};
	const streams = [controlledStream<string>(), controlledStream<string>()];
	let started = 0;
	const load = query(
		'observed-stream-query',
		(_selection: string) => streams[started++]!.iterable,
		{
			kind: 'stream',
		},
	);
	const observed: ServerSignalQueryAttempt[] = [];
	const runObserved = <T>(callback: () => T): T =>
		runWithServerSignalQueryAttemptObserver(
			rendererOwner,
			(attempt) => observed.push(attempt),
			createServerSignalQueryAttemptObservations,
			() => runWithSignalOwner(rendererOwner, callback),
		);

	const value$ = runObserved(() =>
		createResource(documentOwner, 'g:observed-stream', () => load('selected')),
	);
	runObserved(() => value$.snapshot());
	expect(observed).toHaveLength(1);
	expect(observed[0]).toMatchObject({
		ownerKey: documentOwner.scopeKey,
		instanceKey: rendererOwner.instanceKey,
		nodeKey: 'g:observed-stream',
		selectionKey: JSON.stringify(['observed-stream-query', ['string', 'selected']]),
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

	// A second rendered reader joins the existing producer, with independent
	// transport backpressure and a release that must not cancel the first reader.
	const joined$ = runObserved(() =>
		createResource(documentOwner, 'g:joined-stream', () => load('selected')),
	);
	expect(runObserved(() => joined$.get())).toBe('first');
	expect(started).toBe(1);
	expect(observed).toHaveLength(2);
	const joinedMirror = (observed[1]!.result as AsyncIterable<string>)[Symbol.asyncIterator]();
	const joinedValue = joinedMirror.next();
	const sharedValue = firstMirror.next();
	streams[0]!.emit('shared');
	await expect(joinedValue).resolves.toEqual({ done: false, value: 'shared' });
	await expect(sharedValue).resolves.toEqual({ done: false, value: 'shared' });

	const obsoleteRead = firstMirror.next();
	await drainProducers();
	expect(streams[0]!.nextCalls).toBe(2);
	await joinedMirror.return?.();
	await drainProducers();
	expect(streams[0]!.nextCalls).toBe(3);
	expect(streams[0]!.cancellations).toBe(0);
	expect(observed[0]!.isCurrent()).toBe(true);
	expect(observed[1]!.signal.aborted).toBe(true);
	expect(observed[1]!.isCurrent()).toBe(false);

	runObserved(() => value$.retry());
	await expect(obsoleteRead).rejects.toMatchObject({ name: 'AbortError' });
	expect(observed).toHaveLength(3);
	expect(observed.map(({ attempt }) => attempt)).toEqual([1, 1, 2]);
	expect(observed[0]!.signal.aborted).toBe(true);
	expect(observed[0]!.isCurrent()).toBe(false);
	expect(observed[2]!.isCurrent()).toBe(true);
	expect(streams[0]!.cancellations).toBe(1);

	const secondMirror = (observed[2]!.result as AsyncIterable<string>)[Symbol.asyncIterator]();
	const secondValue = secondMirror.next();
	streams[1]!.emit('second');
	await expect(secondValue).resolves.toEqual({ done: false, value: 'second' });
	const complete = secondMirror.next();
	streams[1]!.end();
	await expect(complete).resolves.toEqual({ done: true, value: undefined });
	observed[2]!.release();
	documentOwner.dispose();
});
