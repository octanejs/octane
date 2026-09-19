import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, type Root } from 'octane';
import { renderToString } from 'octane/server';
import { createScope, type Scope } from 'octane/signals';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/primitive-local-values.tsrx';
import * as native from './_fixtures/primitive-local-native-values.tsrx';
import { GlobalMutationValue } from './_fixtures/primitive-local-global-mutation.tsrx';
import { WrappedMutationValue } from './_fixtures/primitive-local-wrapped-mutation.tsrx';
import { NativeMutationValue } from './_fixtures/primitive-local-native-mutation.tsrx';

const compileOptions = { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false };
const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/primitive-local-values.tsrx',
	{ compileOptions },
);
const nativeServer = loadServerFixture<typeof native>(
	'packages/octane/tests/_fixtures/primitive-local-native-values.tsrx',
	{ compileOptions },
);
const globalServer = loadServerFixture<{ GlobalMutationValue: typeof GlobalMutationValue }>(
	'packages/octane/tests/_fixtures/primitive-local-global-mutation.tsrx',
	{ compileOptions },
);
const wrappedServer = loadServerFixture<{ WrappedMutationValue: typeof WrappedMutationValue }>(
	'packages/octane/tests/_fixtures/primitive-local-wrapped-mutation.tsrx',
	{ compileOptions },
);

const nativeMutationServer = loadServerFixture<{ NativeMutationValue: typeof NativeMutationValue }>(
	'packages/octane/tests/_fixtures/primitive-local-native-mutation.tsrx',
	{ compileOptions },
);

// Prepare native static methods outside compiled fixtures so this setup cannot
// mask the specific authored global mutation each fixture must preserve.
function conversionReturningHandle(handle: unknown) {
	const builtin = String;
	const replacement = (value: unknown) => (value === handle ? value : builtin(value));
	Object.setPrototypeOf(replacement, builtin);
	return replacement;
}

describe('primitive setup values across server rendering and adoption', () => {
	let host: HTMLDivElement;
	let root: Root | undefined;
	const scopes: Scope[] = [];

	beforeEach(() => {
		host = document.createElement('div');
		document.body.append(host);
	});
	afterEach(() => {
		root?.unmount();
		root = undefined;
		for (const scope of scopes) scope.dispose();
		scopes.length = 0;
		host.remove();
	});

	it('evaluates conversion once and restores controlled inputs on unchanged values', () => {
		let conversions = 0;
		const value = { toString: () => (++conversions, 'converted') };
		const props = { value, checked: true };
		host.innerHTML = renderToString(server.PrimitiveValue, props).html;
		expect(conversions).toBe(1);
		const output = host.querySelector('output')!;
		const input = host.querySelector('input')!;
		const checkbox = host.querySelector<HTMLInputElement>('[type="checkbox"]')!;
		input.focus();
		input.setSelectionRange(2, 5);
		flushSync(() => {
			root = hydrateRoot(host, client.PrimitiveValue, props);
		});
		expect(conversions).toBe(2);
		expect(host.querySelector('output')).toBe(output);
		expect(host.querySelector('input')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
		expect([output.textContent, output.title, input.value]).toEqual([
			'converted',
			'converted',
			'converted',
		]);
		input.value = 'user edit';
		checkbox.checked = false;
		flushSync(() => root!.render(client.PrimitiveValue, props));
		expect(conversions).toBe(3);
		expect(input.value).toBe('converted');
		expect(checkbox.checked).toBe(true);
	});

	it('keeps setup conversions reactive when callbacks hide native reads', () => {
		const scope = createScope({ scopeKey: 'primitive-hidden-reads' });
		scopes.push(scope);
		const value$ = scope.signal$('value', 'server');
		const numeric$ = scope.signal$('numeric', 2);
		const props = { read$: () => value$.get(), numeric$: () => numeric$.get() };
		host.innerHTML = renderToString(nativeServer.NativePrimitiveValue, props, {
			signalOwner: scope,
		}).html;
		const output = host.querySelector('output')!;
		const input = host.querySelector('input')!;
		const paragraph = host.querySelector('p')!;
		flushSync(() => {
			root = hydrateRoot(host, native.NativePrimitiveValue, props, { signalOwner: scope });
		});
		expect(host.querySelector('output')).toBe(output);
		expect(host.querySelector('input')).toBe(input);
		flushSync(() => {
			scope.set(value$, 'updated');
			scope.set(numeric$, 5);
		});
		expect([
			output.textContent,
			output.title,
			input.value,
			paragraph.textContent,
			paragraph.title,
		]).toEqual(['updated', 'updated', 'updated', '6', '6']);
		root!.unmount();
		root = undefined;
		flushSync(() => scope.set(value$, 'after disposal'));
		expect(host.textContent).toBe('');
	});

	it('retries a pending hidden read before converting and keeps the settled read live', async () => {
		const scope = createScope({ scopeKey: 'primitive-pending-read' });
		scopes.push(scope);
		const value$ = scope.signal$('value', 'settled');
		let ready = false;
		let resolve!: () => void;
		const pending = new Promise<void>((resume) => {
			resolve = resume;
		});
		const props = {
			read$: () => {
				const value = value$.get();
				if (!ready) throw pending;
				return value;
			},
			numeric$: () => 0,
		};
		host.innerHTML = renderToString(nativeServer.NativePrimitiveBoundary, props, {
			signalOwner: scope,
		}).html;
		expect(host.textContent).toBe('waiting');
		flushSync(() => {
			root = hydrateRoot(host, native.NativePrimitiveBoundary, props, { signalOwner: scope });
		});
		await act(() => {
			ready = true;
			resolve();
		});
		const output = host.querySelector('output')!;
		const input = host.querySelector('input')!;
		expect([output.textContent, output.title, input.value]).toEqual([
			'settled',
			'settled',
			'settled',
		]);
		flushSync(() => scope.set(value$, 'after retry'));
		expect(host.querySelector('output')).toBe(output);
		expect([output.textContent, output.title, input.value]).toEqual([
			'after retry',
			'after retry',
			'after retry',
		]);
	});

	for (const name of ['OpaqueValue', 'MutableValue', 'ShadowedValue'] as const) {
		it(`keeps real handles live through ${name} setup`, () => {
			const scope = createScope({ scopeKey: 'primitive-opaque-' + name });
			scopes.push(scope);
			const value$ = scope.signal$('value', 'initial');
			const props =
				name === 'OpaqueValue'
					? { read$: () => value$ }
					: name === 'MutableValue'
						? { initial: 'discarded', replacement$: value$ }
						: { convert$: () => value$ };
			host.innerHTML = renderToString(server[name], props, { signalOwner: scope }).html;
			const output = host.querySelector('output')!;
			const input = host.querySelector('input')!;
			flushSync(() => {
				root = hydrateRoot(host, client[name], props, { signalOwner: scope });
			});
			flushSync(() => scope.set(value$, 'live'));
			expect(host.querySelector('output')).toBe(output);
			expect(host.querySelector('input')).toBe(input);
			expect([output.textContent, output.title, input.value]).toEqual(['live', 'live', 'live']);
		});
	}

	for (const mutation of ['assignment', 'assign', 'defineProperty', 'set'] as const) {
		it(`keeps a handle returned after aliased global ${mutation} live`, () => {
			const scope = createScope({ scopeKey: 'primitive-global-alias-' + mutation });
			scopes.push(scope);
			const value$ = scope.signal$('value', 'actual handle');
			const props = { value$, mutation, replacement: conversionReturningHandle(value$) };
			const original = Object.getOwnPropertyDescriptor(globalThis, 'String')!;
			let html: string;
			try {
				html = renderToString(globalServer.GlobalMutationValue, props, {
					signalOwner: scope,
				}).html;
			} finally {
				Object.defineProperty(globalThis, 'String', original);
			}
			host.innerHTML = html;
			const output = host.querySelector('output')!;
			const input = host.querySelector('input')!;
			try {
				flushSync(() => {
					root = hydrateRoot(host, GlobalMutationValue, props, { signalOwner: scope });
				});
			} finally {
				Object.defineProperty(globalThis, 'String', original);
			}
			expect(host.querySelector('output')).toBe(output);
			expect(host.querySelector('input')).toBe(input);
			expect([output.textContent, output.title, input.value]).toEqual([
				'actual handle',
				'actual handle',
				'actual handle',
			]);
			flushSync(() => scope.set(value$, 'still live'));
			expect([output.textContent, output.title, input.value]).toEqual([
				'still live',
				'still live',
				'still live',
			]);
		});
	}

	for (const mutation of [
		'cast',
		'nonNull',
		'satisfies',
		'optionalCall',
		'optionalReceiver',
		'extracted',
	] as const) {
		it(`keeps handles live after a ${mutation} computed global mutator`, () => {
			const scope = createScope({ scopeKey: 'primitive-wrapped-mutator-' + mutation });
			scopes.push(scope);
			const value$ = scope.signal$('value', 'actual handle');
			const props = {
				value$,
				mutation,
				method: 'set' as const,
				replacement: conversionReturningHandle(value$),
			};
			const original = Object.getOwnPropertyDescriptor(globalThis, 'String')!;
			let html: string;
			try {
				html = renderToString(wrappedServer.WrappedMutationValue, props, {
					signalOwner: scope,
				}).html;
			} finally {
				Object.defineProperty(globalThis, 'String', original);
			}
			host.innerHTML = html;
			const output = host.querySelector('output')!;
			const input = host.querySelector('input')!;
			input.focus();
			input.setSelectionRange(2, 5);
			try {
				flushSync(() => {
					root = hydrateRoot(host, WrappedMutationValue, props, { signalOwner: scope });
				});
			} finally {
				Object.defineProperty(globalThis, 'String', original);
			}
			expect(host.querySelector('output')).toBe(output);
			expect(host.querySelector('input')).toBe(input);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
			expect([output.textContent, output.title, input.value]).toEqual([
				'actual handle',
				'actual handle',
				'actual handle',
			]);
			flushSync(() => scope.set(value$, 'still live'));
			expect([output.textContent, output.title, input.value]).toEqual([
				'still live',
				'still live',
				'still live',
			]);
		});
	}

	for (const mutation of ['defineGetter', 'objectPrototype', 'reflectPrototype'] as const) {
		it(`preserves adopted live handles after native global ${mutation}`, () => {
			const scope = createScope({ scopeKey: 'primitive-native-mutator-' + mutation });
			scopes.push(scope);
			const value$ = scope.signal$('value', 'actual handle');
			const original = Object.getOwnPropertyDescriptor(globalThis, 'String')!;
			const originalPrototype = Object.getPrototypeOf(globalThis);
			const replacement = conversionReturningHandle(value$);
			const prototype = Object.create(originalPrototype);
			Object.defineProperty(prototype, 'String', { value: replacement, configurable: true });
			const props = { value$, replacement, prototype, mutation };
			const restore = () => {
				Object.setPrototypeOf(globalThis, originalPrototype);
				Object.defineProperty(globalThis, 'String', original);
			};
			let html: string;
			try {
				html = renderToString(nativeMutationServer.NativeMutationValue, props, {
					signalOwner: scope,
				}).html;
			} finally {
				restore();
			}
			host.innerHTML = html;
			const output = host.querySelector('output')!;
			const input = host.querySelector('input')!;
			input.focus();
			input.setSelectionRange(2, 5);
			try {
				flushSync(() => {
					root = hydrateRoot(host, NativeMutationValue, props, { signalOwner: scope });
				});
			} finally {
				restore();
			}
			expect(host.querySelector('output')).toBe(output);
			expect(host.querySelector('input')).toBe(input);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
			expect([output.textContent, output.title, input.value]).toEqual([
				'actual handle',
				'actual handle',
				'actual handle',
			]);
			flushSync(() => scope.set(value$, 'still live'));
			expect([output.textContent, output.title, input.value]).toEqual([
				'still live',
				'still live',
				'still live',
			]);
		});
	}

	it('keeps loop bindings distinct from a primitive outer local on reorder', () => {
		const scope = createScope({ scopeKey: 'primitive-loop-shadow' });
		scopes.push(scope);
		const first$ = scope.signal$('first', 'a');
		const second$ = scope.signal$('second', 'b');
		const props = { values$: [first$, second$] };
		host.innerHTML = renderToString(server.ShadowedRows, props, { signalOwner: scope }).html;
		const outputs = Array.from(host.querySelectorAll('output'));
		flushSync(() => {
			root = hydrateRoot(host, client.ShadowedRows, props, { signalOwner: scope });
		});
		flushSync(() => root!.render(client.ShadowedRows, { values$: [second$, first$] }));
		expect(Array.from(host.querySelectorAll('output'))).toEqual([outputs[1], outputs[0]]);
		flushSync(() => scope.set(first$, 'changed'));
		expect(
			Array.from(host.querySelectorAll('output'), (node) => [node.textContent, node.title]),
		).toEqual([
			['b', 'b'],
			['changed', 'changed'],
		]);
	});

	it('preserves setup throws without evaluating a callback twice', () => {
		let reads = 0;
		const error = new Error('conversion failed');
		const props = {
			read: () => {
				reads++;
				throw error;
			},
		};
		expect(() => renderToString(server.PrimitiveThrows, props)).toThrow(error);
		expect(reads).toBe(1);
		root = createRoot(host);
		expect(() => root!.render(client.PrimitiveThrows, props)).toThrow(error);
		expect(reads).toBe(2);
		expect(host.textContent).toBe('');
	});
});
