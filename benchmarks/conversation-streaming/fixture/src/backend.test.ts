import { describe, expect, it, vi } from 'vitest';
import {
	authorizeRequest,
	conversation,
	history,
	releaseAuthorization,
	traceResponse,
} from './backend.ts';

let sequence = 0;

async function openStreams(holdWaves = true) {
	const run = `wave-gate-${++sequence}`;
	const requestController = new AbortController();
	const request = new Request(`http://localhost/?run=${run}&holdWaves=${holdWaves}`, {
		signal: requestController.signal,
		headers: {
			'x-conversation-bench': JSON.stringify({ run, scenario: 'rich-waves', latency: 'none' }),
		},
	});
	const viewer = await authorizeRequest(request);
	const bodyController = new AbortController();
	const historyController = new AbortController();
	const body = conversation({ request, signal: bodyController.signal, viewer });
	const historyStream = history({ request, signal: historyController.signal, viewer });
	const first = await Promise.all([body.next(), historyStream.next()]);
	expect(first.map((frame) => frame.value?.revision)).toEqual([1, 1]);
	const context = (phase: string) =>
		({
			request: new Request(`http://localhost/${phase}?run=${run}&phase=waves`, { method: 'POST' }),
		}) as Parameters<typeof releaseAuthorization>[0];
	return { requestController, bodyController, historyController, body, historyStream, context };
}

describe('rich streaming fixture wave gate', () => {
	it.each(['body', 'history'] as const)(
		'cancels only the %s stream while both are held',
		async (canceled) => {
			const fixture = await openStreams();
			const bodyNext = fixture.body.next();
			const historyNext = fixture.historyStream.next();
			const canceledNext = canceled === 'body' ? bodyNext : historyNext;
			const retainedNext = canceled === 'body' ? historyNext : bodyNext;
			let retainedSettled = false;
			retainedNext.then(
				() => (retainedSettled = true),
				() => (retainedSettled = true),
			);
			const cancellation = new Error(`${canceled} canceled`);
			const failure = expect(canceledNext).rejects.toBe(cancellation);
			(canceled === 'body' ? fixture.bodyController : fixture.historyController).abort(
				cancellation,
			);
			await failure;
			expect(retainedSettled).toBe(false);
			const released = await releaseAuthorization(fixture.context('release')).json();
			expect(released.released).toBe(1);
			expect((await retainedNext).value?.revision).toBe(2);
			await Promise.all([fixture.body.return(undefined), fixture.historyStream.return(undefined)]);
			fixture.requestController.abort();
		},
	);

	it('ends both waits and releases the gate when the request ends', async () => {
		const fixture = await openStreams();
		const bodyNext = fixture.body.next();
		const historyNext = fixture.historyStream.next();
		const cancellation = new Error('request ended');
		const failures = [
			expect(bodyNext).rejects.toBe(cancellation),
			expect(historyNext).rejects.toBe(cancellation),
		];
		await Promise.resolve();
		fixture.requestController.abort(cancellation);
		await Promise.all(failures);
		expect((await releaseAuthorization(fixture.context('release')).json()).released).toBe(0);
	});

	it('ends both waits and releases the gate on timeout', async () => {
		vi.useFakeTimers();
		try {
			const fixture = await openStreams();
			const bodyNext = fixture.body.next();
			const historyNext = fixture.historyStream.next();
			const failures = [
				expect(bodyNext).rejects.toThrow('Fixture wave hold expired'),
				expect(historyNext).rejects.toThrow('Fixture wave hold expired'),
			];
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(30_000);
			await Promise.all(failures);
			expect((await releaseAuthorization(fixture.context('release')).json()).released).toBe(0);
			fixture.requestController.abort();
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not hold ordinary streams', async () => {
		const fixture = await openStreams(false);
		const rest = await Promise.all([
			(async () => {
				const revisions = [];
				for await (const value of fixture.body) revisions.push(value.revision);
				return revisions;
			})(),
			(async () => {
				const revisions = [];
				for await (const value of fixture.historyStream) revisions.push(value.revision);
				return revisions;
			})(),
		]);
		expect(rest).toEqual([
			[2, 3, 4],
			[2, 3, 4],
		]);
		expect((await releaseAuthorization(fixture.context('release')).json()).released).toBe(0);
		const trace = await traceResponse(fixture.context('trace')).json();
		expect(
			trace.requests[0].events.some((event: { event: string }) => event.event === 'waves:held'),
		).toBe(false);
		fixture.requestController.abort();
	});
});
