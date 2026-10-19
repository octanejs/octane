import { expect, it } from 'vitest';
import { captureActionContext, startTransition } from 'octane/server';

it('runs server Action continuations inline without a client scheduler or lifetime', async () => {
	const outside = captureActionContext();
	expect(outside.run(() => 42)).toBe(42);
	const error = new Error('server callback failed');
	expect(() =>
		outside.run(() => {
			throw error;
		}),
	).toThrow(error);
	let result: number | undefined;
	startTransition(async () => {
		const context = captureActionContext();
		await Promise.resolve();
		result = context.run(() => 7);
	});
	await Promise.resolve();
	expect(result).toBe(7);
});
