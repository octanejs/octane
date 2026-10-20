import { afterEach, describe, expect, it } from 'vitest';
import { act, mount, type MountResult } from '../_helpers.js';
import {
	SeparateBoundaries,
	SharedBoundary,
	type TextCache,
} from './_fixtures/parallel-transitions.tsrx';

// Ports of React 19.3's parallel transitions (facebook/react#35392, enabled by
// #37290). Each startTransition outside an event or async Action gets its own
// lane; a lane renders and commits on its own, so a suspended transition no
// longer holds an unrelated one. Updates to the same queue stay entangled.

function createCache() {
	const entries = new Map<string, { promise: Promise<string>; resolve(): void }>();
	const entry = (key: string) => {
		let found = entries.get(key);
		if (found === undefined) {
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => (resolve = done));
			found = { promise, resolve: () => resolve(key) };
			entries.set(key, found);
		}
		return found;
	};
	const cache: TextCache = { read: (key) => entry(key).promise };
	return { cache, resolve: (key: string) => act(() => entry(key).resolve()) };
}

/** `pending|optimistic|text` for counter `name`. */
function counter(r: MountResult, name: string): string {
	const root = r.find(`.${name}`);
	return [
		root.querySelector('.pending')!.textContent,
		root.querySelector('.optimistic')!.textContent,
		root.querySelector('.text')!.textContent,
	].join('|');
}

// A failed assertion must not leave a held transition behind for the next test.
const mounted: MountResult[] = [];
afterEach(() => {
	for (const r of mounted.splice(0)) r.unmount();
});

async function mountCounters(App: typeof SeparateBoundaries) {
	const { cache, resolve } = createCache();
	const r = mount(App, { cache });
	mounted.push(r);
	await resolve('a: 0');
	await resolve('b: 0');
	expect(counter(r, 'a')).toBe('idle|0|a: 0');
	expect(counter(r, 'b')).toBe('idle|0|b: 0');
	return { r, resolve };
}

describe('parallel transitions', () => {
	it('commits a single suspended transition once its data resolves (control)', async () => {
		const { r, resolve } = await mountCounters(SeparateBoundaries);
		await act(() => r.click('.a .go'));
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');
		await resolve('a: 1');
		expect(counter(r, 'a')).toBe('idle|1|a: 1');
	});

	// ReactTransition-test.js "when multiple transitions update different
	// queues, they entangle" (19.3 asserts independence despite the name).
	it.each([
		['separate boundaries', SeparateBoundaries],
		['one shared boundary', SharedBoundary],
	] as const)('commits an unrelated transition while another is suspended (%s)', async (_, App) => {
		const { r, resolve } = await mountCounters(App);
		await act(() => r.click('.a .go'));
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');
		await act(() => r.click('.b .go'));
		expect(counter(r, 'b')).toBe('pending|saving|b: 0');

		// B's data arrives first: B commits on its own while A stays held.
		await resolve('b: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');

		await resolve('a: 1');
		expect(counter(r, 'a')).toBe('idle|1|a: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
	});

	it('keeps a second transition on the same queue entangled with the first', async () => {
		const { r, resolve } = await mountCounters(SeparateBoundaries);
		await act(() => r.click('.a .go'));
		await act(() => r.click('.a .go'));
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');

		// Only the latest state renders, so the first transition's data is never needed.
		await resolve('a: 2');
		expect(counter(r, 'a')).toBe('idle|2|a: 2');
	});

	it('does not wait for a suspended transition that resolves after a later one', async () => {
		const { r, resolve } = await mountCounters(SeparateBoundaries);
		await act(() => r.click('.a .go'));
		await act(() => r.click('.b .go'));

		// A's data arrives first: A commits while B stays held.
		await resolve('a: 1');
		expect(counter(r, 'a')).toBe('idle|1|a: 1');
		expect(counter(r, 'b')).toBe('pending|saving|b: 0');

		await resolve('b: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
	});
});
