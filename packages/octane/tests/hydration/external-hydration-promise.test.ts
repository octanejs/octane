import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import {
	EXTERNAL_HYDRATION_PROMISE,
	act,
	createRoot,
	flushSync,
	hydrateRoot,
} from '../../src/index.js';
import { EXTERNAL_HYDRATION_PROMISE as CONSTANTS_MARKER } from '../../src/constants.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import {
	ExternalBoundary,
	MixedHydrationOwners,
	RichExternalValue,
} from './_fixtures/external-hydration-promise.tsrx';

const FIXTURE = join(import.meta.dirname, '_fixtures/external-hydration-promise.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'external-hydration-promise.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_match: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

const server = serverModule();

interface ExternalThenable<T> extends PromiseLike<T> {
	readonly [EXTERNAL_HYDRATION_PROMISE]: true;
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: unknown;
}

function externalWrapper<T>(source: PromiseLike<T>): ExternalThenable<T> {
	return {
		[EXTERNAL_HYDRATION_PROMISE]: true,
		then: source.then.bind(source),
	};
}

function fulfilledExternal<T>(value: T): ExternalThenable<T> {
	const source = Object.freeze(Promise.resolve(value));
	const wrapper = externalWrapper(source);
	wrapper.status = 'fulfilled';
	wrapper.value = value;
	return wrapper;
}

function rejectedExternal<T = never>(reason: unknown): ExternalThenable<T> {
	const source = Promise.reject<T>(reason);
	void source.catch(() => undefined);
	const wrapper = externalWrapper(Object.freeze(source));
	wrapper.status = 'rejected';
	wrapper.reason = reason;
	return wrapper;
}

function pendingExternal<T>(): {
	thenable: ExternalThenable<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const source = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {
		thenable: externalWrapper(Object.freeze(source)),
		resolve,
		reject,
	};
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('externally hydrated thenables', () => {
	it('exports one well-known marker from the client, server, and constants surfaces', () => {
		expect(EXTERNAL_HYDRATION_PROMISE).toBe(CONSTANTS_MARKER);
		expect(ServerRT.EXTERNAL_HYDRATION_PROMISE).toBe(CONSTANTS_MARKER);
		expect(EXTERNAL_HYDRATION_PROMISE).toBe(Symbol.for('octane.external-hydration-promise'));
	});

	it('keeps ordinary use(thenable) SSR seeding unchanged', async () => {
		const { html } = await prerender(server.ExternalBoundary, {
			promise: Promise.resolve('server value'),
		});
		expect(html).toContain('data-octane-suspense>["server value"]</script>');

		container.innerHTML = html;
		const resolved = container.querySelector('.resolved');
		const root = hydrateRoot(container, ExternalBoundary, {
			promise: Promise.resolve('client value'),
		});
		flushSync(() => {});

		expect(container.querySelector('.resolved')).toBe(resolved);
		expect(resolved?.textContent).toBe('server value');
		root.unmount();
	});

	it('unwraps a marked fulfilled value without emitting or consuming an Octane seed', async () => {
		const { html } = await prerender(server.ExternalBoundary, {
			promise: fulfilledExternal('ready'),
		});
		expect(html).toContain('<span class="resolved">ready</span>');
		expect(html).not.toContain('data-octane-suspense');

		container.innerHTML = html;
		const resolved = container.querySelector('.resolved');
		const root = hydrateRoot(container, ExternalBoundary, {
			promise: fulfilledExternal('ready'),
		});
		flushSync(() => {});

		expect(container.querySelector('.resolved')).toBe(resolved);
		expect(container.querySelector('.pending')).toBeNull();
		root.unmount();
	});

	it('keeps a marked pending thenable on the normal suspense and retry path', async () => {
		const serverValue = pendingExternal<string>();
		const { html } = ServerRT.renderToString(server.ExternalBoundary, {
			promise: serverValue.thenable,
		});
		expect(html).toContain('<span class="pending">pending</span>');
		expect(html).not.toContain('data-octane-suspense');

		const root = createRoot(container);
		const clientValue = pendingExternal<string>();
		root.render(ExternalBoundary, {
			promise: clientValue.thenable,
		});
		flushSync(() => {});
		expect(container.querySelector('.pending')?.textContent).toBe('pending');

		await act(() => clientValue.resolve('settled'));
		expect(container.querySelector('.pending')).toBeNull();
		expect(container.querySelector('.resolved')?.textContent).toBe('settled');
		root.unmount();
	});

	it('routes a marked rejection through the ordinary catch path without a seed', async () => {
		const { html } = await prerender(server.ExternalBoundary, {
			promise: rejectedExternal(new Error('denied')),
		});
		expect(html).toContain('<span class="rejected">denied</span>');
		expect(html).not.toContain('data-octane-suspense');

		const root = createRoot(container);
		root.render(ExternalBoundary, {
			promise: rejectedExternal(new Error('denied')),
		});
		flushSync(() => {});

		expect(container.querySelector('.rejected')?.textContent).toBe('denied');
		root.unmount();
	});

	it('does not shift ordinary seed consumption around a marked use()', async () => {
		const { html } = await prerender(server.MixedHydrationOwners, {
			external: fulfilledExternal('external server'),
			ordinary: Promise.resolve('ordinary server'),
		});
		expect(html).toContain('data-octane-suspense>["ordinary server"]</script>');

		container.innerHTML = html;
		const mixed = container.querySelector('#mixed-hydration-owners');
		const root = hydrateRoot(container, MixedHydrationOwners, {
			external: fulfilledExternal('external server'),
			ordinary: Promise.resolve('ordinary client'),
		});
		flushSync(() => {});

		expect(container.querySelector('#mixed-hydration-owners')).toBe(mixed);
		expect(mixed?.getAttribute('data-external')).toBe('external server');
		expect(mixed?.getAttribute('data-ordinary')).toBe('ordinary server');
		expect(mixed?.textContent).toBe('external server:ordinary server');
		root.unmount();
	});

	it('preserves Date and Map values supplied by the external hydration owner', async () => {
		const serverValue = {
			date: new Date('2026-07-16T12:00:00.000Z'),
			map: new Map([['answer', 42]]),
		};
		const { html } = await prerender(server.RichExternalValue, {
			promise: fulfilledExternal(serverValue),
		});
		expect(html).toContain('2026-07-16T12:00:00.000Z|42');
		expect(html).not.toContain('data-octane-suspense');

		container.innerHTML = html;
		const rich = container.querySelector('#rich-external-value');
		const clientValue = {
			date: new Date('2026-07-16T12:00:00.000Z'),
			map: new Map([['answer', 42]]),
		};
		let observed: typeof clientValue | undefined;
		const root = hydrateRoot(container, RichExternalValue, {
			promise: fulfilledExternal(clientValue),
			onValue: (value: typeof clientValue) => {
				observed = value;
			},
		});
		flushSync(() => {});

		expect(container.querySelector('#rich-external-value')).toBe(rich);
		expect(observed?.date).toBeInstanceOf(Date);
		expect(observed?.map).toBeInstanceOf(Map);
		expect(observed?.map.get('answer')).toBe(42);
		root.unmount();
	});
});
