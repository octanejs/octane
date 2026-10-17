import { loadCompiledFixtureSource } from './_server-fixture.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prerender } from 'octane/static';
import { act, flushSync, hydrateRoot } from '../src/index.js';
import {
	NestedRejectionBoundary,
	ReasonBoundary,
	RethrowingNestedRejectionBoundary,
	SeedCollision,
} from './_fixtures/ssr-suspense.tsrx';

// Authored catch arms render server failures into HTML. Hydration retries the
// boundary from client data, so a client catch receives the client's own reason.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');

function serverModule(): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
		id: 'ssr-suspense.tsrx',
		mode: 'server',
		compileOptions: {
			mode: 'server',
		},
	});
}

const server = serverModule();
const pending = <T>() => new Promise<T>(() => {});

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

async function hydrate(
	component: unknown,
	props: Record<string, unknown>,
	recovered: unknown[] = [],
): Promise<ReturnType<typeof hydrateRoot>> {
	let root!: ReturnType<typeof hydrateRoot>;
	await act(async () => {
		root = hydrateRoot(container, component as any, props, {
			onRecoverableError: (error) => recovered.push(error),
		});
	});
	return root;
}

/** Waits out the Suspense retry window until `check` passes. */
async function settle(check: () => void): Promise<void> {
	await vi.waitFor(async () => {
		await act(async () => {});
		check();
	});
}

describe('SSR rejection hydration', () => {
	it('renders a primitive server rejection and gives the client catch its own reason', async () => {
		const { html } = await prerender(server.ReasonBoundary, {
			promise: Promise.reject('plain-reason'),
		});
		container.innerHTML = html;
		expect(container.querySelector('.reason-error')?.textContent).toBe('plain-reason:');
		expect(container.querySelector('.reason-loading')).toBeNull();

		const clientRejection = Promise.reject('client-reason');
		clientRejection.catch(() => {});
		let caught: unknown;
		const recovered: unknown[] = [];
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = await hydrate(
			ReasonBoundary,
			{ promise: clientRejection, onCatch: (reason: unknown) => (caught = reason) },
			recovered,
		);
		try {
			await settle(() => expect(container.querySelector('.reason-error')).not.toBeNull());
			const error = container.querySelector('.reason-error')!;
			expect(error.textContent).toBe('client-reason:');
			expect(error.getAttribute('data-kind')).toBe('string');
			expect(caught).toBe('client-reason');
			expect(recovered).toEqual([]);
		} finally {
			errorSpy.mockRestore();
			root.unmount();
		}
	});

	it('routes an inner rejection to the outer catch and retries that boundary on hydration', async () => {
		const { html } = await prerender(server.NestedRejectionBoundary, {
			promise: Promise.reject('nested-no'),
		});
		container.innerHTML = html;
		const box = container.querySelector('#nested-rejection');
		expect(container.querySelector('.nested-error')?.textContent).toBe('nested-no');
		expect(container.querySelector('.nested-inner-loading, .nested-outer-loading')).toBeNull();

		const recovered: unknown[] = [];
		const root = await hydrate(
			NestedRejectionBoundary,
			{ promise: Promise.resolve('client-value') },
			recovered,
		);
		try {
			await settle(() =>
				expect(container.querySelector('.nested-ok')?.textContent).toBe('client-value'),
			);
			expect(container.querySelector('#nested-rejection')).toBe(box);
			expect(container.querySelector('.nested-inner-loading, .nested-error')).toBeNull();
			expect(recovered).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('lets an inner client catch rethrow the client reason to an outer catch', async () => {
		const serverReason = {
			message: 'server-no',
			code: 'E_SERVER',
			privateDetail: 'server-only-private-detail',
		};
		const { html } = await prerender(server.RethrowingNestedRejectionBoundary, {
			promise: Promise.reject(serverReason),
		});
		expect(html).not.toContain(serverReason.privateDetail);
		container.innerHTML = html;
		expect(container.querySelector('.nested-rethrow-error')?.textContent).toBe('server-no');
		expect(container.querySelector('.nested-rethrow-error')?.getAttribute('data-code')).toBe(
			'E_SERVER',
		);

		const reason = { message: 'rethrow-no', code: 'E_RETHROW' };
		const clientRejection = Promise.reject(reason);
		clientRejection.catch(() => {});
		let inner: unknown;
		let outer: unknown;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = await hydrate(RethrowingNestedRejectionBoundary, {
			promise: clientRejection,
			onInnerCatch: (value: unknown) => (inner = value),
			onOuterCatch: (value: unknown) => (outer = value),
		});
		try {
			await settle(() =>
				expect(container.querySelector('.nested-rethrow-error')?.textContent).toBe('rethrow-no'),
			);
			expect(container.querySelector('.nested-rethrow-error')!.getAttribute('data-code')).toBe(
				'E_RETHROW',
			);
			expect(inner).toBe(reason);
			expect(outer).toBe(reason);
			expect(container.querySelector('.nested-rethrow-never')).toBeNull();
		} finally {
			errorSpy.mockRestore();
			root.unmount();
		}
	});

	it('keeps fulfilled data shaped like the seed envelope as data', async () => {
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
