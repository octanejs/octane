import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { prerender } from 'octane/static';
import { flushSync, hydrateRoot } from '../src/index.js';
import {
	NestedRejectionBoundary,
	OpaqueReasonBoundary,
	ReasonBoundary,
	RethrowingNestedRejectionBoundary,
	SeedCollision,
} from './_fixtures/ssr-suspense.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'ssr-suspense.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_match: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
}

const server = serverModule();
const pending = <T>() => new Promise<T>(() => {});

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('SSR rejection hydration fidelity', () => {
	it('hydrates a primitive rejection through the existing server catch DOM', async () => {
		const { html } = await prerender(server.ReasonBoundary, {
			promise: Promise.reject('plain-reason'),
		});
		container.innerHTML = html;
		const serverCatch = container.querySelector('.reason-error');
		let caught: unknown;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, ReasonBoundary as any, {
			promise: pending(),
			onCatch: (reason: unknown) => (caught = reason),
		});
		flushSync(() => {});

		expect(container.querySelector('.reason-error')).toBe(serverCatch);
		expect(serverCatch!.textContent).toBe('plain-reason:');
		expect(serverCatch!.getAttribute('data-kind')).toBe('string');
		expect(caught).toBe('plain-reason');
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
		root.unmount();
	});

	it('preserves a plain-object rejection and its catch-visible custom fields', async () => {
		const reason = { message: 'plain-no', code: 'E_PLAIN', details: { retry: false } };
		const { html } = await prerender(server.ReasonBoundary, {
			promise: Promise.reject(reason),
		});
		container.innerHTML = html;
		const serverCatch = container.querySelector('.reason-error');
		let caught: any;
		const root = hydrateRoot(container, ReasonBoundary as any, {
			promise: pending(),
			onCatch: (value: unknown) => (caught = value),
		});
		flushSync(() => {});

		expect(container.querySelector('.reason-error')).toBe(serverCatch);
		expect(serverCatch!.textContent).toBe('plain-no:E_PLAIN');
		expect(caught).toEqual(reason);
		root.unmount();
	});

	it('reconstructs Error fields and safely snapshots cycles and hostile properties', async () => {
		const reason: any = new Error('error-no');
		reason.code = 'E_ERROR';
		reason.details = { retry: false };
		reason.details.self = reason.details;
		Object.defineProperty(reason, '__proto__', {
			value: { polluted: true },
			enumerable: true,
		});
		Object.defineProperty(reason, 'hostile', {
			enumerable: true,
			get() {
				throw new Error('do not invoke me twice');
			},
		});

		const { html } = await prerender(server.ReasonBoundary, {
			promise: Promise.reject(reason),
		});
		container.innerHTML = html;
		let caught: any;
		const root = hydrateRoot(container, ReasonBoundary as any, {
			promise: pending(),
			onCatch: (value: unknown) => (caught = value),
		});
		flushSync(() => {});

		expect(caught).toBeInstanceOf(Error);
		expect(caught).toMatchObject({
			name: 'Error',
			message: 'error-no',
			code: 'E_ERROR',
			details: { retry: false, self: '[Circular]' },
			hostile: '[unavailable]',
		});
		expect(Object.prototype.hasOwnProperty.call(caught, '__proto__')).toBe(true);
		expect(caught.__proto__).toEqual({ polluted: true });
		expect(({} as any).polluted).toBeUndefined();
		root.unmount();
	});

	it('bounds enumerable Error fields with one shared snapshot budget', async () => {
		const reason: any = new Error('many-fields');
		for (let i = 0; i < 600; i++) reason['field' + i] = { nested: { index: i } };
		const { html } = await prerender(server.ReasonBoundary, {
			promise: Promise.reject(reason),
		});
		container.innerHTML = html;
		let caught: any;
		const root = hydrateRoot(container, ReasonBoundary as any, {
			promise: pending(),
			onCatch: (value: unknown) => (caught = value),
		});
		flushSync(() => {});

		expect(caught.field0).toEqual({ nested: { index: 0 } });
		expect(caught.field255).toEqual({ nested: { index: 255 } });
		expect(caught.field256).toBe('[truncated]');
		expect(caught.field511).toBe('[truncated]');
		expect(caught.field512).toBeUndefined();
		expect(caught.__octane_truncated__).toBe(true);
		root.unmount();
	});

	it('degrades a revoked proxy reason without losing the hydration seed', async () => {
		const revocable = Proxy.revocable({}, {});
		revocable.revoke();
		const { html } = await prerender(server.OpaqueReasonBoundary, {
			promise: Promise.reject(revocable.proxy),
		});
		expect(html).toContain('data-octane-suspense');
		container.innerHTML = html;
		const serverCatch = container.querySelector('.opaque-reason-error');
		let caught: unknown;
		const root = hydrateRoot(container, OpaqueReasonBoundary as any, {
			promise: pending(),
			onCatch: (value: unknown) => (caught = value),
		});
		flushSync(() => {});

		expect(container.querySelector('.opaque-reason-error')).toBe(serverCatch);
		expect(caught).toBe('[unavailable]');
		root.unmount();
	});

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

	it('keeps the former undefined sentinel shape inside a rejected plain object', async () => {
		const reason = {
			message: 'sentinel-shaped',
			code: 'E_SENTINEL',
			__octane_new_undefined__: true,
		};
		const { html } = await prerender(server.ReasonBoundary, {
			promise: Promise.reject(reason),
		});
		container.innerHTML = html;
		let caught: unknown;
		const root = hydrateRoot(container, ReasonBoundary as any, {
			promise: pending(),
			onCatch: (value: unknown) => (caught = value),
		});
		flushSync(() => {});

		expect(caught).toEqual(reason);
		root.unmount();
	});

	it('retains the private rejection signal through a catch-less inner boundary', async () => {
		const { html } = await prerender(server.NestedRejectionBoundary, {
			promise: Promise.reject('nested-no'),
		});
		container.innerHTML = html;
		const serverCatch = container.querySelector('.nested-error');
		const root = hydrateRoot(container, NestedRejectionBoundary as any, {
			promise: pending(),
		});
		flushSync(() => {});

		expect(container.querySelector('.nested-error')).toBe(serverCatch);
		expect(serverCatch!.textContent).toBe('nested-no');
		root.unmount();
	});

	it('retains rejection adoption when an inner catch rethrows to an outer catch', async () => {
		const reason = { message: 'rethrow-no', code: 'E_RETHROW' };
		const { html } = await prerender(server.RethrowingNestedRejectionBoundary, {
			promise: Promise.reject(reason),
		});
		container.innerHTML = html;
		const serverCatch = container.querySelector('.nested-rethrow-error');
		let inner: unknown;
		let outer: unknown;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, RethrowingNestedRejectionBoundary as any, {
			promise: pending(),
			onInnerCatch: (value: unknown) => (inner = value),
			onOuterCatch: (value: unknown) => (outer = value),
		});
		flushSync(() => {});

		expect(container.querySelector('.nested-rethrow-error')).toBe(serverCatch);
		expect(serverCatch!.textContent).toBe('rethrow-no');
		expect(serverCatch!.getAttribute('data-code')).toBe('E_RETHROW');
		expect(inner).toBe(outer);
		expect(outer).toEqual(reason);
		expect(container.querySelector('.nested-rethrow-never')).toBeNull();
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
		root.unmount();
	});
});
