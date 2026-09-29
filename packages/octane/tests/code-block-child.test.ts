import { describe, it, expect } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from 'octane/compiler';
import { mount, nextPaint } from './_helpers';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	RenderOnlyChild,
	MultipleBlocks,
	EmptyBlockDropped,
	SetupBearingChild,
	ConditionalHooksInSetupBearingChild,
	TemplateIfHooksInSetupBearingChild,
	ExplicitSetupBearingChild,
	ReturnedSetupBearingChild,
	StoredSetupBearingChild,
	CodeOnlyChild,
	SvgSetupBearingChild,
	BranchReadsChildLocal,
	BranchReadsShadowingChildLocal,
	ListReadsChildLocal,
	BranchReadsNestedChildLocals,
	HandlerReadsChildLocal,
	ChildShadowsStableSetter,
} from './_fixtures/code-block-child.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/code-block-child.tsrx';

describe('@{ } at JSX child position', () => {
	it('render-only @{} renders its JSX root as a sibling', () => {
		const r = mount(RenderOnlyChild);
		const spans = Array.from(r.find('.outer').children) as HTMLElement[];
		expect(spans.map((s) => s.className)).toEqual(['lead', 'block', 'tail']);
		expect(r.find('.block').textContent).toBe('block-body');
		r.unmount();
	});

	it('multiple @{} siblings each render their root in source order', () => {
		const r = mount(MultipleBlocks);
		const items = Array.from(r.findAll('li')) as HTMLElement[];
		expect(items.map((i) => i.className)).toEqual(['a', 'b', 'c']);
		expect(items.map((i) => i.textContent)).toEqual(['one', 'two', 'three']);
		r.unmount();
	});

	it('empty @{} is silently dropped (siblings sit adjacent)', () => {
		const r = mount(EmptyBlockDropped);
		const kids = Array.from(r.find('div').children) as HTMLElement[];
		expect(kids.map((k) => k.className)).toEqual(['before', 'after']);
		r.unmount();
	});

	it('lowers setup-bearing syntax to the explicit scoped-child form', () => {
		const direct = 'export function App() @{ <div>@{ let name = 1; <b>name: {name}</b> }</div> }';
		const explicit =
			'export function App() @{ <div>{() => @{ let name = 1; <b>name: {name}</b> }}</div> }';

		for (const mode of ['client', 'server'] as const) {
			expect(compile(direct, 'App.tsrx', { mode }).code).toBe(
				compile(explicit, 'App.tsrx', { mode }).code,
			);
		}
	});

	it('runs setup in a scoped child and preserves it across parent updates', () => {
		const r = mount(SetupBearingChild, { label: 'first' });
		const action = r.find('#setup-action') as HTMLButtonElement;

		expect(Array.from(r.find('.setup-children').children, (child) => child.id)).toEqual([
			'setup-before',
			'setup-action',
			'setup-after',
		]);
		expect(action.textContent).toBe('first:0');

		r.click('#setup-action');
		expect(action.textContent).toBe('first:1');

		r.update(SetupBearingChild, { label: 'second' });
		expect(r.find('#setup-action')).toBe(action);
		expect(action.textContent).toBe('second:1');
		r.unmount();
	});

	it('preserves conditional hook state and lifecycle in a scoped child', async () => {
		const log: string[] = [];
		const r = mount(ConditionalHooksInSetupBearingChild, { enabled: true, log });
		const action = r.find('#conditional-hook-action') as HTMLButtonElement;

		await nextPaint();
		expect(action.textContent).toBe('count:0');
		expect(log).toEqual(['create:0']);

		r.click('#conditional-hook-action');
		await nextPaint();
		expect(action.textContent).toBe('count:1');
		expect(log).toEqual(['create:0', 'cleanup:0', 'create:1']);

		r.update(ConditionalHooksInSetupBearingChild, { enabled: false, log });
		await nextPaint();
		expect(r.find('#conditional-hook-action')).toBe(action);
		expect(action.textContent).toBe('disabled');
		expect(log).toEqual(['create:0', 'cleanup:0', 'create:1', 'cleanup:1']);

		r.update(ConditionalHooksInSetupBearingChild, { enabled: true, log });
		await nextPaint();
		expect(r.find('#conditional-hook-action')).toBe(action);
		expect(action.textContent).toBe('count:1');
		expect(log).toEqual(['create:0', 'cleanup:0', 'create:1', 'cleanup:1', 'create:1']);

		r.unmount();
		await nextPaint();
		expect(log.at(-1)).toBe('cleanup:1');
	});

	it('keeps @if hook state scoped to its branch inside a scoped child', () => {
		const r = mount(TemplateIfHooksInSetupBearingChild);
		const action = r.find('#template-if-action');

		r.click('#template-if-action');
		expect(action.textContent).toBe('count:1');

		r.click('#template-if-toggle');
		expect(r.findAll('#template-if-action')).toHaveLength(0);

		r.click('#template-if-toggle');
		const remountedAction = r.find('#template-if-action');
		expect(remountedAction).not.toBe(action);
		expect(remountedAction.textContent).toBe('count:0');

		r.unmount();
	});

	it.each([
		['template body', 'SetupBearingChild', SetupBearingChild],
		['explicit scoped child', 'ExplicitSetupBearingChild', ExplicitSetupBearingChild],
		['returned JSX', 'ReturnedSetupBearingChild', ReturnedSetupBearingChild],
		['stored JSX value', 'StoredSetupBearingChild', StoredSetupBearingChild],
	])('server-renders and hydrates a setup-bearing child in %s', (_case, exportName, Component) => {
		const server = loadServerFixture(FIXTURE);
		const { html } = ServerRuntime.renderToString(server[exportName], {
			label: 'server',
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const action = container.querySelector('#setup-action') as HTMLButtonElement;

		const root = hydrateRoot(container, Component, { label: 'server' });
		flushSync(() => {});
		expect(container.querySelector('#setup-action')).toBe(action);
		expect(action.textContent).toBe('server:0');

		flushSync(() => action.click());
		expect(action.textContent).toBe('server:1');

		root.render(Component, { label: 'client' });
		flushSync(() => {});
		expect(container.querySelector('#setup-action')).toBe(action);
		expect(action.textContent).toBe('client:1');
		root.unmount();
		container.remove();
	});

	it('runs a code-only child scope without rendering an element', () => {
		const seen: string[] = [];
		const r = mount(CodeOnlyChild, {
			label: 'first',
			observe: (value: string) => seen.push(value),
		});
		const before = r.find('#code-only-before');
		const after = r.find('#code-only-after');

		expect(seen).toEqual(['first']);
		expect(Array.from(r.find('#code-only-children').children, (child) => child.id)).toEqual([
			'code-only-before',
			'code-only-after',
		]);

		r.update(CodeOnlyChild, {
			label: 'second',
			observe: (value: string) => seen.push(value),
		});
		expect(seen).toEqual(['first', 'second']);
		expect(r.find('#code-only-before')).toBe(before);
		expect(r.find('#code-only-after')).toBe(after);
		r.unmount();
	});

	it('server-renders and hydrates a code-only child scope', () => {
		const server = loadServerFixture(FIXTURE);
		const serverSeen: string[] = [];
		const { html } = ServerRuntime.renderToString(server.CodeOnlyChild, {
			label: 'server',
			observe: (value: string) => serverSeen.push(value),
		});
		expect(serverSeen).toEqual(['server']);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const before = container.querySelector('#code-only-before');
		const after = container.querySelector('#code-only-after');
		const clientSeen: string[] = [];
		const root = hydrateRoot(container, CodeOnlyChild, {
			label: 'hydrate',
			observe: (value: string) => clientSeen.push(value),
		});
		flushSync(() => {});

		expect(clientSeen).toEqual(['hydrate']);
		expect(container.querySelector('#code-only-before')).toBe(before);
		expect(container.querySelector('#code-only-after')).toBe(after);
		expect(container.querySelector('#code-only-children')?.children).toHaveLength(2);

		root.render(CodeOnlyChild, {
			label: 'client',
			observe: (value: string) => clientSeen.push(value),
		});
		flushSync(() => {});
		expect(clientSeen).toEqual(['hydrate', 'client']);
		expect(container.querySelector('#code-only-before')).toBe(before);
		expect(container.querySelector('#code-only-after')).toBe(after);
		root.unmount();
		container.remove();
	});

	it('preserves the parent SVG namespace in a scoped child', () => {
		const server = loadServerFixture(FIXTURE);
		const { html } = ServerRuntime.renderToString(server.SvgSetupBearingChild, {
			radius: 4,
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const circle = container.querySelector('#setup-circle');

		const root = hydrateRoot(container, SvgSetupBearingChild, { radius: 4 });
		flushSync(() => {});
		expect(container.querySelector('#setup-circle')).toBe(circle);
		expect(circle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(circle?.getAttribute('r')).toBe('4');
		expect(circle?.getAttribute('data-diameter')).toBe('8');

		root.render(SvgSetupBearingChild, { radius: 6 });
		flushSync(() => {});
		expect(container.querySelector('#setup-circle')).toBe(circle);
		expect(circle?.getAttribute('r')).toBe('6');
		expect(circle?.getAttribute('data-diameter')).toBe('12');
		root.unmount();
		container.remove();
	});
});

describe('scoped child locals reach its control-flow arms', () => {
	const steps: Array<[string, boolean]> = [
		['second', true],
		['third', false],
		['fourth', false],
		['fifth', true],
	];

	// The rendered arm's tag and text, ignoring hydration markers.
	const arm = (host: Element | null) =>
		Array.from(host?.children ?? [], (child) => `${child.localName}:${child.textContent}`);

	it('reads a child local in @if/@else arms across updates and branch switches', () => {
		const r = mount(BranchReadsChildLocal, { value: 'first', enabled: true });
		expect(arm(r.find('.branch-child'))).toEqual(['b:first']);
		for (const [value, enabled] of steps) {
			r.update(BranchReadsChildLocal, { value, enabled });
			expect(arm(r.find('.branch-child'))).toEqual([`${enabled ? 'b' : 'i'}:${value}`]);
		}
		r.unmount();
	});

	it('server-renders and hydrates arms that read a child local', () => {
		const server = loadServerFixture(FIXTURE);
		const { html } = ServerRuntime.renderToString(server.BranchReadsChildLocal, {
			value: 'first',
			enabled: true,
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const original = container.querySelector('.branch-child b');
		expect(original?.textContent).toBe('first');

		const root = hydrateRoot(container, BranchReadsChildLocal, { value: 'first', enabled: true });
		flushSync(() => {});
		expect(container.querySelector('.branch-child b')).toBe(original);

		root.render(BranchReadsChildLocal, { value: 'second', enabled: true });
		flushSync(() => {});
		expect(container.querySelector('.branch-child b')).toBe(original);
		expect(original?.textContent).toBe('second');

		root.render(BranchReadsChildLocal, { value: 'third', enabled: false });
		flushSync(() => {});
		expect(arm(container.querySelector('.branch-child'))).toEqual(['i:third']);
		root.unmount();
		container.remove();
	});

	it('keeps a child local distinct from the parent binding it shadows', () => {
		const r = mount(BranchReadsShadowingChildLocal, { value: 'first', enabled: true });
		expect(arm(r.find('.shadow-child'))).toEqual(['em:outer', 'b:first']);
		for (const [value, enabled] of steps) {
			r.update(BranchReadsShadowingChildLocal, { value, enabled });
			expect(arm(r.find('.shadow-child'))).toEqual(['em:outer', `${enabled ? 'b' : 'i'}:${value}`]);
		}
		r.unmount();
	});

	it('reads a child local in keyed @for rows', () => {
		const r = mount(ListReadsChildLocal, { items: ['a', 'b'], loud: false });
		const texts = () => r.findAll('.list-child li').map((li) => li.textContent);
		expect(texts()).toEqual(['a.', 'b.']);

		const [first] = r.findAll('.list-child li');
		r.update(ListReadsChildLocal, { items: ['a', 'b', 'c'], loud: true });
		expect(texts()).toEqual(['a!', 'b!', 'c!']);
		expect(r.findAll('.list-child li')[0]).toBe(first);
		r.unmount();
	});

	it('reads locals from every enclosing scoped child in a nested arm', () => {
		const r = mount(BranchReadsNestedChildLocals, { value: 'ab', enabled: true });
		expect(r.find('.nested-child b').textContent).toBe('ab:AB');

		r.update(BranchReadsNestedChildLocals, { value: 'cd', enabled: true });
		expect(r.find('.nested-child b').textContent).toBe('cd:CD');

		r.update(BranchReadsNestedChildLocals, { value: 'ef', enabled: false });
		expect(r.findAll('.nested-child b')).toHaveLength(0);

		r.update(BranchReadsNestedChildLocals, { value: 'gh', enabled: true });
		expect(r.find('.nested-child b').textContent).toBe('gh:GH');
		r.unmount();
	});

	it('runs an event handler that reads a child local', () => {
		const log: string[] = [];
		const r = mount(HandlerReadsChildLocal, { value: 'first', log });
		r.click('.handler-child-action');
		expect(log).toEqual(['first', 'click']);

		r.update(HandlerReadsChildLocal, { value: 'second', log });
		r.click('.handler-child-action');
		expect(log).toEqual(['first', 'click', 'second', 'click']);
		r.unmount();
	});

	it('follows a changing handler that shadows a stable parent setter', () => {
		const calls: string[] = [];
		const r = mount(ChildShadowsStableSetter, { handler: () => calls.push('first') });
		r.click('.shadow-setter-action');
		expect(calls).toEqual(['first']);

		r.update(ChildShadowsStableSetter, { handler: () => calls.push('second') });
		r.click('.shadow-setter-action');
		expect(calls).toEqual(['first', 'second']);
		expect(r.find('.shadow-setter-count').textContent).toBe('count:0');
		r.unmount();
	});
});
