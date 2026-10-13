import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prerender } from 'octane/static';
import { act, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as Client from './_fixtures/try-hole-reader.tsrx';

// A reader can reach use() before or after cloning its template. A server
// rejection now leaves a pending arm, and the client reads its own value.
// Catch-only boundaries cannot provide a server fallback.

const server = loadServerFixture('packages/octane/tests/hydration/_fixtures/try-hole-reader.tsrx');

const READERS = [
	['in a @try with @pending', 'CatchArm'],
	['whose root has the catch arm tag', 'SameRootArm'],
	['in setup (control)', 'SetupCatchArm'],
] as const;

let container: HTMLElement;
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	consoleError.mockRestore();
});

describe('hydrateRoot — use() in a template hole rejected on the server', () => {
	it.each(READERS)(
		'client-renders a reader %s and preserves the enclosing host',
		async (_, name) => {
			const serverError = vi.fn();
			container.innerHTML = (
				await prerender(
					server[name],
					{ label: 'private server', value: Promise.reject('server secret') },
					{ onError: serverError },
				)
			).html;
			const div = container.querySelector('div')!;
			const pending = container.querySelector('p')!;
			expect(pending.textContent).toBe('pending');
			expect(container.querySelector('em')).toBeNull();
			expect(container.innerHTML).not.toContain('server secret');
			expect(serverError).toHaveBeenCalledWith('server secret');
			const caught: unknown[] = [];
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				Client[name],
				{ label: 'client', value: Promise.resolve('ok') },
				{
					onCaughtError: (error) => caught.push(error),
					onRecoverableError: (error) => recovered.push(error),
				},
			);
			await act(async () => {});
			expect(container.querySelector('div')).toBe(div);
			expect(pending.isConnected).toBe(false);
			expect(container.textContent).toBe('ok');
			expect(caught).toEqual([]);
			expect(recovered).toHaveLength(1);
			root.unmount();
		},
	);

	it.each(READERS)(
		'uses the client rejection and label in the catch arm for a reader %s',
		async (_, name) => {
			container.innerHTML = (
				await prerender(
					server[name],
					{ label: 'server', value: Promise.reject('private server') },
					{ onError() {} },
				)
			).html;
			const div = container.querySelector('div');
			const clientRejection = Promise.reject('client error');
			clientRejection.catch(() => {});
			const caught: unknown[] = [];
			const root = hydrateRoot(
				container,
				Client[name],
				{ label: 'client', value: clientRejection },
				{
					onCaughtError: (error) => caught.push(error),
					onRecoverableError() {},
				},
			);
			await act(async () => {});
			expect(container.querySelector('div')).toBe(div);
			expect(container.querySelector('em')?.outerHTML).toBe('<em title="client">client</em>');
			expect(caught).toEqual(['client error']);
			root.unmount();
		},
	);

	it.each(['CatchOnly', 'Boundary'] as const)(
		'%s lets the server rejection fail the shell',
		async (name) => {
			await expect(
				prerender(server[name], { label: 'server', value: Promise.reject('shell failed') }),
			).rejects.toBe('shell failed');
		},
	);
});
