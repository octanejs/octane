import { describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import {
	StaticStringStyle,
	StaticObjectStyle,
	DynamicObjectStyle,
	DynamicStringStyle,
	ImportantStyle,
	CustomPropStyle,
	PerRowStyle,
	ScopedSingle,
	ScopedReuse,
	ScopedOther,
	ScopedMultiClass,
	ScopedNested,
	UnscopedLookalike,
	ScopedDynamic,
	ScopedToggle,
	ScopedPlusInlineStyle,
	StyleAtTop,
	ScopedHover,
	ScopedFocusWithin,
	ScopedMedia,
	ScopedKeyframes,
	ScopedGlobal,
	ScopedGlobalTag,
} from './_fixtures/style.tsrx';

const MIXED_INLINE_STYLE_SOURCE = `
	export function MixedStyle(props) @{
		<div
			id="mixed-inline-style"
			style={{
				position: 'absolute',
				display: 'block',
				width: 120,
				opacity: 0.5,
				'--fixed': 12,
				color: props.color,
			}}
		>
			{'mixed'}
		</div>
	}

	export function MixedLengthStyle(props) @{
		<div
			id="mixed-inline-length"
			style={{ position: 'absolute', display: 'block', marginTop: props.offset }}
		>
			{'length'}
		</div>
	}

	export function MixedCustomStyle(props) @{
		<div
			id="mixed-inline-custom"
			style={{ position: 'absolute', display: 'block', '--accent': props.accent }}
		>
			{'custom'}
		</div>
	}

	export function MixedSvgStyle(props) @{
		<svg>
			<rect
				id="mixed-inline-svg-style"
				style={{ fill: 'red', opacity: 0.5, stroke: props.stroke }}
			/>
		</svg>
	}
`;

function loadMixedInlineStyle(source: string, id: string, mode: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(source, {
		id,
		mode,
		compileOptions: { hmr: false, dev: false },
	});
}

// Helper: find the module-level <style data-octane> tag for a given hash
// and return its CSS text. Tests use this to assert how @tsrx/core's
// stylesheet pipeline rewrote the source CSS (which selectors got hashed,
// which got passed through, where `:global` opens a hole, etc.).
function styleSheetTextFor(el: Element): string {
	// Walk up to find the class name carrying the tsrx- hash, then look up the
	// injected style tag containing that hash.
	const hashClass = Array.from(el.classList).find((c) => c.startsWith('tsrx-'));
	if (!hashClass) throw new Error('element has no tsrx-<hash> class');
	const sheets = Array.from(
		document.head.querySelectorAll('style[data-octane]'),
	) as HTMLStyleElement[];
	for (const s of sheets) {
		if (s.textContent && s.textContent.includes(hashClass)) return s.textContent;
	}
	throw new Error(`no injected style tag found for ${hashClass}`);
}

describe('style prop — static forms', () => {
	it('inlines a static string style into the template (no runtime setStyle)', () => {
		const r = mount(StaticStringStyle);
		const div = r.find('div') as HTMLElement;
		// The exact normalization differs by engine — check parsed CSSOM, not the raw string.
		expect(div.style.color).toBe('red');
		expect(div.style.padding).toBe('4px');
		r.unmount();
	});

	it('inlines a static object literal as a "k: v; k: v" attribute', () => {
		const r = mount(StaticObjectStyle);
		const div = r.find('#box') as HTMLElement;
		expect(div.style.backgroundColor).toBe('red');
		expect(div.style.textAlign).toBe('center');
		// Sanity: it landed in the HTML attribute, not via a runtime call.
		expect(div.getAttribute('style')).toContain('background-color');
		r.unmount();
	});
});

describe('style prop — mixed static and dynamic inline objects', () => {
	it('keeps mixed inline style literals, units, priorities, custom properties, and removals', () => {
		const client = loadMixedInlineStyle(MIXED_INLINE_STYLE_SOURCE, 'mixed-inline-style.tsrx');
		const root = mount(client.MixedStyle, { color: 'red !important' });
		const element = root.find('#mixed-inline-style') as HTMLElement;
		expect(element.style.position).toBe('absolute');
		expect(element.style.display).toBe('block');
		expect(element.style.width).toBe('120px');
		expect(element.style.opacity).toBe('0.5');
		expect(element.style.color).toBe('red');
		expect(element.style.getPropertyPriority('color')).toBe('important');
		expect(element.style.getPropertyValue('--fixed')).toBe('12');

		root.update(client.MixedStyle, { color: 'blue' });
		expect(root.find('#mixed-inline-style')).toBe(element);
		expect(element.style.position).toBe('absolute');
		expect(element.style.display).toBe('block');
		expect(element.style.width).toBe('120px');
		expect(element.style.opacity).toBe('0.5');
		expect(element.style.color).toBe('blue');
		expect(element.style.getPropertyPriority('color')).toBe('');
		expect(element.style.getPropertyValue('--fixed')).toBe('12');

		root.update(client.MixedStyle, { color: null });
		expect(element.style.position).toBe('absolute');
		expect(element.style.width).toBe('120px');
		expect(element.style.color).toBe('');
		expect(element.style.getPropertyValue('--fixed')).toBe('12');
		root.unmount();

		const lengthRoot = mount(client.MixedLengthStyle, { offset: 8 });
		const length = lengthRoot.find('#mixed-inline-length') as HTMLElement;
		expect(length.style.position).toBe('absolute');
		expect(length.style.marginTop).toBe('8px');
		lengthRoot.update(client.MixedLengthStyle, { offset: null });
		expect(length.style.position).toBe('absolute');
		expect(length.style.marginTop).toBe('');
		lengthRoot.update(client.MixedLengthStyle, { offset: 0 });
		expect(length.style.marginTop).toBe('0px');
		lengthRoot.unmount();

		const customRoot = mount(client.MixedCustomStyle, { accent: 12 });
		const custom = customRoot.find('#mixed-inline-custom') as HTMLElement;
		expect(custom.style.getPropertyValue('--accent')).toBe('12');
		customRoot.update(client.MixedCustomStyle, { accent: undefined });
		expect(custom.style.position).toBe('absolute');
		expect(custom.style.getPropertyValue('--accent')).toBe('');
		customRoot.update(client.MixedCustomStyle, { accent: 'restored' });
		expect(custom.style.getPropertyValue('--accent')).toBe('restored');
		customRoot.unmount();
	});

	it.each([
		{ mode: 'production', dev: false },
		{ mode: 'development', dev: true },
	])('updates mixed inline style in $mode compiler output', ({ mode, dev }) => {
		const client = loadCompiledFixtureSource(MIXED_INLINE_STYLE_SOURCE, {
			id: `mixed-inline-style-${mode}.tsrx`,
			mode: 'client',
			compileOptions: { hmr: false, dev },
		});
		const root = mount(client.MixedLengthStyle, { offset: 8 });
		const element = root.find('#mixed-inline-length') as HTMLElement;
		expect(element.style.position).toBe('absolute');
		expect(element.style.display).toBe('block');
		expect(element.style.marginTop).toBe('8px');

		root.update(client.MixedLengthStyle, { offset: 12 });
		expect(root.find('#mixed-inline-length')).toBe(element);
		expect(element.style.position).toBe('absolute');
		expect(element.style.marginTop).toBe('12px');
		root.unmount();
	});

	it('preserves mixed inline style and neighboring expression evaluation order', () => {
		const source = `
			export function App(props) @{
				<div
					id="mixed-inline-style-evaluation-order"
					data-before={props.read('before')}
					style={{ position: 'absolute', color: props.read('style') }}
					data-after={props.read('after')}
				>
					{props.read('child') as string}
				</div>
			}
		`;
		const client = loadMixedInlineStyle(source, 'mixed-inline-style-evaluation-order.tsrx');
		const events: string[] = [];
		let color = 'red';
		const read = (name: string) => {
			events.push(name);
			return name === 'style' ? color : name;
		};
		const root = mount(client.App, { read });
		const element = root.find('#mixed-inline-style-evaluation-order') as HTMLElement;
		expect(events).toEqual(['child', 'before', 'style', 'after']);
		expect(element.style.position).toBe('absolute');
		expect(element.style.color).toBe('red');
		expect(element.textContent).toBe('child');

		events.length = 0;
		color = 'blue';
		root.update(client.App, { read });
		expect(events).toEqual(['child', 'before', 'style', 'after']);
		expect(element.style.position).toBe('absolute');
		expect(element.style.color).toBe('blue');
		root.unmount();
	});

	it.each([
		{
			shape: 'a static shorthand before a dynamic longhand',
			style: "{ margin: '4px', marginLeft: props.value }",
			initial: '8px',
			updated: '12px',
		},
		{
			shape: 'a dynamic longhand before a static shorthand',
			style: "{ marginLeft: props.value, margin: '4px' }",
			initial: '4px',
			updated: '12px',
		},
		{
			shape: 'a dynamic shorthand before a static longhand',
			style: "{ margin: props.value, marginLeft: '6px' }",
			initial: '6px',
			updated: '12px',
		},
	])('preserves mixed inline style order for $shape', ({ shape, style, initial, updated }) => {
		const source = `
			export function App(props) @{
				<div id="mixed-inline-style-order" style={${style}}>{'order'}</div>
			}
		`;
		const client = loadMixedInlineStyle(
			source,
			`mixed-inline-style-order-${shape.replaceAll(' ', '-')}.tsrx`,
		);
		const root = mount(client.App, { value: '8px' });
		const element = root.find('#mixed-inline-style-order') as HTMLElement;
		expect(element.style.marginLeft).toBe(initial);

		root.update(client.App, { value: '12px' });
		expect(root.find('#mixed-inline-style-order')).toBe(element);
		expect(element.style.marginLeft).toBe(updated);
		root.unmount();
	});

	it.each([
		{ shape: 'null', value: null },
		{ shape: 'undefined', value: undefined },
		{ shape: 'a boolean', value: true },
	])(
		'keeps static shorthand when the initial mixed inline style longhand is $shape',
		({ value }) => {
			const source = `
			export function App(props) @{
				<div
					id="mixed-inline-style-shorthand-null"
					style={{ margin: '4px', marginTop: props.value }}
				>
					{'shorthand'}
				</div>
			}
		`;
			const client = loadMixedInlineStyle(source, 'mixed-inline-style-shorthand-null.tsrx');
			const root = mount(client.App, { value });
			const element = root.find('#mixed-inline-style-shorthand-null') as HTMLElement;
			expect(element.style.marginTop).toBe('4px');
			expect(element.style.marginRight).toBe('4px');

			root.update(client.App, { value: 8 });
			expect(root.find('#mixed-inline-style-shorthand-null')).toBe(element);
			expect(element.style.marginTop).toBe('8px');
			expect(element.style.marginRight).toBe('4px');

			root.update(client.App, { value: null });
			expect(element.style.marginTop).toBe('');
			expect(element.style.marginRight).toBe('4px');
			root.unmount();
		},
	);

	it.each([
		{ shape: 'null', initial: 8, value: null },
		{ shape: 'a boolean', initial: 8, value: true },
		{ shape: 'null after a longhand matching its shorthand', initial: 4, value: null },
	])(
		'removes a stale mixed inline style longhand after committed content resuspends and retries with $shape',
		async ({ initial, value }) => {
			const source = `
			import { use } from 'octane';

			function Content(props) @{
				const text = use(props.promise);
				<span id="mixed-inline-style-retry-content">{text as string}</span>
			}

			function Panel(props) @{
				<section
					id="mixed-inline-style-retry-panel"
					style={{ margin: '4px', marginTop: props.value }}
				>
					<Content promise={props.promise} />
				</section>
			}

			export function App(props) @{
				<main>
					@try {
						<Panel value={props.value} promise={props.promise} />
					} @pending {
						<span id="mixed-inline-style-retry-pending">{'pending'}</span>
					}
				</main>
			}
		`;
			const client = loadMixedInlineStyle(source, 'mixed-inline-style-suspended-retry.tsrx');
			let resolve!: (text: string) => void;
			const promise = new Promise<string>((complete) => {
				resolve = complete;
			});
			const root = mount(client.App, { promise: Promise.resolve('initial'), value: initial });

			try {
				// Identity belongs to a committed primary. An initially suspended
				// mount can be abandoned on new inputs and is not a prior style write
				// that the next mount must clear.
				await act(() => {});
				expect(root.find('#mixed-inline-style-retry-content').textContent).toBe('initial');
				expect(root.findAll('#mixed-inline-style-retry-pending')).toHaveLength(0);
				const preserved = root.find('#mixed-inline-style-retry-panel') as HTMLElement;
				expect(preserved.style.marginTop).toBe(`${initial}px`);
				expect(preserved.style.marginRight).toBe('4px');

				// An urgent resuspension hides, but must not replace, the committed
				// panel. Its dynamic longhand still needs clearing on the same node.
				root.update(client.App, { promise, value: initial });
				expect(root.find('#mixed-inline-style-retry-pending').textContent).toBe('pending');
				expect(root.find('#mixed-inline-style-retry-panel')).toBe(preserved);
				expect(preserved.isConnected).toBe(true);
				expect(preserved.style.display).toBe('none');

				root.update(client.App, { promise, value });
				expect(root.find('#mixed-inline-style-retry-pending').textContent).toBe('pending');
				expect(root.find('#mixed-inline-style-retry-panel')).toBe(preserved);

				await act(() => resolve('resolved'));
				const panel = root.find('#mixed-inline-style-retry-panel') as HTMLElement;
				expect(panel).toBe(preserved);
				expect(root.find('#mixed-inline-style-retry-content').textContent).toBe('resolved');
				expect(root.findAll('#mixed-inline-style-retry-pending')).toHaveLength(0);
				expect(panel.style.display).toBe('');
				expect(panel.style.marginTop).toBe('');
				expect(panel.style.marginRight).toBe('4px');

				root.update(client.App, { promise, value: 12 });
				expect(root.find('#mixed-inline-style-retry-panel')).toBe(panel);
				expect(panel.style.marginTop).toBe('12px');
				expect(panel.style.marginRight).toBe('4px');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([
		{
			shape: 'duplicate names',
			style: "{ color: 'red', color: props.color, position: 'absolute' }",
		},
		{
			shape: 'normalized duplicate names',
			style: "{ backgroundColor: 'red', 'background-color': props.color }",
		},
		{
			shape: 'computed names',
			style: "{ position: 'absolute', [props.name]: props.color }",
		},
		{
			shape: 'spread overrides',
			style: "{ position: 'absolute', color: 'red', ...props.values, color: props.color }",
		},
	])('keeps mixed inline style $shape source ordered', ({ shape, style }) => {
		const source = `
			export function App(props) @{
				<div id="mixed-inline-style-unsafe" style={${style}}>{'unsafe'}</div>
			}
		`;
		const client = loadMixedInlineStyle(
			source,
			`mixed-inline-style-${shape.replaceAll(' ', '-')}.tsrx`,
		);
		const root = mount(client.App, {
			name: 'color',
			color: 'blue',
			values: { color: 'green' },
		});
		const element = root.find('#mixed-inline-style-unsafe') as HTMLElement;
		const property = shape === 'normalized duplicate names' ? 'backgroundColor' : 'color';
		expect(element.style[property]).toBe('blue');

		root.update(client.App, { name: 'color', color: 'purple', values: { color: 'orange' } });
		expect(root.find('#mixed-inline-style-unsafe')).toBe(element);
		expect(element.style[property]).toBe('purple');
		root.unmount();
	});

	it('keeps mixed inline style getter and proxy spread observations in source order', () => {
		const source = `
			export function App(props) @{
				<div
					id="mixed-inline-style-getters"
					style={{
						position: 'absolute',
						...props.values,
						get color() {
							props.observe('get:color');
							return props.color;
						},
					}}
				>
					{'getter'}
				</div>
			}
		`;
		const client = loadMixedInlineStyle(source, 'mixed-inline-style-getters.tsrx');
		const events: string[] = [];
		const values = new Proxy(
			{ display: 'block' },
			{
				ownKeys(target) {
					events.push('ownKeys');
					return Reflect.ownKeys(target);
				},
				getOwnPropertyDescriptor(target, key) {
					events.push(`descriptor:${String(key)}`);
					return Reflect.getOwnPropertyDescriptor(target, key);
				},
				get(target, key, receiver) {
					events.push(`get:${String(key)}`);
					return Reflect.get(target, key, receiver);
				},
			},
		);
		const observe = (event: string) => events.push(event);
		const root = mount(client.App, { color: 'red', observe, values });
		const element = root.find('#mixed-inline-style-getters') as HTMLElement;
		expect(events).toEqual(['ownKeys', 'descriptor:display', 'get:display', 'get:color']);
		expect(element.style.position).toBe('absolute');
		expect(element.style.display).toBe('block');
		expect(element.style.color).toBe('red');

		events.length = 0;
		root.update(client.App, { color: 'blue', observe, values });
		expect(events).toEqual([
			'ownKeys',
			'descriptor:display',
			'get:display',
			'get:color',
			'get:color',
		]);
		expect(root.find('#mixed-inline-style-getters')).toBe(element);
		expect(element.style.color).toBe('blue');
		root.unmount();
	});

	it('preserves mixed inline style precedence across neighboring host spreads', () => {
		const source = `
			export function App(props) @{
				<section>
					<div
						id="mixed-inline-style-spread-first"
						{...props.first}
						style={{ position: 'absolute', color: props.color }}
					/>
					<div
						id="mixed-inline-style-spread-last"
						style={{ position: 'absolute', color: props.color }}
						{...props.last}
					/>
				</section>
			}
		`;
		const client = loadMixedInlineStyle(source, 'mixed-inline-style-host-spreads.tsrx');
		const root = mount(client.App, {
			color: 'blue',
			first: { style: { color: 'green', display: 'grid' } },
			last: { style: { color: 'red', display: 'flex' } },
		});
		const before = root.find('#mixed-inline-style-spread-first') as HTMLElement;
		const after = root.find('#mixed-inline-style-spread-last') as HTMLElement;
		expect(before.style.color).toBe('blue');
		expect(before.style.position).toBe('absolute');
		expect(before.style.display).toBe('');
		expect(after.style.color).toBe('red');
		expect(after.style.position).toBe('');
		expect(after.style.display).toBe('flex');

		root.update(client.App, {
			color: 'purple',
			first: { style: { color: 'orange' } },
			last: { style: { color: 'yellow' } },
		});
		expect(before.style.color).toBe('purple');
		expect(after.style.color).toBe('yellow');
		expect(after.style.position).toBe('');
		root.unmount();
	});

	it('updates mixed inline style objects on SVG elements without replacing them', () => {
		const client = loadMixedInlineStyle(MIXED_INLINE_STYLE_SOURCE, 'mixed-inline-style-svg.tsrx');
		const root = mount(client.MixedSvgStyle, { stroke: 'blue' });
		const element = root.find('#mixed-inline-svg-style') as SVGElement;
		expect(element.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(element.style.fill).toBe('red');
		expect(element.style.stroke).toBe('blue');
		expect(element.style.opacity).toBe('0.5');

		root.update(client.MixedSvgStyle, { stroke: null });
		expect(root.find('#mixed-inline-svg-style')).toBe(element);
		expect(element.style.fill).toBe('red');
		expect(element.style.stroke).toBe('');
		expect(element.style.opacity).toBe('0.5');
		root.unmount();
	});

	it('restores mixed inline style when a transition suspends before committing', async () => {
		const source = `
			import { use, useState, useTransition } from 'octane';

			function Value(props) @{
				const value = use(props.load(props.step));
				<span id="mixed-inline-style-transition-value">{value as string}</span>
			}

			function Panel(props) @{
				<section
					id="mixed-inline-style-transition-panel"
					style={{ position: 'absolute', color: props.step === 0 ? 'red' : 'blue' }}
				>
					<Value load={props.load} step={props.step} />
				</section>
			}

			export function App(props) @{
				const [step, setStep] = useState(0);
				const [, start] = useTransition();
				<div>
					<button
						id="mixed-inline-style-transition-update"
						onClick={() => start(() => setStep(1))}
					>
						{'update'}
					</button>
					@try {
						<Panel load={props.load} step={step} />
					} @pending {
						<span id="mixed-inline-style-transition-fallback">{'pending'}</span>
					}
				</div>
			}
		`;
		const client = loadMixedInlineStyle(source, 'mixed-inline-style-transition.tsrx');
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((complete) => {
			resolve = complete;
		});
		const fulfilled = {
			status: 'fulfilled',
			value: 'initial',
			then(callback: (value: string) => void) {
				callback('initial');
			},
		};
		const root = mount(client.App, { load: (step: number) => (step === 0 ? fulfilled : pending) });
		await act(() => {});
		const panel = root.find('#mixed-inline-style-transition-panel') as HTMLElement;
		expect(panel.style.position).toBe('absolute');
		expect(panel.style.color).toBe('red');
		expect(root.find('#mixed-inline-style-transition-value').textContent).toBe('initial');

		root.click('#mixed-inline-style-transition-update');
		expect(root.find('#mixed-inline-style-transition-panel')).toBe(panel);
		expect(panel.style.position).toBe('absolute');
		expect(panel.style.color).toBe('red');
		expect(root.findAll('#mixed-inline-style-transition-fallback')).toEqual([]);

		await act(() => resolve('resolved'));
		expect(root.find('#mixed-inline-style-transition-panel')).toBe(panel);
		expect(panel.style.position).toBe('absolute');
		expect(panel.style.color).toBe('blue');
		expect(root.find('#mixed-inline-style-transition-value').textContent).toBe('resolved');
		root.unmount();
	});

	it('hydrates mixed inline style objects without disturbing static declarations or DOM', () => {
		const id = 'mixed-inline-style-hydration.tsrx';
		const server = loadMixedInlineStyle(MIXED_INLINE_STYLE_SOURCE, id, 'server');
		const client = loadMixedInlineStyle(MIXED_INLINE_STYLE_SOURCE, id, 'client');
		const initial = { color: 'red' };
		const { html } = ServerRuntime.renderToString(server.MixedStyle, initial);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const element = container.querySelector('#mixed-inline-style') as HTMLElement;
		const original = element.getAttribute('style');
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.MixedStyle, initial);
			flushSync(() => {});
			expect(container.querySelector('#mixed-inline-style')).toBe(element);
			expect(element.getAttribute('style')).toBe(original);
			expect(element.style.position).toBe('absolute');
			expect(element.style.width).toBe('120px');
			expect(element.style.color).toBe('red');
			expect(element.style.getPropertyValue('--fixed')).toBe('12');
			expect(
				warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
			).toEqual([]);

			flushSync(() => root!.render(client.MixedStyle, { color: 'blue' }));
			expect(container.querySelector('#mixed-inline-style')).toBe(element);
			expect(element.style.position).toBe('absolute');
			expect(element.style.display).toBe('block');
			expect(element.style.width).toBe('120px');
			expect(element.style.opacity).toBe('0.5');
			expect(element.style.color).toBe('blue');
			expect(element.style.getPropertyValue('--fixed')).toBe('12');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});

	it('hydrates a nested mixed inline style host beside a fully static sibling', () => {
		const source = `
			export function App(props) @{
				<main id="mixed-inline-style-nested-root">
					<div
						id="mixed-inline-style-nested-dynamic"
						style={{ position: 'absolute', color: props.color }}
					>
						{'dynamic'}
					</div>
					<div id="mixed-inline-style-nested-static" style={{ color: 'green' }}>
						{'static'}
					</div>
				</main>
			}
		`;
		const id = 'mixed-inline-style-nested-hydration.tsrx';
		const server = loadMixedInlineStyle(source, id, 'server');
		const client = loadMixedInlineStyle(source, id, 'client');
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, { color: 'red' }).html;
		document.body.appendChild(container);
		const parent = container.querySelector('#mixed-inline-style-nested-root');
		const dynamic = container.querySelector('#mixed-inline-style-nested-dynamic') as HTMLElement;
		const sibling = container.querySelector('#mixed-inline-style-nested-static') as HTMLElement;
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.App, { color: 'red' });
			flushSync(() => {});
			expect(container.querySelector('#mixed-inline-style-nested-root')).toBe(parent);
			expect(container.querySelector('#mixed-inline-style-nested-dynamic')).toBe(dynamic);
			expect(container.querySelector('#mixed-inline-style-nested-static')).toBe(sibling);
			expect(dynamic.style.position).toBe('absolute');
			expect(dynamic.style.color).toBe('red');
			expect(sibling.style.color).toBe('green');

			flushSync(() => root!.render(client.App, { color: 'blue' }));
			expect(container.querySelector('#mixed-inline-style-nested-dynamic')).toBe(dynamic);
			expect(container.querySelector('#mixed-inline-style-nested-static')).toBe(sibling);
			expect(dynamic.style.position).toBe('absolute');
			expect(dynamic.style.color).toBe('blue');
			expect(sibling.style.color).toBe('green');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it('rebuilds a hydrated branch that differs only in its fully static inline style', () => {
		const source = `
			export function App(props) @{
				@if (props.blue) {
					<div id="mixed-inline-style-static-branch" style={{ color: 'blue' }}>{'same'}</div>
				} @else {
					<div id="mixed-inline-style-static-branch" style={{ color: 'red' }}>{'same'}</div>
				}
			}
		`;
		const id = 'mixed-inline-style-static-branch-hydration.tsrx';
		const server = loadMixedInlineStyle(source, id, 'server');
		const client = loadMixedInlineStyle(source, id, 'client');
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, { blue: false }).html;
		document.body.appendChild(container);
		const original = container.querySelector('#mixed-inline-style-static-branch') as HTMLElement;
		expect(original.style.color).toBe('red');
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.App, { blue: true });
			flushSync(() => {});
			const replacement = container.querySelector(
				'#mixed-inline-style-static-branch',
			) as HTMLElement;
			expect(replacement).not.toBe(original);
			expect(replacement.style.color).toBe('blue');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});

	it('hydrates mixed inline style across fragment siblings and nested SVG hosts', () => {
		const source = `
			export function App(props) @{
				<>
					<div id="mixed-inline-style-fragment-static" style={{ color: 'green' }}>
						{'static'}
					</div>
					<div
						id="mixed-inline-style-fragment-html"
						style={{ position: 'absolute', color: props.color }}
					>
						{'dynamic'}
					</div>
					<svg id="mixed-inline-style-fragment-svg">
						<rect
							id="mixed-inline-style-fragment-rect"
							style={{ fill: 'red', stroke: props.color }}
						/>
					</svg>
				</>
			}
		`;
		const id = 'mixed-inline-style-fragment-hydration.tsrx';
		const server = loadMixedInlineStyle(source, id, 'server');
		const client = loadMixedInlineStyle(source, id, 'client');
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, { color: 'blue' }).html;
		document.body.appendChild(container);
		const sibling = container.querySelector('#mixed-inline-style-fragment-static') as HTMLElement;
		const dynamic = container.querySelector('#mixed-inline-style-fragment-html') as HTMLElement;
		const svg = container.querySelector('#mixed-inline-style-fragment-svg') as SVGElement;
		const rect = container.querySelector('#mixed-inline-style-fragment-rect') as SVGElement;
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.App, { color: 'blue' });
			flushSync(() => {});
			expect(container.querySelector('#mixed-inline-style-fragment-static')).toBe(sibling);
			expect(container.querySelector('#mixed-inline-style-fragment-html')).toBe(dynamic);
			expect(container.querySelector('#mixed-inline-style-fragment-svg')).toBe(svg);
			expect(container.querySelector('#mixed-inline-style-fragment-rect')).toBe(rect);
			expect(sibling.style.color).toBe('green');
			expect(dynamic.style.position).toBe('absolute');
			expect(dynamic.style.color).toBe('blue');
			expect(rect.style.fill).toBe('red');
			expect(rect.style.stroke).toBe('blue');

			flushSync(() => root!.render(client.App, { color: 'purple' }));
			expect(container.querySelector('#mixed-inline-style-fragment-static')).toBe(sibling);
			expect(container.querySelector('#mixed-inline-style-fragment-html')).toBe(dynamic);
			expect(container.querySelector('#mixed-inline-style-fragment-rect')).toBe(rect);
			expect(sibling.style.color).toBe('green');
			expect(dynamic.style.color).toBe('purple');
			expect(rect.style.fill).toBe('red');
			expect(rect.style.stroke).toBe('purple');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it.each([
		{ shape: 'a null dynamic value', value: null, suppressed: false },
		{ shape: 'an undefined dynamic value', value: undefined, suppressed: false },
		{ shape: 'a suppressed dynamic mismatch', value: null, suppressed: true },
	])('hydrates mixed inline style with $shape', ({ shape, value, suppressed }) => {
		const source = `
			export function App(props) @{
				<div
					id="mixed-inline-style-mismatch"
					${suppressed ? 'suppressHydrationWarning' : ''}
					style={{ position: 'absolute', width: 120, color: props.color }}
				>
					{'mismatch'}
				</div>
			}
		`;
		const id = `mixed-inline-style-hydration-${shape.replaceAll(' ', '-')}.tsrx`;
		const server = loadMixedInlineStyle(source, id, 'server');
		const client = loadMixedInlineStyle(source, id, 'client');
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, { color: 'red' }).html;
		document.body.appendChild(container);
		const element = container.querySelector('#mixed-inline-style-mismatch') as HTMLElement;
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.App, { color: value });
			flushSync(() => {});
			expect(container.querySelector('#mixed-inline-style-mismatch')).toBe(element);
			expect(element.style.position).toBe('absolute');
			expect(element.style.width).toBe('120px');
			expect(element.style.color).toBe(suppressed ? 'red' : '');
			if (suppressed) {
				expect(
					warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
				).toEqual([]);
			}

			flushSync(() => root!.render(client.App, { color: 'blue' }));
			expect(container.querySelector('#mixed-inline-style-mismatch')).toBe(element);
			expect(element.style.position).toBe('absolute');
			expect(element.style.width).toBe('120px');
			expect(element.style.color).toBe('blue');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});
});

describe('style prop — dynamic object form (setStyle)', () => {
	it('applies an initial object', () => {
		const r = mount(DynamicObjectStyle, { s: { color: 'red', 'font-size': '14px' } });
		const div = r.find('#dyn') as HTMLElement;
		expect(div.style.color).toBe('red');
		expect(div.style.fontSize).toBe('14px');
		r.unmount();
	});

	it('diffs object→object: only changed properties are touched', () => {
		const r = mount(DynamicObjectStyle, { s: { color: 'red', 'font-size': '14px' } });
		const div = r.find('#dyn') as HTMLElement;

		// Change color, keep font-size, add background-color.
		r.update(DynamicObjectStyle, {
			s: { color: 'blue', 'font-size': '14px', 'background-color': 'yellow' },
		});
		expect(div.style.color).toBe('blue');
		expect(div.style.fontSize).toBe('14px');
		expect(div.style.backgroundColor).toBe('yellow');

		// Drop background-color — removed property must clear from CSSOM.
		r.update(DynamicObjectStyle, { s: { color: 'blue', 'font-size': '14px' } });
		expect(div.style.backgroundColor).toBe('');
		r.unmount();
	});

	it('clears style when value goes null', () => {
		const r = mount(DynamicObjectStyle, { s: { color: 'red' } });
		const div = r.find('#dyn') as HTMLElement;
		expect(div.style.color).toBe('red');
		r.update(DynamicObjectStyle, { s: null });
		expect(div.style.color).toBe('');
		expect(div.getAttribute('style')).toBeFalsy();
		r.unmount();
	});

	it('transitions string → object (resets cssText, then sets per-prop)', () => {
		const r = mount(DynamicObjectStyle, { s: 'color: red; padding: 3px' } as any);
		const div = r.find('#dyn') as HTMLElement;
		expect(div.style.color).toBe('red');
		expect(div.style.padding).toBe('3px');
		r.update(DynamicObjectStyle, { s: { 'font-weight': 'bold' } });
		expect(div.style.color).toBe(''); // cleared by transition
		expect(div.style.padding).toBe('');
		expect(div.style.fontWeight).toBe('bold');
		r.unmount();
	});

	it('supports CSS custom properties (--vars)', () => {
		const r = mount(CustomPropStyle, { s: { '--primary': '#abc', '--gap': '8px' } });
		const div = r.find('#cp') as HTMLElement;
		expect(div.style.getPropertyValue('--primary')).toBe('#abc');
		expect(div.style.getPropertyValue('--gap')).toBe('8px');

		r.update(CustomPropStyle, { s: { '--primary': '#000' } });
		expect(div.style.getPropertyValue('--primary')).toBe('#000');
		expect(div.style.getPropertyValue('--gap')).toBe(''); // removed
		r.unmount();
	});

	it('handles "!important" priority on object values', () => {
		const r = mount(ImportantStyle, { s: { color: 'red !important' } });
		const div = r.find('#imp') as HTMLElement;
		expect(div.style.color).toBe('red');
		expect(div.style.getPropertyPriority('color')).toBe('important');

		r.update(ImportantStyle, { s: { color: 'blue' } });
		expect(div.style.color).toBe('blue');
		expect(div.style.getPropertyPriority('color')).toBe('');
		r.unmount();
	});
});

describe('style prop — dynamic string form', () => {
	it('sets cssText directly', () => {
		const r = mount(DynamicStringStyle, { s: 'color: green; padding: 7px' });
		const div = r.find('#ds') as HTMLElement;
		expect(div.style.color).toBe('green');
		expect(div.style.padding).toBe('7px');

		r.update(DynamicStringStyle, { s: 'margin: 3px' });
		expect(div.style.color).toBe(''); // cleared
		expect(div.style.margin).toBe('3px');
		r.unmount();
	});
});

describe('style prop — inside for-of', () => {
	it('each row keeps its own style across reorders', () => {
		const r = mount(PerRowStyle, {
			items: [
				{ id: 1, label: 'a', s: { color: 'red' } },
				{ id: 2, label: 'b', s: { color: 'blue' } },
				{ id: 3, label: 'c', s: { color: 'green' } },
			],
		});
		const get = (cls: string) => (r.find(cls) as HTMLElement).style.color;
		expect(get('.r-1')).toBe('red');
		expect(get('.r-2')).toBe('blue');
		expect(get('.r-3')).toBe('green');

		// Reverse the list — refs/styles travel with the keys.
		r.update(PerRowStyle, {
			items: [
				{ id: 3, label: 'c', s: { color: 'green' } },
				{ id: 2, label: 'b', s: { color: 'blue' } },
				{ id: 1, label: 'a', s: { color: 'red' } },
			],
		});
		expect(get('.r-1')).toBe('red');
		expect(get('.r-2')).toBe('blue');
		expect(get('.r-3')).toBe('green');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// Scoped <style> blocks + {style 'cls'}
// ---------------------------------------------------------------------------

function getInjectedStyles(): string[] {
	return Array.from(document.querySelectorAll('style[data-octane]')).map((s) =>
		s.getAttribute('data-octane')!,
	);
}

describe('scoped <style> blocks', () => {
	it('injects exactly one <style> tag per module-scoped css hash', () => {
		const before = new Set(getInjectedStyles());
		// First mount of ScopedSingle — inject happened at module init, so just
		// verify the tag is present and unique.
		const r1 = mount(ScopedSingle);
		const r2 = mount(ScopedSingle);
		const r3 = mount(ScopedReuse, { label: 'x' });
		const after = getInjectedStyles();
		// Same-component reuse must not duplicate the <style>.
		const counts: Record<string, number> = {};
		for (const id of after) counts[id] = (counts[id] || 0) + 1;
		for (const id of after) expect(counts[id]).toBe(1);
		// At least our newly-mounted components contributed hashes.
		expect(after.length).toBeGreaterThanOrEqual(before.size);
		r1.unmount();
		r2.unmount();
		r3.unmount();
	});

	it('applies the hash class so scoped selectors match the element', () => {
		const r = mount(ScopedSingle);
		const div = r.find('div');
		// The element has both the user class and the hash class.
		expect(div.classList.contains('row')).toBe(true);
		// hash class starts with "tsrx-" (provided by @tsrx/core)
		const hashClass = Array.from(div.classList).find((c) => c.startsWith('tsrx-'));
		expect(hashClass).toBeTruthy();

		// The computed style picks up the scoped rule.
		expect(getComputedStyle(div).color).toBe('rgb(10, 20, 30)');
		r.unmount();
	});

	it('different components get different hashes (scoping isolates CSS)', () => {
		const r1 = mount(ScopedSingle);
		const r2 = mount(ScopedOther);
		const h1 = Array.from(r1.find('div').classList).find((c) => c.startsWith('tsrx-'))!;
		const h2 = Array.from(r2.find('div').classList).find((c) => c.startsWith('tsrx-'))!;
		expect(h1).not.toBe(h2);
		expect(getComputedStyle(r1.find('div')).color).toBe('rgb(10, 20, 30)');
		expect(getComputedStyle(r2.find('div')).color).toBe('rgb(0, 200, 0)');
		r1.unmount();
		r2.unmount();
	});

	it('an element without {style ...} does NOT pick up scoped styles even if class name matches', () => {
		const r1 = mount(ScopedSingle); // ensures .row CSS is injected
		const r2 = mount(UnscopedLookalike); // has class="row" but no hash
		expect(r2.find('div').classList.contains('row')).toBe(true);
		// No hash class — scoped selector .row.tsrx-XXX doesn't match.
		expect(Array.from(r2.find('div').classList).some((c) => c.startsWith('tsrx-'))).toBe(false);
		// Computed color should be the browser default (NOT rgb(10,20,30)).
		expect(getComputedStyle(r2.find('div')).color).not.toBe('rgb(10, 20, 30)');
		r1.unmount();
		r2.unmount();
	});

	it('supports multiple classes in one {style "a b"}', () => {
		const r = mount(ScopedMultiClass);
		const div = r.find('div');
		expect(div.classList.contains('a')).toBe(true);
		expect(div.classList.contains('b')).toBe(true);
		expect(Array.from(div.classList).some((c) => c.startsWith('tsrx-'))).toBe(true);
		r.unmount();
	});

	it('descendant selectors only match opted-in descendants (hash gate)', () => {
		const r = mount(ScopedNested);
		const outer = r.find('div');
		const innerScoped = r.find('span.inner');
		const innerUnscoped = Array.from(outer.querySelectorAll('span')).find(
			(s) => !s.classList.contains('inner'),
		)!;

		// The hash on outer + .inner descendant with hash should match.
		expect(Array.from(innerScoped.classList).some((c) => c.startsWith('tsrx-'))).toBe(true);
		expect(getComputedStyle(innerScoped).fontWeight).toBe('bold');

		// New TSRX scoping (annotateWithHash) adds the hash to every element under
		// the component — the gate against cross-component leakage is the SELECTOR
		// (`.outer.<hash> .inner.<hash>`), not per-element opt-in. The unscoped
		// sibling DOES carry the hash but still doesn't match `.inner.<hash>`,
		// because it lacks the `.inner` class. Visual behavior is identical to the
		// old `{style 'cls'}` opt-in model.
		expect(Array.from(innerUnscoped.classList).some((c) => c.startsWith('tsrx-'))).toBe(true);
		expect(getComputedStyle(innerUnscoped).fontWeight).not.toBe('bold');
		r.unmount();
	});

	it('dynamic class via {style (expr)} concatenates hash at runtime', () => {
		const r = mount(ScopedDynamic, { cls: 'alpha' });
		const div = r.find('div');
		expect(div.classList.contains('alpha')).toBe(true);
		expect(getComputedStyle(div).color).toBe('rgb(11, 22, 33)');

		r.update(ScopedDynamic, { cls: 'beta' });
		expect(div.classList.contains('alpha')).toBe(false);
		expect(div.classList.contains('beta')).toBe(true);
		expect(getComputedStyle(div).color).toBe('rgb(44, 55, 66)');
		r.unmount();
	});

	it('toggles between scoped classes via state', () => {
		const r = mount(ScopedToggle);
		const lbl = r.find('#lbl');
		expect(lbl.classList.contains('off')).toBe(true);
		expect(getComputedStyle(lbl).color).toBe('rgb(8, 8, 8)');
		r.click('#t');
		expect(lbl.classList.contains('on')).toBe(true);
		expect(lbl.classList.contains('off')).toBe(false);
		expect(getComputedStyle(lbl).color).toBe('rgb(7, 7, 7)');
		r.unmount();
	});

	it('combines a scoped class with a dynamic inline style on the same element', () => {
		const r = mount(ScopedPlusInlineStyle, { s: { color: 'rgb(99, 99, 99)' } });
		const div = r.find('#mix') as HTMLElement;
		expect(div.classList.contains('base')).toBe(true);
		expect(div.style.color).toBe('rgb(99, 99, 99)');
		// Scoped padding rule still applies under the hash class.
		expect(getComputedStyle(div).padding).toBe('5px');

		r.update(ScopedPlusInlineStyle, { s: { color: 'rgb(11, 11, 11)' } });
		expect(div.style.color).toBe('rgb(11, 11, 11)');
		expect(getComputedStyle(div).padding).toBe('5px');
		r.unmount();
	});

	it('accepts <style> placed before any JSX', () => {
		const r = mount(StyleAtTop);
		const div = r.find('div');
		expect(div.classList.contains('top')).toBe(true);
		expect(getComputedStyle(div).color).toBe('rgb(1, 2, 3)');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// Verification: pseudo-classes, @media, @keyframes, :global
//
// These features pass through @tsrx/core's CSS pipeline; the tests below
// pin the actually-shipped behavior so a future @tsrx/core bump can't
// silently change the surface. Each test reads the injected stylesheet
// text directly and asserts how the hash interleaves with the rule.
// ---------------------------------------------------------------------------

describe('scoped CSS — pseudo-classes', () => {
	it('hashes both the base selector and its :hover variant', () => {
		const r = mount(ScopedHover);
		const btn = r.find('button');
		expect(btn.classList.contains('hov')).toBe(true);
		const css = styleSheetTextFor(btn);
		// Base rule hashed.
		expect(css).toMatch(/\.hov[^:]*\{[^}]*color:\s*rgb\(0,\s*0,\s*0\)/);
		// :hover variant preserves the pseudo-class, hash still anchors the
		// class portion.
		expect(css).toMatch(/\.hov[^{]*:hover\s*\{[^}]*color:\s*rgb\(0,\s*0,\s*255\)/);
		r.unmount();
	});

	it('hashes :focus-within on a parent selector', () => {
		const r = mount(ScopedFocusWithin);
		const wrap = r.find('.wrap');
		const css = styleSheetTextFor(wrap);
		expect(css).toMatch(/\.wrap[^{]*\{[^}]*padding:\s*4px/);
		expect(css).toMatch(/\.wrap[^{]*:focus-within\s*\{[^}]*background:\s*rgb\(255,\s*255,\s*0\)/);
		r.unmount();
	});
});

describe('scoped CSS — @media', () => {
	it('preserves @media query structure with inner rules hashed', () => {
		const r = mount(ScopedMedia);
		const card = r.find('.card');
		const css = styleSheetTextFor(card);
		// Outer rule hashed.
		expect(css).toMatch(/\.card[^{]*\{[^}]*width:\s*100px/);
		// @media block survives and its inner rule is still hashed.
		expect(css).toMatch(/@media[^{]*max-width:\s*600px[^{]*\{/);
		expect(css).toMatch(/@media[\s\S]*\.card[^{]*\{[^}]*width:\s*50px/);
		r.unmount();
	});
});

describe('scoped CSS — @keyframes', () => {
	it('emits the @keyframes block + the animation property referencing it', () => {
		const r = mount(ScopedKeyframes);
		const div = r.find('.anim');
		const css = styleSheetTextFor(div);
		// @keyframes appears in the injected CSS.
		expect(css).toMatch(/@keyframes/);
		// Animation property references a keyframes name.
		expect(css).toMatch(/animation:\s*\S+\s+1s\s+linear/);
		// The class itself is hashed.
		expect(css).toMatch(/\.anim[^{]*\{/);
		r.unmount();
	});
});

describe('scoped CSS — :global escape hatch', () => {
	it(':global(...) selectors are emitted WITHOUT the hash; local rules still hashed', () => {
		const r = mount(ScopedGlobal);
		const local = r.find('.local');
		const css = styleSheetTextFor(local);
		// Local rule is hashed alongside its base class.
		expect(css).toMatch(/\.local[^{]*\{[^}]*color:\s*rgb\(10,\s*10,\s*10\)/);
		// :global(...) wrapper unwrapped; inner selector emitted unscoped.
		expect(css).toMatch(/\.bodywide[^{]*\{[^}]*color:\s*rgb\(123,\s*0,\s*0\)/);
		// And the bodywide rule must NOT have the hash applied.
		const hashClass = Array.from(local.classList).find((c) => c.startsWith('tsrx-'))!;
		expect(css).not.toMatch(new RegExp(`\\.bodywide[^{]*\\.${hashClass}`));
		r.unmount();
	});

	it(':global(<tag>) renders the bare tag (no hash glued onto it)', () => {
		const r = mount(ScopedGlobalTag);
		const local = r.find('.local');
		const css = styleSheetTextFor(local);
		const hashClass = Array.from(local.classList).find((c) => c.startsWith('tsrx-'))!;
		// The local class is still scoped.
		expect(css).toMatch(new RegExp(`\\.local\\.${hashClass}`));
		// `:global(a)` → exactly `a { … }`, NOT `.tsrx-<hash>a` (the regression).
		expect(css).toMatch(/(^|[\s,{}])a\s*\{[^}]*color:\s*rgb\(9,\s*9,\s*9\)/);
		expect(css).not.toContain(`${hashClass}a`);
		// `.local :global(em)` → `.local.<hash> em` (local scoped, em global).
		expect(css).toMatch(new RegExp(`\\.local\\.${hashClass}\\s+em\\b`));
		expect(css).not.toContain(`${hashClass}em`);
		r.unmount();
	});
});
