import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, hydrateRoot, type Root } from 'octane';
import { renderToString } from 'octane/server';
import { prerender } from 'octane/static';
import { createScope, query, type Scope } from 'octane/signals';
import { act, mount, type MountResult } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { deferred } from './_server-stream.js';
import * as client from './_fixtures/native-read-collection.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/native-read-collection.tsrx',
	{ compileOptions: { nativeReads: true } },
);

describe('compiled component invocation native reads', () => {
	const scopes: Scope[] = [];
	let rendered: MountResult | undefined;

	afterEach(() => {
		rendered?.unmount();
		rendered = undefined;
		const inspections = scopes.map((scope) => scope.inspect());
		try {
			for (const scope of inspections) {
				for (const node of scope.nodes) {
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
		return { scope, count$: scope.signal$('count', 1), body$: scope.signal$('body', 10) };
	}

	for (const [label, Reader] of [
		['root', client.DefaultReader],
		['child', client.ChildDefaults],
	] as const) {
		it(`updates a ${label} parameter default and a separate body read`, () => {
			const model = state$('compiled-collection-default-' + label);
			rendered = mount(Reader, model);
			const host = rendered.find('p');
			flushSync(() => model.count$.set(2));
			expect(rendered.find('p')).toBe(host);
			expect(host.textContent).toBe('2:10');
			flushSync(() => model.body$.set(11));
			expect(host.textContent).toBe('2:11');
		});
	}

	for (const [label, Reader] of [
		['function', client.FunctionReader],
		['arrow', client.ArrowReader],
		['ordinary component', client.PlainReader],
	] as const) {
		it(`updates setup reads in a ${label} returning an intermediate element`, () => {
			const model = state$('compiled-collection-indirect-' + label);
			rendered = mount(Reader, model);
			flushSync(() => model.count$.set(3));
			expect(rendered.find('p').textContent).toBe('3');
		});
	}

	it('drops unused dependencies after a successful conditional render', () => {
		const model = state$('compiled-collection-conditional');
		rendered = mount(client.ConditionalReader, { ...model, enabled: true });
		rendered.update(client.ConditionalReader, { ...model, enabled: false });
		flushSync(() => model.count$.set(4));
		expect(rendered.find('p').textContent).toBe('idle');
		expect(model.scope.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
	});

	it('keeps sibling reads live across props updates and retires only disabled readers', () => {
		const model = state$('compiled-collection-siblings');
		const parentInput$ = model.scope.signal$('parent-input', 20);
		const parent$ = model.scope.derived$('parent', () => parentInput$.get() * 2);
		let props = {
			parent$,
			left$: model.count$,
			right$: model.body$,
			leftEnabled: true,
			rightEnabled: true,
			tick: 0,
		};
		rendered = mount(client.CollectionPanel, props);
		const hosts = rendered.findAll('output');
		function expectPanel(values: readonly string[]) {
			const outputs = rendered!.findAll('output');
			expect(outputs.map((host) => host.textContent)).toEqual(values);
			for (let index = 0; index < hosts.length; index++) expect(outputs[index]).toBe(hosts[index]);
			expect(rendered!.find('section').getAttribute('data-tick')).toBe(String(props.tick));
		}
		expectPanel(['40', '1:1', '10:10']);
		for (let tick = 1; tick <= 8; tick++) {
			props = { ...props, tick };
			rendered.update(client.CollectionPanel, props);
			expectPanel(['40', '1:1', '10:10']);
		}
		flushSync(() => model.count$.set(2));
		expectPanel(['40', '2:2', '10:10']);
		flushSync(() => parentInput$.set(21));
		expectPanel(['42', '2:2', '10:10']);
		flushSync(() => model.body$.set(11));
		expectPanel(['42', '2:2', '11:11']);

		props = { ...props, leftEnabled: false, tick: 9 };
		rendered.update(client.CollectionPanel, props);
		expectPanel(['42', 'idle', '11:11']);
		expect(model.scope.inspect().nodes.find((node) => node.key === 'count')!.subscribers).toBe(0);
		flushSync(() => model.count$.set(3));
		expectPanel(['42', 'idle', '11:11']);
		flushSync(() => model.body$.set(12));
		expectPanel(['42', 'idle', '12:12']);
		flushSync(() => parentInput$.set(22));
		expectPanel(['44', 'idle', '12:12']);

		props = { ...props, rightEnabled: false, tick: 10 };
		rendered.update(client.CollectionPanel, props);
		expectPanel(['44', 'idle', 'idle']);
		expect(model.scope.inspect().nodes.find((node) => node.key === 'body')!.subscribers).toBe(0);
		flushSync(() => {
			model.count$.set(4);
			model.body$.set(13);
		});
		expectPanel(['44', 'idle', 'idle']);
		flushSync(() => parentInput$.set(23));
		expectPanel(['46', 'idle', 'idle']);

		props = { ...props, leftEnabled: true, tick: 11 };
		rendered.update(client.CollectionPanel, props);
		expectPanel(['46', '4:4', 'idle']);
		flushSync(() => model.count$.set(5));
		expectPanel(['46', '5:5', 'idle']);
		props = { ...props, rightEnabled: true, tick: 12 };
		rendered.update(client.CollectionPanel, props);
		expectPanel(['46', '5:5', '13:13']);
	});

	it('restores collection after derived reads and permits untracked lifecycle reads and writes', () => {
		const model = state$('compiled-collection-derived-lifecycle');
		const parameter$ = model.scope.derived$('parameter', () => model.count$.get() * 2);
		const callback$ = model.scope.signal$('callback', 0);
		const observations: string[] = [];
		const props = {
			count$: parameter$,
			body$: model.body$,
			log(value: string) {
				observations.push(value);
				callback$.set(callback$.get() + 1);
			},
		};
		rendered = mount(client.HydrationDefault, props);
		const output = rendered.find('output');
		expect(output.textContent).toBe('2:10');
		expect(observations).toEqual(['2:10:2:10:live:2']);
		flushSync(() => model.count$.set(2));
		expect(output.textContent).toBe('4:10');
		flushSync(() => model.body$.set(11));
		expect(rendered.find('output')).toBe(output);
		expect(output.textContent).toBe('4:11');
		expect(observations).toEqual(['2:10:2:10:live:2', '4:10:4:10:live:4', '4:11:4:11:live:4']);
		expect(callback$.get()).toBe(3);
		expect(model.scope.inspect().nodes.find((node) => node.key === 'callback')!.subscribers).toBe(
			0,
		);
		expect(() => callback$.set(50)).not.toThrow();
		expect(output.textContent).toBe('4:11');
		flushSync(() => model.body$.set(12));
		expect(output.textContent).toBe('4:12');
		expect(callback$.get()).toBe(51);
	});

	it('serializes parameter and body sources for both root and child invocations', () => {
		const model = state$('compiled-collection-server-defaults');
		for (const Reader of [server.DefaultReader, server.ChildDefaults]) {
			const output = renderToString(Reader, model);
			expect(output.html).toContain('>1:10</p>');
			expect(output.signals?.scopes).toEqual([model.scope.serialize()]);
		}
	});

	it('serializes an ordinary component and intermediate JSX return', () => {
		const model = state$('compiled-collection-server-indirect');
		for (const Reader of [server.FunctionReader, server.ArrowReader, server.PlainReader]) {
			const output = renderToString(Reader, model);
			expect(output.html).toContain('>1</p>');
			expect(output.signals?.scopes[0]?.entries.map((node) => node.key)).toEqual(['count']);
		}
	});

	it('seeds only the completed render-phase replay', () => {
		const first = state$('compiled-collection-server-first');
		const final = state$('compiled-collection-server-final');
		const output = renderToString(server.ReplayReader, {
			first$: first.count$,
			final$: final.count$,
		});
		expect(output.html).toContain('>1</p>');
		expect(output.signals?.scopes.map((scope) => scope.scopeKey)).toEqual([
			'compiled-collection-server-final',
		]);
	});

	it('retries a pending resource parameter before serializing the accepted value', async () => {
		const model = state$('compiled-collection-server-pending');
		const pending = deferred<string>();
		const request = query('compiled-collection-server-request', () => pending.promise);
		const value$ = model.scope.asyncSignal$('value', () => request(undefined));
		const outputPromise = prerender(server.PendingDefault, { value$ });
		await act(() => pending.resolve('settled'));
		const output = await outputPromise;
		expect(output.html).toContain('>settled</p>');
		expect(output.signals?.scopes[0]?.entries.map((node) => node.key)).toEqual(['value']);
	});

	it('adopts a parameter seed before catching up to live state without replacing hosts', () => {
		const model = state$('compiled-collection-hydration');
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.HydrationDefault, model).html;
		const output = container.querySelector('output')!;
		const input = container.querySelector('input')!;
		input.value = 'typed before hydration';
		input.focus();
		input.setSelectionRange(2, 7);
		model.count$.set(2);
		model.body$.set(11);
		const observations: string[] = [];
		let root: Root | undefined;
		try {
			flushSync(() => {
				root = hydrateRoot(container, client.HydrationDefault, {
					...model,
					log: (value) => observations.push(value),
				});
				expect(output.textContent).toBe('1:10');
				expect(model.count$.get()).toBe(2);
			});
			expect(observations).toEqual(['1:10:1:10:live:2', '2:11:2:11:live:2']);
			expect(container.querySelector('output')).toBe(output);
			expect(output.textContent).toBe('2:11');
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('typed before hydration');
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
		} finally {
			root?.unmount();
			container.remove();
		}
	});
});
