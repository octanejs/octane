import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from 'octane';
import { act, flushEffects, mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import { parseModule as parseNativeModule } from '../src/compiler/parser.node.js';
import { parseModule as parseJavaScriptModule } from '../src/compiler/parser.browser.js';
import { App, DirectCall, ReturnApp, WrappedApp } from './_fixtures/arrow-boundary.tsrx';

const server = loadServerFixture('packages/octane/tests/_fixtures/arrow-boundary.tsrx');
const runtimeForms = [
	['concise arrow', App, 'App'],
	['return arrow', ReturnApp, 'ReturnApp'],
	['template-body control', WrappedApp, 'WrappedApp'],
] as const;

function deferred() {
	let resolve!: (value: string) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<string>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe('module-level arrows returning @try', () => {
	const boundary = `@try {
		if (props.fail) throw new Error(props.label);
		<p>{props.label as string}</p>
	} @pending { <p>loading</p> } @catch (error) { <p>{String(error)}</p> }`;
	const forms = [
		['concise', boundary],
		['parenthesized concise', `(${boundary})`],
		['explicit return', `{ return ${boundary}; }`],
		['parenthesized return', `{ return (${boundary}); }`],
	] as const;

	it.each(forms)('parses and renders the %s form on client and server', (_name, body) => {
		const source = `export const Content = (props: { label: string; fail?: boolean }) => ${body};`;
		for (const parse of [parseNativeModule, parseJavaScriptModule]) {
			// Both parser frontends must preserve the directive as the returned expression.
			const ast = parse(source, 'arrow-form.tsrx') as any;
			const arrow = ast.body[0].declaration.declarations[0].init;
			const returned =
				arrow.body.type === 'BlockStatement' ? arrow.body.body[0].argument : arrow.body;
			expect(returned.type).toBe('JSXTryExpression');
		}
		for (const mode of ['client', 'server'] as const) {
			const compiled = loadCompiledFixtureSource(source, { id: 'arrow-form.tsrx', mode });
			if (mode === 'server') {
				expect(renderToString(compiled.Content, { label: 'ready' }).html).toContain('ready');
				expect(renderToString(compiled.Content, { label: 'offline', fail: true }).html).toContain(
					'Error: offline',
				);
			} else {
				const view = mount(compiled.Content, { label: 'ready' });
				try {
					expect(view.find('p').textContent).toBe('ready');
					view.update(compiled.Content, { label: 'offline', fail: true });
					expect(view.find('p').textContent).toBe('Error: offline');
				} finally {
					view.unmount();
				}
			}
		}
	});

	it('keeps arrow lexical this when a returned boundary is called with another receiver', () => {
		const source = `const owner = {
		label: 'lexical',
		make(suffix: string) {
			return () => @try { <p>{this.label + arguments[0]}</p> } @catch (error) { <p>failed</p> };
		}
	};
	const render = owner.make(' value');
	export function App() @{ <main>{render.call({ label: 'wrong' })}</main> }`;
		for (const mode of ['client', 'server'] as const) {
			const compiled = loadCompiledFixtureSource(source, { id: 'arrow-lexical.tsrx', mode });
			if (mode === 'server') {
				expect(renderToString(compiled.App, {}).html).toContain('lexical value');
			} else {
				const view = mount(compiled.App, {});
				try {
					expect(view.find('p').textContent).toBe('lexical value');
				} finally {
					view.unmount();
				}
			}
		}
	});

	it.each(runtimeForms)(
		'%s suspends, catches, resets with latest props, and cleans up',
		async (_name, Component) => {
			const events: string[] = [];
			const first = deferred();
			const view = mount(Component, { label: 'first', promise: first.promise, events });
			try {
				expect(view.find('.pending').textContent).toBe('first: loading');
				await act(() => first.reject(new Error('offline')));
				expect(view.find('.retry').textContent).toContain('offline');
				const next = deferred();
				view.update(Component, { label: 'second', promise: next.promise, events });
				expect(view.findAll('.pending')).toHaveLength(0);
				view.click('.retry');
				expect(view.find('.pending').textContent).toBe('second: loading');
				await act(() => next.resolve('recovered'));
				expect(view.find('.value').textContent).toBe('second: recovered');
				expect(view.findAll('.retry')).toHaveLength(0);
				flushEffects();
				expect(events).toEqual(['mount: recovered']);
			} finally {
				view.unmount();
				flushEffects();
			}
			expect(events).toEqual(['mount: recovered', 'cleanup: recovered']);
		},
	);

	it.each(runtimeForms)('%s ignores a promise settling after unmount', async (_name, Component) => {
		const request = deferred();
		const events: string[] = [];
		const view = mount(Component, { label: 'pending', promise: request.promise, events });
		expect(view.find('.pending').textContent).toBe('pending: loading');
		view.unmount();
		await act(() => request.resolve('too late'));
		expect(view.container.innerHTML).toBe('');
		expect(events).toEqual([]);
	});

	it.each(runtimeForms)(
		'%s discards failed child state and mounts fresh state on reset',
		(_name, Component) => {
			const events: string[] = [];
			const view = mount(Component, { label: 'first', value: 'one', events });
			try {
				flushEffects();
				const input = view.find('input') as HTMLInputElement;
				input.value = 'edited';
				view.click('.increment');
				view.update(Component, { label: 'failed', fail: true, events });
				flushEffects();
				expect(view.find('.retry').textContent).toContain('unavailable');
				expect(input.isConnected).toBe(false);
				expect(events).toEqual(['mount: one', 'cleanup: one']);
				view.update(Component, { label: 'recovered', value: 'two', events });
				view.click('.retry');
				flushEffects();
				expect(view.find('.value').textContent).toBe('recovered: two');
				expect(view.find('.increment').textContent).toBe('0');
				expect(view.find('input')).not.toBe(input);
				expect((view.find('input') as HTMLInputElement).value).toBe('draft');
				expect(events).toEqual(['mount: one', 'cleanup: one', 'mount: two']);
			} finally {
				view.unmount();
				flushEffects();
			}
			expect(events).toEqual(['mount: one', 'cleanup: one', 'mount: two', 'cleanup: two']);
		},
	);

	it.each([
		...runtimeForms.map(([name, Component]) => [name, Component] as const),
		['direct call', DirectCall],
	] as const)('preserves state and host identity on updates through a %s', (_name, Component) => {
		const view = mount(Component, { label: 'first', value: 'one' });
		try {
			const input = view.find('input') as HTMLInputElement;
			input.value = 'edited';
			view.click('.increment');
			view.update(Component, { label: 'second', value: 'two' });
			expect(view.find('.value').textContent).toBe('second: two');
			expect(view.find('.increment').textContent).toBe('1');
			expect(view.find('input')).toBe(input);
			expect(input.value).toBe('edited');
		} finally {
			view.unmount();
		}
	});

	it.each(runtimeForms)('%s server-renders each boundary arm', (_name, _Component, exportName) => {
		expect(renderToString(server[exportName], { label: 'server', value: 'ready' }).html).toContain(
			'server: ready',
		);
		expect(
			renderToString(server[exportName], { label: 'server', promise: new Promise(() => {}) }).html,
		).toContain('server: loading');
		expect(renderToString(server[exportName], { label: 'server', fail: true }).html).toContain(
			'unavailable',
		);
	});

	it.each(runtimeForms)(
		'%s hydrates existing hosts and keeps events and updates live',
		(_name, Component, exportName) => {
			const props = { label: 'server', value: 'ready' };
			const container = document.createElement('div');
			container.innerHTML = renderToString(server[exportName], props).html;
			document.body.append(container);
			const input = container.querySelector('input')!;
			input.value = 'edited before hydration';
			const errors: unknown[] = [];
			const root = hydrateRoot(container, Component, props, {
				onRecoverableError: (error) => errors.push(error),
			});
			try {
				flushSync(() => {});
				expect(container.querySelector('input')).toBe(input);
				flushSync(() => (container.querySelector('.increment') as HTMLButtonElement).click());
				flushSync(() => root.render(Component, { label: 'client', value: 'updated' }));
				expect(container.querySelector('.value')!.textContent).toBe('client: updated');
				expect(container.querySelector('.increment')!.textContent).toBe('1');
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('edited before hydration');
				expect(errors).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);
});
