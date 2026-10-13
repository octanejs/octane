import { loadCompiledFixtureSource } from './_server-fixture.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prerender } from 'octane/static';
import { act, flushSync, hydrateRoot } from '../src/index.js';
import {
	NestedRejectionBoundary,
	OpaqueReasonBoundary,
	ReasonBoundary,
	RethrowingNestedRejectionBoundary,
	SeedCollision,
} from './_fixtures/ssr-suspense.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');
const server = loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
	id: 'ssr-suspense.tsrx',
	mode: 'server',
	compileOptions: { mode: 'server' },
});
const pending = <T>() => new Promise<T>(() => {});
let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => {
	container.remove();
	vi.restoreAllMocks();
});

describe('SSR failed boundaries use client data when they hydrate', () => {
	it.each([
		{ name: 'primitive', reason: 'server-private-reason' },
		{
			name: 'plain object',
			reason: { message: 'server-private-reason', code: 'SERVER_PRIVATE_CODE' },
		},
		{
			name: 'Error with custom fields',
			reason: Object.assign(new Error('server-private-reason'), { code: 'SERVER_PRIVATE_CODE' }),
		},
	])(
		'$name reaches server onError, while client success replaces only the pending boundary',
		async ({ reason }) => {
			const serverError = vi.fn();
			const onCatch = vi.fn();
			const { html } = await prerender(
				server.ReasonBoundary,
				{ promise: Promise.reject(reason), onCatch },
				{ onError: serverError },
			);
			expect(serverError).toHaveBeenCalledExactlyOnceWith(reason);
			expect(onCatch).not.toHaveBeenCalled();
			expect(html).not.toContain('server-private-reason');
			expect(html).not.toContain('SERVER_PRIVATE_CODE');
			container.innerHTML = html;
			const box = container.querySelector('#reason-box');
			const fallback = container.querySelector('.reason-loading')!;
			expect(fallback.textContent).toBe('loading');
			const recovered = vi.fn();
			const root = hydrateRoot(
				container,
				ReasonBoundary,
				{ promise: Promise.resolve('client success'), onCatch },
				{ onRecoverableError: recovered },
			);
			await act(async () => {});
			expect(container.querySelector('#reason-box')).toBe(box);
			expect(fallback.isConnected).toBe(false);
			expect(container.querySelector('.reason-ok')!.textContent).toBe('client success');
			expect(container.querySelector('.reason-error')).toBeNull();
			expect(onCatch).not.toHaveBeenCalled();
			expect(recovered).toHaveBeenCalledTimes(1);
			root.unmount();
		},
	);

	it('never snapshots an opaque or hostile error to produce fallback HTML', async () => {
		const accessed = vi.fn(() => {
			throw new Error('must not inspect error fields');
		});
		const reason: any = new Error('server-secret');
		reason.cycle = reason;
		Object.defineProperty(reason, 'private', { get: accessed, enumerable: true });
		const onError = vi.fn();
		const { html } = await prerender(
			server.OpaqueReasonBoundary,
			{ promise: Promise.reject(reason) },
			{ onError },
		);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBe(reason);
		expect(accessed).not.toHaveBeenCalled();
		expect(html).not.toContain('server-secret');
		container.innerHTML = html;
		const box = container.querySelector('#opaque-reason-box');
		const onCatch = vi.fn();
		const clientError = new Error('client error');
		const root = hydrateRoot(container, OpaqueReasonBoundary, {
			promise: Promise.reject(clientError),
			onCatch,
		});
		await act(async () => {});
		expect(container.querySelector('#opaque-reason-box')).toBe(box);
		expect(container.querySelector('.opaque-reason-loading')).toBeNull();
		expect(container.querySelector('.opaque-reason-error')!.textContent).toBe('caught');
		expect(onCatch).toHaveBeenCalledWith(clientError);
		root.unmount();
	});

	it.each([
		{
			name: 'catchless inner',
			Component: NestedRejectionBoundary,
			Server: server.NestedRejectionBoundary,
			selector: '.nested-error',
		},
		{
			name: 'rethrown inner',
			Component: RethrowingNestedRejectionBoundary,
			Server: server.RethrowingNestedRejectionBoundary,
			selector: '.nested-rethrow-error',
		},
	])(
		'$name routes a new client error to the ancestor catch',
		async ({ Component, Server, selector }) => {
			const onInnerCatch = vi.fn();
			const onOuterCatch = vi.fn();
			const onError = vi.fn();
			const props = {
				promise: Promise.reject(new Error('server-private-reason')),
				onInnerCatch,
				onOuterCatch,
			};
			const { html } = await prerender(Server, props, { onError });
			expect(onError).toHaveBeenCalledTimes(1);
			expect(onInnerCatch).not.toHaveBeenCalled();
			expect(onOuterCatch).not.toHaveBeenCalled();
			expect(html).not.toContain('server-private-reason');
			container.innerHTML = html;
			const clientError = Object.assign(new Error('client-visible-error'), { code: 'CLIENT' });
			const root = hydrateRoot(container, Component, {
				...props,
				promise: Promise.reject(clientError),
			});
			await act(async () => {});
			expect(container.querySelector(selector)!.textContent).toContain('client-visible-error');
			if (Component === RethrowingNestedRejectionBoundary) {
				expect(onInnerCatch).toHaveBeenCalledWith(clientError);
				expect(onOuterCatch).toHaveBeenCalledWith(clientError);
				expect(container.querySelector(selector)!.getAttribute('data-code')).toBe('CLIENT');
			}
			root.unmount();
		},
	);

	it('keeps fulfilled data shaped like the former rejection sentinel as data', async () => {
		const value = {
			label: 'fulfilled',
			__octane_new_rejection__: { name: 'NotAnError', message: 'ordinary-data' },
			__octane_new_undefined__: true,
			nestedUndefined: { value: undefined },
			undefinedList: [undefined],
			wirePrefix: '\0octane:ssr-seed:u',
		};
		const { html } = await prerender(server.SeedCollision, {
			promise: Promise.resolve(value),
		});
		container.innerHTML = html;
		const serverNode = container.querySelector('#seed-collision');
		let hydratedValue: any;
		const root = hydrateRoot(container, SeedCollision as any, {
			promise: pending(),
			onValue: (seen: unknown) => (hydratedValue = seen),
		});
		flushSync(() => {});

		expect(container.querySelector('#seed-collision')).toBe(serverNode);
		expect(serverNode!.textContent).toBe('fulfilled');
		expect(serverNode!.getAttribute('data-message')).toBe('ordinary-data');
		expect(serverNode!.getAttribute('data-undefined')).toBe('true');
		expect(hydratedValue).toEqual(value);
		expect(Object.prototype.hasOwnProperty.call(hydratedValue.nestedUndefined, 'value')).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(hydratedValue.undefinedList, 0)).toBe(true);
		root.unmount();
	});
});
