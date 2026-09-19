import { describe, expect, it } from 'vitest';
import * as Server from 'octane/server';
import { createElement, useDeferredValue, useSyncExternalStore } from '../src/index.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalValue,
	useDeferredValue as useUniversalDeferredValue,
	useSyncExternalStore as useUniversalSyncExternalStore,
} from '../src/universal-native.js';
import { flushEffects, mount } from './_helpers.js';

const deferredSlot = Symbol('deferred');
const storeSlot = Symbol('store');

describe('optional hook arguments', () => {
	it('distinguishes an omitted deferred preview from explicit undefined, symbol, and numeric previews', () => {
		function Deferred(props: { mode: 'omitted' | 'undefined' | 'symbol' | 'zero'; value: string }) {
			const value =
				props.mode === 'omitted'
					? useDeferredValue(props.value, deferredSlot)
					: props.mode === 'undefined'
						? useDeferredValue(props.value, undefined, deferredSlot)
						: props.mode === 'symbol'
							? useDeferredValue(props.value, Symbol.for('preview'), deferredSlot)
							: useDeferredValue(props.value, 0, deferredSlot);
			return createElement('output', null, String(value));
		}
		for (const [mode, initial] of [
			['omitted', 'final'],
			['undefined', 'undefined'],
			['symbol', 'Symbol(preview)'],
			['zero', '0'],
		] as const) {
			const rendered = mount(Deferred, { mode, value: 'final' });
			expect(rendered.find('output').textContent).toBe(initial);
			rendered.unmount();
		}
	});

	it('reads the client snapshot with or without an explicit server snapshot and releases subscriptions', () => {
		let current = 'client';
		let notify: (() => void) | undefined;
		const calls: string[] = [];
		const subscribe = (listener: () => void) => {
			calls.push('subscribe');
			notify = listener;
			return () => {
				calls.push('unsubscribe');
				notify = undefined;
			};
		};
		const snapshot = () => {
			calls.push('client snapshot');
			return current;
		};
		const serverSnapshot = () => {
			calls.push('server snapshot');
			return 'server';
		};
		function Reader(props: { serverSnapshot?: () => string }) {
			const value = useSyncExternalStore(subscribe, snapshot, props.serverSnapshot, storeSlot);
			return createElement('output', null, value);
		}
		const rendered = mount(Reader, { serverSnapshot });
		flushEffects();
		expect(rendered.find('output').textContent).toBe('client');
		expect(calls).toContain('subscribe');
		expect(calls).not.toContain('server snapshot');
		current = 'next';
		notify?.();
		flushEffects();
		expect(rendered.find('output').textContent).toBe('next');
		rendered.update(Reader, { serverSnapshot: undefined });
		expect(rendered.find('output').textContent).toBe('next');
		rendered.unmount();
		expect(calls.filter((call) => call === 'subscribe')).toHaveLength(1);
		expect(calls.filter((call) => call === 'unsubscribe')).toHaveLength(1);
	});

	it('uses the authored server snapshot and deferred preview only when supplied', () => {
		const calls: string[] = [];
		const subscribe = () => () => {};
		const client = () => {
			calls.push('client');
			return 'client';
		};
		const server = () => {
			calls.push('server');
			return 'server';
		};
		function Reader() {
			return Server.createElement(
				'output',
				null,
				Server.useDeferredValue('final', undefined, deferredSlot),
				Server.useSyncExternalStore(subscribe, client, server, storeSlot),
				Server.useDeferredValue('final', deferredSlot),
			);
		}
		const { html } = Server.renderToString(Reader);
		expect(html).toContain('<output>serverfinal</output>');
		expect(calls).toEqual(['server']);
		function NoServerSnapshot() {
			return Server.createElement(
				'output',
				null,
				Server.useSyncExternalStore(subscribe, client, undefined, storeSlot),
			);
		}
		expect(Server.renderToString(NoServerSnapshot).html).toContain('<output>client</output>');
		expect(calls).toEqual(['server', 'client']);
	});

	it('keeps universal authored previews separate from the trailing slot', async () => {
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'hook-value',
			bindings: [['value', 0]],
		});
		const Preview = defineUniversalComponent('object', (props: { value: string }) =>
			universalValue(plan, [String(useUniversalDeferredValue(props.value, undefined, 'preview'))]),
		);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		root.render(Preview, { value: 'final' });
		expect(container.children[0].props.value).toBe('undefined');
		for (let index = 0; index < 12; index++) await Promise.resolve();
		expect(container.children[0].props.value).toBe('final');
		root.unmount();
	});

	it('retains the universal implicit slot fallback for an uncompiled server getter', () => {
		const calls: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'hook-value',
			bindings: [['value', 0]],
		});
		const Reader = defineUniversalComponent('object', () => {
			const value = useUniversalSyncExternalStore(
				() => () => {},
				() => {
					calls.push('client');
					return 'client';
				},
				() => {
					calls.push('server');
					return 'server';
				},
			);
			return universalValue(plan, [value]);
		});
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		root.render(Reader, undefined);
		expect(container.children[0].props.value).toBe('client');
		expect(calls).toContain('client');
		expect(calls).not.toContain('server');
		root.unmount();
	});
});
