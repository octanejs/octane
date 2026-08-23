import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { BoundEventArguments } from './_fixtures/attrs-event-arguments';
import {
	Classed,
	WithAttrs,
	StringDataAttribute,
	RuntimeTypedDataAttribute,
	DynamicAriaAttribute,
	Clicker,
	DoubleClicker,
	FnSetter,
	SpreadDoubleClicker,
	EventAfterSpread,
	DuplicateEventWriters,
	ReassignedEventHandler,
	ShadowedHookFactory,
	RegexCallbackDependency,
	RegexEventArgument,
	DeferredEventArgument,
	MountStableHandlers,
	StableNativeEventCallbacks,
	AriaStaticLiterals,
} from './_fixtures/attrs-events.tsrx';

describe('attributes', () => {
	for (const dev of [false, true]) {
		it(`preserves binding evaluation, coercion, and namespace order (${dev ? 'dev' : 'prod'})`, () => {
			const { Surface } = loadCompiledFixtureSource(
				`
				export function Surface(props) @{
					<section class={props.className} title={props.title}
						data-value={props.data as string} aria-label={props.aria} hidden={props.hidden}>
						<svg class={props.svgClass}><path fill={props.fill} /></svg>
					</section>
				}
			`,
				{
					id: 'binding-order.tsrx',
					mode: 'client',
					compileOptions: { hmr: false, dev },
				},
			);
			const log: string[] = [];
			const propsFor = (label: string, hidden: boolean) => ({
				get className() {
					log.push('class');
					return ['surface', label];
				},
				get title() {
					log.push('title');
					return {
						toString() {
							log.push('coerce-title');
							return label;
						},
					};
				},
				get data() {
					log.push('data');
					return {
						toString() {
							log.push('coerce-data');
							return label;
						},
					};
				},
				get aria() {
					log.push('aria');
					return label;
				},
				hidden,
				svgClass: ['icon', label],
				fill: hidden ? 'blue' : 'red',
			});
			const r = mount(Surface, propsFor('first', false));
			try {
				const host = r.find('section');
				const svg = r.find('svg');
				const path = r.find('path');
				expect(log.splice(0)).toEqual([
					'class',
					'title',
					'coerce-title',
					'data',
					'coerce-data',
					'aria',
				]);
				expect(host.className).toBe('surface first');
				expect(host.getAttribute('title')).toBe('first');
				expect(host.getAttribute('data-value')).toBe('first');
				expect(host.getAttribute('aria-label')).toBe('first');
				expect(host.hasAttribute('hidden')).toBe(false);
				expect(svg.getAttribute('class')).toBe('icon first');
				expect(path.getAttribute('fill')).toBe('red');
				r.update(Surface, propsFor('second', true));
				expect(log).toEqual(['class', 'title', 'coerce-title', 'data', 'coerce-data', 'aria']);
				expect(r.find('section')).toBe(host);
				expect(r.find('svg')).toBe(svg);
				expect(r.find('path')).toBe(path);
				expect(host.className).toBe('surface second');
				expect(host.getAttribute('title')).toBe('second');
				expect(host.getAttribute('data-value')).toBe('second');
				expect(host.getAttribute('aria-label')).toBe('second');
				expect(host.hasAttribute('hidden')).toBe(true);
				expect(svg.getAttribute('class')).toBe('icon second');
				expect(path.getAttribute('fill')).toBe('blue');
			} finally {
				r.unmount();
			}
		});
	}

	it('binds dynamic class', () => {
		const r = mount(Classed, { kind: 'red' });
		expect(r.find('div').className).toBe('red');
		r.unmount();
	});

	it('binds dynamic attributes', () => {
		const r = mount(WithAttrs, { url: 'https://x', title: 'hi' });
		const a = r.find('a') as HTMLAnchorElement;
		expect(a.getAttribute('href')).toBe('https://x');
		expect(a.getAttribute('title')).toBe('hi');
		r.unmount();
	});

	it('updates a string-valued data attribute', () => {
		const r = mount(StringDataAttribute, { value: 'first' });
		const el = r.find('#string-data');
		expect(el.getAttribute('data-label')).toBe('first');
		r.update(StringDataAttribute, { value: 'second' });
		expect(el.getAttribute('data-label')).toBe('second');
		expect(r.find('#string-data')).toBe(el);
		r.unmount();
	});

	it('preserves data attribute coercion when a typed string differs at runtime', () => {
		const r = mount(RuntimeTypedDataAttribute, { value: 'text' });
		const el = r.find('#runtime-data');
		const values: Array<[unknown, string | null]> = [
			['next', 'next'],
			[null, null],
			[undefined, null],
			[() => 'ignored', null],
			[Symbol('ignored'), null],
			[false, 'false'],
			[true, 'true'],
			[0, '0'],
			[{ toString: () => 'object-value' }, 'object-value'],
		];
		for (const [value, expected] of values) {
			r.update(RuntimeTypedDataAttribute, { value });
			expect(el.getAttribute('data-label')).toBe(expected);
			expect(r.find('#runtime-data')).toBe(el);
		}
		r.unmount();
	});

	it('preserves enumerated ARIA coercion on the narrow attribute path', () => {
		const r = mount(DynamicAriaAttribute, { value: 'label' });
		const el = r.find('#dynamic-aria');
		const values: unknown[] = [false, true, 0, () => 'function', Symbol('symbol'), ['a', 'b']];
		for (const value of values) {
			r.update(DynamicAriaAttribute, { value });
			expect(el.getAttribute('aria-label')).toBe(String(value));
			expect(r.find('#dynamic-aria')).toBe(el);
		}
		for (const value of [null, undefined]) {
			r.update(DynamicAriaAttribute, { value });
			expect(el.getAttribute('aria-label')).toBeNull();
		}
		r.unmount();
	});

	it('specializes only safe data attributes whose values are proven strings', () => {
		const specialized = compile(
			`export function C(p) @{ <div data-key={'' + p.id} /> }`,
			'data-string.tsrx',
			{ dev: false },
		).code;
		expect(specialized).toContain('setStringData');
		expect(specialized).not.toContain('setAttribute');

		const generic = compile(
			`export function C(p) @{ <div data-key={p.id} aria-label={'' + p.id} /> }`,
			'data-generic.tsrx',
			{ dev: false },
		).code;
		expect(generic).toContain('setAttribute');
		expect(generic).not.toContain('setStringData');

		const narrow = compile(
			`export function C(p) @{ <button disabled={p.disabled} aria-label={p.label} /> }`,
			'attributes-narrow.tsrx',
			{ dev: false },
		).code;
		expect(narrow).toContain('setBooleanAttribute');
		expect(narrow).toContain('setAriaAttribute');
		expect(narrow).not.toContain('setAttribute');
	});

	it('bakes static aria-* boolean literals as enumerated "true"/"false"', () => {
		// React parity: `aria-hidden={false}` renders `aria-hidden="false"` (it
		// must NOT drop), `aria-expanded={true}` renders "true" (not a bare
		// attribute) — matching the runtime setAttribute/ssrAttr dynamic path.
		// A non-aria boolean literal keeps the generic handling (false drops).
		const r = mount(AriaStaticLiterals);
		const host = r.find('#aria-host');
		expect(host.getAttribute('aria-hidden')).toBe('false');
		expect(host.getAttribute('aria-expanded')).toBe('true');
		expect(host.getAttribute('aria-label')).toBe('lbl');
		expect(host.hasAttribute('hidden')).toBe(false);
		r.unmount();
	});
});

describe('events + useState', () => {
	it('increments on click', () => {
		const r = mount(Clicker);
		expect(r.find('button').textContent).toBe('0');
		r.click('button');
		expect(r.find('button').textContent).toBe('1');
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('3');
		r.unmount();
	});

	it('functional setters chain via flushSync', () => {
		const r = mount(FnSetter);
		r.click('button');
		expect(r.find('button').textContent).toBe('3'); // 3 functional setters in one click
		r.unmount();
	});

	it('maps onDoubleClick to the native dblclick event', () => {
		const r = mount(DoubleClicker);
		r.find('button').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		expect(r.find('button').textContent).toBe('1');
		r.unmount();
	});

	it('maps spread onDoubleClick to the native dblclick event', () => {
		const r = mount(SpreadDoubleClicker);
		r.find('button').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		expect(r.find('button').textContent).toBe('1');
		r.unmount();
	});

	it('preserves event source order when a spread updates', () => {
		const r = mount(EventAfterSpread);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('preserves source order for duplicate event writers', () => {
		const r = mount(DuplicateEventWriters);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('uses the latest reassigned event handler', () => {
		const r = mount(ReassignedEventHandler);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('11');
		r.unmount();
	});

	it('refreshes an event handler returned through a hook-like local factory', () => {
		const r = mount(ShadowedHookFactory);
		r.click('#shadowed-hook');
		r.click('#shadowed-hook');
		expect(r.find('#shadowed-hook').textContent).toBe('2');
		r.unmount();
	});

	it('refreshes callbacks with object-valued literal dependencies', () => {
		const r = mount(RegexCallbackDependency);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('refreshes object-valued event arguments', () => {
		const r = mount(RegexEventArgument);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('runs a call-valued event argument only when the event fires', () => {
		const built: number[] = [];
		const build = (count: number) => {
			built.push(count);
			return `built:${count}`;
		};
		const r = mount(DeferredEventArgument, { build });

		expect(built).toEqual([]);
		r.click('#rerender');
		r.click('#rerender');
		expect(r.find('#rerender').textContent).toBe('2');
		expect(built).toEqual([]);

		r.click('#refresh');
		expect(built).toEqual([2]);
		expect(r.find('#refresh').textContent).toBe('built:2');
		r.unmount();
	});

	it('keeps a capturing inline handler on the latest render while installing a stable one once', () => {
		const r = mount(MountStableHandlers);

		r.click('#bump');
		r.click('#bump');
		expect(r.find('#bump').textContent).toBe('2');

		// The load-bearing half: this handler captures `n`, so freezing it at
		// mount would report the mount-time 0 forever.
		r.click('#capturing');
		expect(r.find('output').textContent).toBe('n=2');

		// The install-once half still dispatches after many renders.
		r.click('#stable');
		expect(r.find('output').textContent).toBe('stable');
		r.click('#bump');
		r.click('#stable');
		expect(r.find('output').textContent).toBe('stable');
		r.unmount();
	});

	it('preserves authored argument lists for bound and direct native event handlers', () => {
		const calls: unknown[][] = [];
		const onCall = (...args: unknown[]) => calls.push(args);
		const r = mount(BoundEventArguments, { value: 'first', onCall });

		r.click('#bound-none');
		r.click('#bound-one');
		r.click('#bound-two');
		r.click('#bound-three');
		expect(calls).toEqual([[], ['first'], ['first', 'second'], ['first', 'second', 'third']]);

		r.update(BoundEventArguments, { value: 'latest', onCall });
		r.click('#bound-one');
		expect(calls[4]).toEqual(['latest']);

		r.click('#direct-native');
		expect(calls[5]).toHaveLength(1);
		expect(calls[5][0]).toBeInstanceOf(Event);
		r.unmount();
	});

	it('keeps stable native handlers live across renders and event sites', () => {
		const observed: Array<() => void> = [];
		const r = mount(StableNativeEventCallbacks, {
			observe: (callback: () => void) => observed.push(callback),
		});
		r.click('#increment');
		r.click('#increment');
		r.click('#add-ten-a');
		r.click('#add-ten-b');
		expect(r.find('output').textContent).toBe('22');
		// A callback observed outside a native event slot retains the public
		// useCallback identity contract across the renders above.
		for (const callback of observed) expect(callback).toBe(observed[0]);
		r.click('#observed');
		expect(r.find('output').textContent).toBe('122');
		r.unmount();
	});
});
