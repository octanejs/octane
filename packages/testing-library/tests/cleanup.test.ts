/**
 * `cleanup()` conformance — ports of react-testing-library@be9d81d
 * src/__tests__/cleanup.js and auto-cleanup.js, re-authored for octane.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { Message } from './_fixtures/basic.tsrx';
import { EffectLogger } from './_fixtures/effects.tsrx';

describe('cleanup', () => {
	// Per react-testing-library src/__tests__/cleanup.js:4 ("cleans up the document")
	it('cleans up the document', () => {
		render(Message, { props: { text: 'to be removed' } });
		expect(document.body.innerHTML).not.toBe('');
		cleanup();
		expect(document.body.innerHTML).toBe('');
	});

	// Per cleanup.js:25 ("cleanup does not error when an element is not a child")
	it('does not error when a container was already detached', () => {
		render(Message, { props: { text: 'x' }, container: document.createElement('div') });
		expect(() => cleanup()).not.toThrow();
	});

	// Per cleanup.js:30 ("cleanup runs effect cleanup functions")
	it('runs effect cleanup functions', () => {
		const log = vi.fn();
		render(EffectLogger, { props: { log } });
		expect(log.mock.calls).toEqual([['mount']]);
		cleanup();
		expect(log.mock.calls).toEqual([['mount'], ['cleanup']]);
	});

	it('unmounts every root from multiple render calls, and is idempotent', () => {
		render(Message, { props: { text: 'one' } });
		render(Message, { props: { text: 'two' } });
		expect(document.body.children.length).toBe(2);
		cleanup();
		expect(document.body.innerHTML).toBe('');
		expect(() => cleanup()).not.toThrow();
	});
});

describe('auto-cleanup registration', () => {
	// Per auto-cleanup.js:7/11 — importing the DEFAULT entry registers cleanup
	// with a global afterEach when the test framework exposes one. This repo
	// runs vitest with `globals: false`, so the hook is stubbed onto globalThis
	// before a fresh copy of the entry module is imported.
	it('registers cleanup with a global afterEach when one exists', async () => {
		const registered: Array<() => void> = [];
		const g = globalThis as { afterEach?: (cb: () => void) => void };
		g.afterEach = (cb) => {
			registered.push(cb);
		};
		try {
			vi.resetModules();
			const fresh = (await import('@octanejs/testing-library')) as unknown as {
				render: typeof render;
			};
			expect(registered.length).toBe(1);
			fresh.render(Message, { props: { text: 'auto' } });
			expect(document.body.innerHTML).not.toBe('');
			registered[0]();
			expect(document.body.innerHTML).toBe('');
		} finally {
			delete g.afterEach;
			vi.resetModules();
		}
	});
});
