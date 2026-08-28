import { afterEach, describe, expect, it } from 'vitest';
import * as client from '../src/runtime.js';
import * as server from '../src/runtime.server.js';
import { createScope, query, type Scope, type SignalHandle } from '../src/signals/index.js';
import { act, mount, type MountResult } from './_helpers.js';
import { deferred } from './_server-stream.js';

// Exercise the actual renderer ABI without a compiler transform. The compiled
// companion suite covers the same authoring patterns through .tsrx fixtures.
client.enableNativeReadCollection();
server.enableNativeReadCollection();

describe('native reads throughout component invocation', () => {
	const scopes: Scope[] = [];
	let rendered: MountResult | undefined;

	afterEach(() => {
		rendered?.unmount();
		rendered = undefined;
		const inspections = scopes.map((scope) => scope.inspect());
		try {
			for (const scope of inspections) {
				for (const node of scope.nodes) {
					// Producer dependencies outlive the UI. Unmount must remove every
					// subscriber beyond those data-graph edges.
					const dependents = inspections
						.flatMap((scope) => scope.nodes)
						.filter((other) =>
							other.dependencies.some(
								(dep) => dep.scopeKey === scope.scopeKey && dep.key === node.key,
							),
						).length;
					expect(node.subscribers).toBe(dependents);
				}
			}
		} finally {
			for (const scope of scopes) scope.dispose();
			scopes.length = 0;
		}
	});

	function state$(scopeKey: string) {
		const scope = createScope({ scopeKey });
		scopes.push(scope);
		return {
			scope,
			count$: scope.signal$('count', 1),
			body$: scope.signal$('body', 10),
		};
	}

	it('combines parameter reads with reads inside the compiled body scope', () => {
		const model = state$('collection-abi-defaults');
		function Reader(
			{ count$, body$, value = count$.get() }: typeof model & { value?: number },
			owner: client.Scope,
		) {
			const token = client.beginNativeReadScope(owner);
			try {
				return client.createElement('p', null, value + ':' + body$.get());
			} finally {
				client.endNativeReadScope(token, true);
			}
		}
		rendered = mount(Reader, model);
		const host = rendered.find('p');
		expect(host.textContent).toBe('1:10');
		client.flushSync(() => model.count$.set(2));
		expect(rendered.find('p')).toBe(host);
		expect(host.textContent).toBe('2:10');
		client.flushSync(() => model.body$.set(11));
		expect(host.textContent).toBe('2:11');
	});

	it('updates ordinary components that return a previously constructed element', () => {
		const model = state$('collection-abi-indirect');
		function Reader({ count$ }: { count$: SignalHandle<number> }) {
			const value = count$.get();
			const output = client.createElement('p', null, String(value));
			return output;
		}
		rendered = mount(Reader, model);
		client.flushSync(() => model.count$.set(3));
		expect(rendered.find('p').textContent).toBe('3');
	});

	it('retires dependencies after an ordinary component stops reading them', () => {
		const model = state$('collection-abi-conditional');
		function Reader({ count$, enabled }: { count$: SignalHandle<number>; enabled: boolean }) {
			return client.createElement('p', null, enabled ? String(count$.get()) : 'idle');
		}
		rendered = mount(Reader, { ...model, enabled: true });
		client.flushSync(() => model.count$.set(2));
		expect(rendered.find('p').textContent).toBe('2');
		rendered.update(Reader, { ...model, enabled: false });
		expect(model.scope.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
		client.flushSync(() => model.count$.set(3));
		expect(rendered.find('p').textContent).toBe('idle');
	});

	it('collects parameter reads in a lightweight child and preserves its host', () => {
		const model = state$('collection-abi-lightweight');
		const childTemplate = client.template('<p> </p>');
		const parentTemplate = client.template('<section></section>');
		function Child(
			{ count$, value = count$.get() }: typeof model & { value?: number },
			owner: client.Scope,
		) {
			const token = client.beginNativeReadScope(owner);
			try {
				let bag = owner.slots[0] as { a: Text } | undefined;
				if (bag === undefined) {
					const host = client.clone(childTemplate);
					bag = client.bag1(owner, host, host.firstChild);
				}
				client.setText(bag!.a, String(value));
			} finally {
				client.endNativeReadScope(token, true);
			}
		}
		function Parent(props: typeof model, owner: client.Scope) {
			let bag = owner.slots[0] as { a: Element } | undefined;
			if (bag === undefined) {
				const host = client.clone(parentTemplate);
				bag = client.bag1(owner, host, host);
			}
			client.componentSlotLite(owner, 1, bag!.a, Child, props);
		}
		rendered = mount(Parent, model);
		const host = rendered.find('p');
		client.flushSync(() => model.count$.set(4));
		expect(rendered.find('p')).toBe(host);
		expect(host.textContent).toBe('4');
	});

	it('leaves an unread component and imperative reads unsubscribed', () => {
		const model = state$('collection-abi-unread');
		rendered = mount(() => client.createElement('p', null, 'unchanged'));
		expect(model.count$.get()).toBe(1);
		client.flushSync(() => model.count$.set(2));
		expect(rendered.find('p').textContent).toBe('unchanged');
		expect(model.scope.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
	});

	it('keeps accepted output when a parameter read suspends and retries with fresh data', async () => {
		const model = state$('collection-abi-pending-default');
		const pending = deferred<string>();
		const request = query('collection-abi-pending-request', (key: number) =>
			key === 1 ? Promise.resolve('ready') : pending.promise,
		);
		const value$ = model.scope.asyncSignal$('value', () => request(model.count$.get()));
		await act(() => {});
		function Reader({ value = value$.get() }: { value?: string }) {
			return client.createElement('p', null, value);
		}
		rendered = mount(Reader, {});
		const host = rendered.find('p');
		expect(host.textContent).toBe('ready');
		client.flushSync(() => model.count$.set(2));
		expect(rendered.find('p')).toBe(host);
		expect(host.textContent).toBe('ready');
		await act(() => pending.resolve('settled'));
		expect(rendered.find('p')).toBe(host);
		expect(host.textContent).toBe('settled');
	});

	it('restores imperative reads and writes after a throwing parameter initializer', () => {
		const model = state$('collection-abi-throwing-default');
		function readThenThrow(): never {
			model.count$.get();
			throw new Error('parameter failed');
		}
		function Reader({ value = readThenThrow() }: { value?: number }) {
			return client.createElement('p', null, String(value));
		}
		expect(() => mount(Reader, {})).toThrow('parameter failed');
		expect(() => model.count$.set(5)).not.toThrow();
		expect(model.count$.get()).toBe(5);
		expect(model.scope.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
	});

	it('serializes both parameter and body reads from the completed server invocation', () => {
		const model = state$('collection-abi-server-defaults');
		function Reader(
			{ count$, body$, value = count$.get() }: typeof model & { value?: number },
			owner: Parameters<typeof server.beginNativeReadScope>[0],
		) {
			const token = server.beginNativeReadScope(owner);
			try {
				return '<p>' + value + ':' + body$.get() + '</p>';
			} finally {
				server.endNativeReadScope(token, true);
			}
		}
		const output = server.renderToString(Reader, model);
		expect(output.html).toContain('>1:10</p>');
		expect(output.signals?.scopes).toEqual([model.scope.serialize()]);
	});

	it('collects server children while normalizing an ordinary root return', () => {
		const model = state$('collection-abi-server-normalization');
		function Child({ count$, value = count$.get() }: typeof model & { value?: number }) {
			const output = '<p>' + value + '</p>';
			return output;
		}
		function Parent(props: typeof model) {
			return server.createElement('section', null, server.createElement(Child, props));
		}
		const output = server.renderToString(Parent, model);
		expect(output.html).toContain('>1</p>');
		expect(output.signals?.scopes[0]?.entries.map((node) => node.key)).toEqual(['count']);
	});

	it('discards native reads from a server render-phase pass that is replayed', () => {
		const first = state$('collection-abi-server-first');
		const final = state$('collection-abi-server-final');
		const slot = Symbol('server replay');
		function Reader() {
			const [ready, setReady] = server.useState(false, slot);
			const value = (ready ? final.count$ : first.count$).get();
			if (!ready) setReady(true);
			return server.createElement('p', null, String(value));
		}
		const output = server.renderToString(Reader);
		expect(output.html).toContain('>1</p>');
		expect(output.signals?.scopes.map((scope) => scope.scopeKey)).toEqual([
			'collection-abi-server-final',
		]);
	});

	it('settles a resource read in a server parameter initializer without retaining failed seeds', async () => {
		const model = state$('collection-abi-server-pending');
		const pending = deferred<string>();
		const request = query('collection-abi-server-pending-request', () => pending.promise);
		const value$ = model.scope.asyncSignal$('value', () => request(undefined));
		function Reader({ value = value$.get() }: { value?: string }) {
			return server.createElement('p', null, value);
		}
		const outputPromise = server.prerender(Reader, {});
		pending.resolve('server ready');
		const output = await outputPromise;
		expect(output.html).toContain('>server ready</p>');
		expect(output.signals?.scopes[0]?.entries.map((node) => node.key)).toEqual(['value']);
	});
});
