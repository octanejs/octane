import { describe, expect, it } from 'vitest';
import * as Client from '../src/index.js';
import * as Server from '../src/runtime.server.js';
import * as Universal from '../src/universal.js';
import * as Native from '../src/universal-native.js';

describe.each([
	['client', Client],
	['server', Server],
	['universal', Universal],
	['native', Native],
] as const)('%s custom hook invocation', (_name, Runtime) => {
	it('preserves the reflected arity of hook entry points', () => {
		expect(Runtime.withSlot.length).toBe(2);
		expect(Runtime.useSyncExternalStore.length).toBe(2);
		expect(Runtime.useDeferredValue.length).toBe(1);
	});
	it.each([0, 1, 2, 3, 4, 5, 8])(
		'preserves %i authored arguments and the undefined receiver',
		(arity) => {
			const slot = Symbol('custom call');
			const values = [undefined, Symbol('value'), {}, false, null, 'six', 7, 8].slice(0, arity);
			function hook(this: unknown) {
				return { receiver: this, values: Array.from(arguments) };
			}
			Object.defineProperties(hook, {
				apply: {
					get() {
						throw new Error('must not consult callback.apply');
					},
				},
				call: {
					get() {
						throw new Error('must not consult callback.call');
					},
				},
			});
			const actual = Runtime.withSlot(slot, hook, ...values);
			expect(actual.receiver).toBeUndefined();
			expect(actual.values).toHaveLength(arity);
			for (let index = 0; index < arity; index++) expect(actual.values[index]).toBe(values[index]);
		},
	);

	it('observes an inherited argument iterator once with its original Array receiver', () => {
		const slot = Symbol('custom argument iterator');
		const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)!;
		let reads = 0;
		let getterReceiver: unknown;
		let receiver: unknown[] | undefined;
		let actual: unknown;
		try {
			Object.defineProperty(Array.prototype, Symbol.iterator, {
				configurable: true,
				get() {
					reads++;
					getterReceiver = this;
					return function (this: unknown[]) {
						receiver = this;
						let done = false;
						return {
							next() {
								if (done) return { done: true, value: undefined };
								done = true;
								return { done: false, value: `${receiver![1]}:${receiver![0]}` };
							},
						};
					};
				},
			});
			actual = Runtime.withSlot(
				slot,
				function (this: unknown, value: unknown) {
					return { receiver: this, value, arity: arguments.length };
				},
				'left',
				'right',
			);
		} finally {
			Object.defineProperty(Array.prototype, Symbol.iterator, descriptor);
		}
		expect(reads).toBe(1);
		expect(actual).toEqual({ receiver: undefined, value: 'right:left', arity: 1 });
		expect(Object.getPrototypeOf(receiver)).toBe(Array.prototype);
		expect(getterReceiver).toBe(receiver);
		expect(receiver).toEqual(['left', 'right']);
		expect(Object.hasOwn(receiver!, Symbol.iterator)).toBe(false);
	});

	it('propagates argument iterator exceptions and permits a later call', () => {
		const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)!;
		const failure = new Error('argument iterator');
		let actual: unknown;
		try {
			Object.defineProperty(Array.prototype, Symbol.iterator, {
				configurable: true,
				get() {
					throw failure;
				},
			});
			try {
				Runtime.withSlot(Symbol('throwing arguments'), () => 'unreachable');
			} catch (error) {
				actual = error;
			}
		} finally {
			Object.defineProperty(Array.prototype, Symbol.iterator, descriptor);
		}
		expect(actual).toBe(failure);
		expect(Runtime.withSlot(Symbol('later arguments'), (value) => value, 'restored')).toBe(
			'restored',
		);
	});
});

describe('custom hook state paths', () => {
	const stateSite = Symbol('state:site');
	const refSite = Symbol('ref:site');
	const inner = Symbol('inner:with:delimiters');
	const first = Symbol.for('custom-call-contract:first');
	const second = Symbol.for('custom-call-contract:second');
	let report: Record<
		string,
		{ state: string; set: (value: string) => void; ref: { current: string } }
	>;
	function useValue(value: string) {
		const [state, set] = Client.useState(value, stateSite);
		const ref = Client.useRef(value, refSite);
		return { state, set, ref };
	}
	function nested(value: string) {
		return Client.withSlot(inner, useValue, value);
	}
	function App(props: { swap?: boolean; hideFirst?: boolean; value?: string }) {
		const left = props.hideFirst
			? null
			: Client.withSlot(props.swap ? second : first, nested, props.value ?? 'first');
		const right = Client.withSlot(props.swap ? first : second, nested, props.value ?? 'second');
		report = { ...(left === null ? {} : { left }), right };
		return Client.createElement('p', { children: `${left?.state ?? '-'}|${right.state}` });
	}
	it('keeps conditional and reordered call sites independent across roots', () => {
		const container = document.createElement('div');
		const root = Client.createRoot(container);
		const otherContainer = document.createElement('div');
		const other = Client.createRoot(otherContainer);
		try {
			Client.flushSync(() => root.render(App, {}));
			const firstRef = report.left.ref;
			const secondRef = report.right.ref;
			expect(firstRef).not.toBe(secondRef);
			Client.flushSync(() => report.left.set('changed'));
			expect(container.textContent).toBe('changed|second');
			Client.flushSync(() => root.render(App, { hideFirst: true }));
			expect(container.textContent).toBe('-|second');
			Client.flushSync(() => root.render(App, { swap: true }));
			expect(container.textContent).toBe('second|changed');
			expect(report.left.ref).toBe(secondRef);
			expect(report.right.ref).toBe(firstRef);
			Client.flushSync(() => other.render(App, { value: 'other' }));
			expect(otherContainer.textContent).toBe('other|other');
			expect(report.left.ref).not.toBe(firstRef);
			Client.flushSync(() => root.render(App, {}));
			expect(container.textContent).toBe('changed|second');
			expect(report.left.ref).toBe(firstRef);
		} finally {
			root.unmount();
			other.unmount();
		}
	});

	it('observes a replaced symbol registry after an earlier call populated its path', () => {
		const container = document.createElement('div');
		const root = Client.createRoot(container);
		const original = Symbol.for;
		const descriptor = Object.getOwnPropertyDescriptor(Symbol, 'for')!;
		let registryReceiver: unknown;
		try {
			Client.flushSync(() => root.render(App, {}));
			const previous = report.left.ref;
			Object.defineProperty(Symbol, 'for', {
				...descriptor,
				value: function (this: unknown, key: string) {
					if (key.startsWith('@octane:hook:')) {
						registryReceiver = this;
						return original('redirected:' + key);
					}
					return original(key);
				},
			});
			Client.flushSync(() => root.render(App, { value: 'redirected' }));
			expect(container.textContent).toBe('redirected|redirected');
			expect(registryReceiver).toBe(Symbol);
			expect(report.left.ref).not.toBe(previous);
			Object.defineProperty(Symbol, 'for', descriptor);
			Client.flushSync(() => root.render(App, {}));
			expect(container.textContent).toBe('first|second');
			expect(report.left.ref).toBe(previous);
		} finally {
			Object.defineProperty(Symbol, 'for', descriptor);
			root.unmount();
		}
	});
});
