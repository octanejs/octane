import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { createScope } from 'octane/signals';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';

const SOURCE = `
export function Single(props) @{
	<div id="single-style" style={{ color: props.color }}>{'single'}</div>
}

export function Multiple(props) @{
	<div
		id="multiple-style"
		style={{ position: 'absolute', margin: '4px', marginTop: props.top, color: props.color, '--accent': props.accent }}
	>{'multiple'}</div>
}

export function AllDynamic(props) @{
	<div id="all-dynamic-style" style={{ left: props.left, opacity: props.opacity }} />
}
`;

function compiled(source: string, id: string, mode: 'client' | 'server', dev = false) {
	return loadCompiledFixtureSource(source, {
		id,
		mode,
		compileOptions: { hmr: false, dev },
	});
}

describe('inline object styles', () => {
	it.each([false, true])('updates one and several dynamic values in dev=%s', (dev) => {
		const client = compiled(SOURCE, `object-literals-${dev}.tsrx`, 'client', dev);
		const single = mount(client.Single, { color: 'red' });
		const one = single.find('#single-style') as HTMLElement;
		expect(one.style.color).toBe('red');
		single.update(client.Single, { color: 'blue' });
		expect(single.find('#single-style')).toBe(one);
		expect(one.style.color).toBe('blue');
		single.update(client.Single, { color: null });
		expect(one.style.color).toBe('');
		single.unmount();

		const multiple = mount(client.Multiple, { top: 8, color: 'red !important', accent: 10 });
		const many = multiple.find('#multiple-style') as HTMLElement;
		expect(many.style.position).toBe('absolute');
		expect(many.style.marginTop).toBe('8px');
		expect(many.style.marginRight).toBe('4px');
		expect(many.style.color).toBe('red');
		expect(many.style.getPropertyPriority('color')).toBe('important');
		expect(many.style.getPropertyValue('--accent')).toBe('10');

		multiple.update(client.Multiple, { top: 12, color: 'blue', accent: 12 });
		expect(multiple.find('#multiple-style')).toBe(many);
		expect(many.style.marginTop).toBe('12px');
		expect(many.style.marginRight).toBe('4px');
		expect(many.style.color).toBe('blue');
		expect(many.style.getPropertyPriority('color')).toBe('');
		expect(many.style.getPropertyValue('--accent')).toBe('12');

		multiple.update(client.Multiple, { top: null, color: null, accent: null });
		expect(many.style.marginTop).toBe('');
		expect(many.style.marginRight).toBe('4px');
		expect(many.style.color).toBe('');
		expect(many.style.getPropertyValue('--accent')).toBe('');
		multiple.unmount();

		const allDynamic = mount(client.AllDynamic, { left: 5, opacity: 0.5 });
		const both = allDynamic.find('#all-dynamic-style') as HTMLElement;
		expect(both.style.left).toBe('5px');
		expect(both.style.opacity).toBe('0.5');
		allDynamic.update(client.AllDynamic, { left: 0, opacity: 1 });
		expect(allDynamic.find('#all-dynamic-style')).toBe(both);
		expect(both.style.left).toBe('0px');
		expect(both.style.opacity).toBe('1');
		allDynamic.unmount();
	});

	it('preserves a static shorthand when dynamic values start out empty', () => {
		const client = compiled(SOURCE, 'object-literal-empty.tsrx', 'client');
		const root = mount(client.Multiple, { top: null, color: null, accent: null });
		const element = root.find('#multiple-style') as HTMLElement;
		expect(element.style.marginTop).toBe('4px');
		expect(element.style.marginRight).toBe('4px');
		root.update(client.Multiple, { top: 8, color: 'blue', accent: 'active' });
		expect(element.style.marginTop).toBe('8px');
		root.update(client.Multiple, { top: null, color: null, accent: null });
		expect(element.style.marginTop).toBe('');
		expect(element.style.marginRight).toBe('4px');
		root.unmount();
	});

	it('evaluates grouped values at the style attribute in authored order', () => {
		const source = `
export function App(props) @{
	<div
		id="ordered-style"
		data-before={props.read('before')}
		style={{ position: 'absolute', left: props.read('left'), color: props.read('color') }}
		data-after={props.read('after')}
	>{'order'}</div>
}`;
		const client = compiled(source, 'object-literal-order.tsrx', 'client');
		const calls: string[] = [];
		const read = (key: string) => {
			calls.push(key);
			return key === 'left' ? 8 : key === 'color' ? 'red' : key;
		};
		const root = mount(client.App, { read });
		const element = root.find('#ordered-style') as HTMLElement;
		expect(calls).toEqual(['before', 'left', 'color', 'after']);
		expect(element.style.left).toBe('8px');
		expect(element.style.color).toBe('red');
		calls.length = 0;
		root.update(client.App, { read });
		expect(calls).toEqual(['before', 'left', 'color', 'after']);
		root.unmount();
	});

	it('evaluates the full suffix before writing a changed property', () => {
		const source = `
export function App(props) @{
	<div id="atomic-style" style={{ left: props.read('left'), color: props.read('color') }} />
}`;
		const client = compiled(source, 'object-literal-throw.tsrx', 'client');
		const root = mount(client.App, {
			read: (name: string) => (name === 'left' ? 5 : 'red'),
		});
		const element = root.find('#atomic-style') as HTMLElement;
		try {
			expect(() =>
				root.update(client.App, {
					read: (name: string) => {
						if (name === 'color') throw new Error('late style value');
						return 12;
					},
				}),
			).toThrow('late style value');
			expect(element.style.left).toBe('5px');
			expect(element.style.color).toBe('red');
		} finally {
			root.unmount();
		}
	});

	it.each(['null', 'false', 'true', "''"])(
		'accepts leading nonbaked literal %s ahead of a live property',
		(literal) => {
			const source = `
export function App(props) @{
	<div id="nonbaked-style" style={{ color: ${literal}, left: props.left }} />
}`;
			const client = compiled(source, `object-literal-${literal}.tsrx`, 'client');
			const root = mount(client.App, { left: 5 });
			const element = root.find('#nonbaked-style') as HTMLElement;
			expect(element.style.left).toBe('5px');
			expect(element.style.color).toBe('');
			root.update(client.App, { left: 12 });
			expect(element.style.left).toBe('12px');
			expect(element.style.color).toBe('');
			root.unmount();
		},
	);

	it('keeps a baked numeric zero before a dynamic property', () => {
		const source = `
export function App(props) @{
	<div id="zero-style" style={{ opacity: 0, left: props.left }} />
}`;
		const client = compiled(source, 'object-literal-zero.tsrx', 'client');
		const root = mount(client.App, { left: 5 });
		const element = root.find('#zero-style') as HTMLElement;
		expect(element.style.opacity).toBe('0');
		expect(element.style.left).toBe('5px');
		root.update(client.App, { left: 12 });
		expect(element.style.opacity).toBe('0');
		expect(element.style.left).toBe('12px');
		root.unmount();
	});

	it.each([false, true])('server markup hydrates a complete dynamic style in dev=%s', (dev) => {
		const id = `object-literal-hydration-${dev}.tsrx`;
		const source = `
export function App(props) @{
	<div id="multiple-style" style={{ position: 'absolute', top: props.top, color: props.color, '--accent': props.accent }} />
}`;
		const server = compiled(source, id, 'server', dev);
		const client = compiled(source, id, 'client', dev);
		const props = { top: 8, color: 'red', accent: 10 };
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.App, props).html;
		document.body.appendChild(container);
		const element = container.querySelector('#multiple-style') as HTMLElement;
		const original = element.getAttribute('style');
		expect(element.style.position).toBe('absolute');
		expect(element.style.top).toBe('8px');
		expect(element.style.color).toBe('red');
		expect(element.style.getPropertyValue('--accent')).toBe('10');
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, client.App, props);
			flushSync(() => {});
			expect(container.querySelector('#multiple-style')).toBe(element);
			expect(element.getAttribute('style')).toBe(original);
			expect(element.style.top).toBe('8px');
			expect(
				warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
			).toEqual([]);
			flushSync(() => root!.render(client.App, { top: null, color: 'blue', accent: null }));
			expect(container.querySelector('#multiple-style')).toBe(element);
			expect(element.style.top).toBe('');
			expect(element.style.color).toBe('blue');
			expect(element.style.getPropertyValue('--accent')).toBe('');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});

	it('hydrates an all-dynamic style with a fixed identifier and literal suffix', () => {
		const source = `
const display = 'block';
export function App(props) @{
	<div id="interleaved-style" style={{ left: props.left, display, right: props.right, opacity: 0.5 }} />
}`;
		const id = 'object-literal-interleaved-hydration.tsrx';
		const server = compiled(source, id, 'server');
		const client = compiled(source, id, 'client');
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.App, { left: 2, right: 3 }).html;
		document.body.appendChild(container);
		const element = container.querySelector('#interleaved-style') as HTMLElement;
		const original = element.getAttribute('style');
		expect(element.style.left).toBe('2px');
		expect(element.style.right).toBe('3px');
		expect(element.style.display).toBe('block');
		expect(element.style.opacity).toBe('0.5');
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, client.App, { left: 2, right: 3 });
			flushSync(() => {});
			expect(container.querySelector('#interleaved-style')).toBe(element);
			expect(element.getAttribute('style')).toBe(original);
			expect(
				warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
			).toEqual([]);
			flushSync(() => root!.render(client.App, { left: 5, right: 7 }));
			expect(element.style.left).toBe('5px');
			expect(element.style.right).toBe('7px');
			expect(element.style.display).toBe('block');
			expect(element.style.opacity).toBe('0.5');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});

	it('keeps dynamic shorthand and longhand update precedence', () => {
		const source = `
export function App(props) @{
	<div id="overlapping-style" style={{ margin: props.margin, marginTop: props.top }} />
}`;
		const client = compiled(source, 'object-literal-shorthand.tsrx', 'client');
		const root = mount(client.App, { margin: '4px', top: '8px' });
		const element = root.find('#overlapping-style') as HTMLElement;
		expect(element.style.marginTop).toBe('8px');
		root.update(client.App, { margin: '12px', top: '8px' });
		expect(element.style.marginTop).toBe('12px');
		expect(element.style.marginRight).toBe('12px');
		root.update(client.App, { margin: '12px', top: '2px' });
		expect(element.style.marginTop).toBe('2px');
		root.unmount();
	});

	it('handles fixed identifiers, interleaved dynamics, and literal suffixes', () => {
		const source = `
const display = 'block';
export function First(props) @{
	<div id="first-style" style={{ display, color: props.color }} />
}
export function Last(props) @{
	<div id="last-style" style={{ left: props.left, right: props.right, display }} />
}
export function Middle(props) @{
	<div id="middle-style" style={{ left: props.left, display: props.display, right: props.right }} />
}
export function LiteralLast(props) @{
	<div id="literal-last-style" style={{ left: props.left, right: props.right, display: 'grid' }} />
}`;
		const client = compiled(source, 'object-literal-interleaved.tsrx', 'client');
		const first = mount(client.First, { color: 'red' });
		const firstElement = first.find('#first-style') as HTMLElement;
		expect(firstElement.style.display).toBe('block');
		expect(firstElement.style.color).toBe('red');
		first.update(client.First, { color: 'blue' });
		expect(firstElement.style.display).toBe('block');
		expect(firstElement.style.color).toBe('blue');
		first.unmount();

		const last = mount(client.Last, { left: 4, right: 5 });
		const lastElement = last.find('#last-style') as HTMLElement;
		expect(lastElement.style.left).toBe('4px');
		expect(lastElement.style.right).toBe('5px');
		expect(lastElement.style.display).toBe('block');
		last.update(client.Last, { left: 8, right: 9 });
		expect(lastElement.style.left).toBe('8px');
		expect(lastElement.style.right).toBe('9px');
		expect(lastElement.style.display).toBe('block');
		last.unmount();

		const middle = mount(client.Middle, { left: 1, display: 'flex', right: 2 });
		const middleElement = middle.find('#middle-style') as HTMLElement;
		expect(middleElement.style.display).toBe('flex');
		middle.update(client.Middle, { left: 3, display: 'grid', right: 4 });
		expect(middleElement.style.left).toBe('3px');
		expect(middleElement.style.display).toBe('grid');
		expect(middleElement.style.right).toBe('4px');
		middle.unmount();

		const suffix = mount(client.LiteralLast, { left: 1, right: 2 });
		const suffixElement = suffix.find('#literal-last-style') as HTMLElement;
		expect(suffixElement.style.display).toBe('grid');
		suffix.update(client.LiteralLast, { left: 3, right: 4 });
		expect(suffixElement.style.left).toBe('3px');
		expect(suffixElement.style.right).toBe('4px');
		expect(suffixElement.style.display).toBe('grid');
		suffix.unmount();
	});

	it('keeps colliding CSS names on the generic ordered path', () => {
		const source = `
export function App(props) @{
	<div id="alias-style" style={{ fontSize: props.first, 'font-size': props.second, cssFloat: props.floatFirst, float: props.floatSecond }} />
}`;
		const client = compiled(source, 'object-literal-alias.tsrx', 'client');
		const root = mount(client.App, {
			first: 12,
			second: 16,
			floatFirst: 'left',
			floatSecond: 'right',
		});
		const element = root.find('#alias-style') as HTMLElement;
		expect(element.style.fontSize).toBe('16px');
		expect(element.style.cssFloat).toBe('right');
		root.update(client.App, {
			first: 14,
			second: 18,
			floatFirst: 'none',
			floatSecond: 'left',
		});
		expect(element.style.fontSize).toBe('18px');
		expect(element.style.cssFloat).toBe('left');
		root.unmount();
	});

	it('keeps accessor, spread, and static suffix observations intact', () => {
		const source = `
export function App(props) @{
	<div
		id="generic-style"
		style={{
			position: 'absolute',
			...props.extra,
			get color() { props.observe('getter'); return props.color; },
			width: '12px',
		}}
	/>
}`;
		const client = compiled(source, 'object-literal-generic.tsrx', 'client');
		const observed: string[] = [];
		const root = mount(client.App, {
			color: 'red',
			extra: new Proxy(
				{ opacity: 0.5 },
				{
					ownKeys(target) {
						observed.push('spread');
						return Reflect.ownKeys(target);
					},
				},
			),
			observe: (event: string) => observed.push(event),
		});
		const element = root.find('#generic-style') as HTMLElement;
		expect(observed).toEqual(['spread', 'getter']);
		expect(element.style.opacity).toBe('0.5');
		expect(element.style.color).toBe('red');
		expect(element.style.width).toBe('12px');
		root.unmount();
	});

	it('samples an actual native signal read inside a dynamic style object', () => {
		const source = `
import 'octane/signals';
export function App(props) @{
	<div id="sampled-style" style={{ left: props.scope.get(props.left$), color: props.color }} />
}`;
		const client = loadCompiledFixtureSource(source, {
			id: 'object-literal-native-read.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const scope = createScope({ scopeKey: 'object-literal-native-read' });
		const left$ = scope.signal$('left', 5);
		const root = mount(client.App, { scope, left$, color: 'red' });
		const element = root.find('#sampled-style') as HTMLElement;
		try {
			expect(element.style.left).toBe('5px');
			flushSync(() => scope.set(left$, 12));
			expect(root.find('#sampled-style')).toBe(element);
			expect(element.style.left).toBe('12px');
			expect(element.style.color).toBe('red');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});
});
