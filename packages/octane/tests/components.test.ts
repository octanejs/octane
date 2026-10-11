import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
	createElement,
	useState,
	template,
	clone,
	flushSync,
	hydrateRoot,
	isValidElement,
} from 'octane';
import { renderToString } from 'octane/server';
import { prerender } from 'octane/static';
import { mount, act } from './_helpers';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture';
import {
	Greeting,
	App,
	Nested,
	DefaultOnly,
	ArrowComp,
	ArrowFragHost,
} from './_fixtures/components.tsrx';
import {
	EnumReturnedChild,
	readEnumReturnedDescriptor,
} from './_fixtures/component-enum-escape.tsrx';
import { AliasedIcon, ImportAliasChild } from './_fixtures/component-import-alias.tsrx';

describe('component composition', () => {
	it('renders a static child component with props', () => {
		const r = mount(Greeting, { name: 'world' });
		expect(r.find('.lbl').textContent).toBe('world');
		r.unmount();
	});

	it('renders an arrow-function component (const X = (props) => @{…})', () => {
		const r = mount(ArrowComp, { who: 'world' });
		expect(r.find('#arrow').textContent).toBe('hi world');
		r.unmount();
	});

	it('renders an arrow component with a fragment body + nested components', () => {
		const r = mount(ArrowFragHost);
		expect(r.find('#arrow').textContent).toBe('hi arrow');
		expect(r.find('.lbl').textContent).toBe('sibling');
		r.unmount();
	});
});

describe('createContext + use', () => {
	it('reads default when no Provider is in the tree', () => {
		const r = mount(DefaultOnly);
		expect(r.find('.theme').textContent).toBe('light');
		r.unmount();
	});

	it('reads Provider value, updates when value changes', () => {
		const r = mount(App);
		expect(r.find('.theme').textContent).toBe('light');
		r.click('button');
		expect(r.find('.theme').textContent).toBe('dark');
		r.click('button');
		expect(r.find('.theme').textContent).toBe('light');
		r.unmount();
	});

	it('inner Provider overrides outer', () => {
		const r = mount(Nested);
		expect(r.find('.o .theme').textContent).toBe('outer');
		expect(r.find('.i .theme').textContent).toBe('inner');
		r.unmount();
	});
});

// ─── Key-driven remount on standalone component ───
import { flushEffects } from './_helpers';
import { KeyHost, resetKeyCounters } from './_fixtures/components.tsrx';
import * as fx from './_fixtures/components.tsrx';

describe('key-driven remount on standalone component', () => {
	it('resets useState when key changes', () => {
		const r = mount(KeyHost, { k: 'a', label: 'A' });
		r.click('.inc');
		r.click('.inc');
		r.click('.inc');
		expect(r.find('.count').textContent).toBe('3');
		r.update(KeyHost, { k: 'b', label: 'B' });
		// Fresh Counter — useState slot is new.
		expect(r.find('.count').textContent).toBe('0');
		expect(r.find('.label').textContent).toBe('B');
		r.unmount();
	});

	it('fires useEffect cleanup on key change and re-runs the mount effect', () => {
		resetKeyCounters();
		const r = mount(KeyHost, { k: 'a', label: 'A' });
		flushEffects();
		expect(fx.mountCount).toBe(1);
		expect(fx.cleanupCount).toBe(0);
		r.update(KeyHost, { k: 'b', label: 'B' });
		flushEffects();
		expect(fx.mountCount).toBe(2);
		expect(fx.cleanupCount).toBe(1);
		r.update(KeyHost, { k: 'c', label: 'C' });
		flushEffects();
		expect(fx.mountCount).toBe(3);
		expect(fx.cleanupCount).toBe(2);
		r.unmount();
		flushEffects();
		expect(fx.cleanupCount).toBe(3);
	});

	it('same key + different props re-renders in place (no remount)', () => {
		resetKeyCounters();
		const r = mount(KeyHost, { k: 'stable', label: 'first' });
		flushEffects();
		r.click('.inc');
		r.click('.inc');
		expect(r.find('.count').textContent).toBe('2');
		expect(fx.mountCount).toBe(1);
		// Same key, new label — should not remount.
		r.update(KeyHost, { k: 'stable', label: 'second' });
		flushEffects();
		expect(r.find('.count').textContent).toBe('2'); // state preserved
		expect(r.find('.label').textContent).toBe('second'); // prop updated
		expect(fx.mountCount).toBe(1); // no remount
		expect(fx.cleanupCount).toBe(0);
		r.unmount();
	});
});

// Library-binding shape, hand-written (no compiler): a plain function component
// RETURNS a `createElement` descriptor whose `type` is a compiled-style imperative
// renderer (mounts once, patches holes on re-render). renderBlock childSlots the
// return; childSlot reconciles by `type` IDENTITY — so on re-render the SAME
// button + text node survive (holes patched, not rebuilt). Non-VDOM proof for the
// descriptor-returning path the `@octanejs/*` bindings rely on.
describe('hand-written descriptor renderer (return-based body, no compiler)', () => {
	// The compiled imperative renderer for `<button onClick={onInc}>{n}</button>`.
	const _btn = template('<button></button>');
	function CountButtonFrag(props: any, __s: any) {
		const __block = __s.block;
		let _b = __s.b$0;
		if (_b === undefined) {
			_b = {};
			const el = clone(_btn) as HTMLButtonElement;
			const txt = document.createTextNode(String(props.n));
			el.appendChild(txt);
			el.onclick = props.onInc;
			_b.el = el;
			_b.txt = txt;
			_b.n = props.n;
			__block.parentNode.insertBefore(el, __block.endMarker);
			__s.b$0 = _b;
		} else {
			if (_b.n !== props.n) {
				_b.txt.data = String(props.n);
				_b.n = props.n;
			}
			_b.el.onclick = props.onInc; // latest closure
		}
	}

	// "Just a function" — has a hook (manual stable slot), RETURNS a descriptor.
	const SLOT = Symbol.for('poc:Count.useState#0');
	function Count(): any {
		const [n, setN] = useState(0, SLOT);
		return createElement(CountButtonFrag, { n, onInc: () => setN(n + 1) });
	}

	it('mounts via the return and PATCHES (same node) on re-render — no rebuild/VDOM', () => {
		const r = mount(Count as any);
		const btn = r.container.querySelector('button')!;
		const txt = btn.firstChild;
		expect(btn.textContent).toBe('0');

		act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));

		expect(btn.textContent).toBe('1');
		// The LINCHPIN: identity preserved → reconciled in place, not rebuilt.
		expect(r.container.querySelector('button')).toBe(btn);
		expect(btn.firstChild).toBe(txt);

		act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(btn.textContent).toBe('2');
		expect(r.container.querySelector('button')).toBe(btn);
		r.unmount();
	});
});

describe('returned components inside templates', () => {
	const initial = { show: true, rows: ['a', 'b'], selected: 'icon', tick: 0 };
	const positions = [
		'.shared-direct svg',
		'.shared-if svg',
		'[data-row="a"] svg',
		'[data-row="b"] svg',
		'.shared-switch svg',
		'.shared-sole svg',
	];

	it('keeps a connected custom element effect through production parent updates', () => {
		// Exercise production component reuse under both runtime projects. The hook
		// itself is an ordinary fixture import with compiler-assigned hook slots.
		const client = loadCompiledFixtureSource<typeof fx>(
			readFileSync('packages/octane/tests/_fixtures/components.tsrx', 'utf8'),
			{
				id: '/packages/octane/tests/_fixtures/components.tsrx',
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
			},
		);
		const events: string[] = [];
		const hookErrors: unknown[] = [];
		customElements.define(
			'octane-connected-effect-probe',
			class extends HTMLElement {
				connectedCallback() {
					try {
						fx.useConnectedElementEffect((event) => events.push(event));
					} catch (error) {
						hookErrors.push(error);
					}
				}
			},
		);
		const r = mount(client.ConnectedCustomElementParent, { tick: 'zero' });
		try {
			expect(hookErrors).toEqual([]);
			expect(events).toEqual(['connected']);
			const element = r.find('octane-connected-effect-probe');
			r.update(client.ConnectedCustomElementParent, { tick: 'one' });
			expect(r.find('.connected-tick').textContent).toBe('one');
			expect(r.find('octane-connected-effect-probe')).toBe(element);
			expect(element.isConnected).toBe(true);
			expect(hookErrors).toEqual([]);
			expect(events).toEqual(['connected']);
		} finally {
			r.unmount();
		}
		expect(r.container.childNodes).toHaveLength(0);
		expect(events).toEqual(['connected', 'cleanup']);
	});

	it('preserves SVG nodes through updates and keyed moves, and retires removed branches', () => {
		const r = mount(fx.SharedReturnedChildren, initial);
		try {
			const icons = positions.map((selector) => r.find(selector));
			const titles = icons.map((icon) => icon.querySelector('title')!.firstChild);
			const input = r.find('.shared-draft') as HTMLInputElement;
			input.value = 'typed draft';
			for (const icon of icons) {
				expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
				expect(icon.querySelector('path')!.namespaceURI).toBe(icon.namespaceURI);
				expect(icon.querySelector('title')!.textContent).toBe('Shared icon');
			}
			r.update(fx.SharedReturnedChildren, { ...initial, rows: ['b', 'a'], tick: 1 });
			positions.forEach((selector, index) => {
				expect(r.find(selector)).toBe(icons[index]);
				expect(r.find(selector).querySelector('title')!.firstChild).toBe(titles[index]);
			});
			expect(r.findAll('[data-row]').map((row) => row.getAttribute('data-row'))).toEqual([
				'b',
				'a',
			]);
			expect(r.find('.shared-draft')).toBe(input);
			expect(input.value).toBe('typed draft');
			r.update(fx.SharedReturnedChildren, { show: false, rows: ['b'], selected: 'label', tick: 2 });
			expect(r.findAll('.shared-if svg')).toEqual([]);
			expect(r.find('.shared-switch .shared-label').textContent).toBe('Shared label');
			for (const index of [1, 2, 4]) expect(icons[index].isConnected).toBe(false);
			expect(r.find('[data-row="b"] svg')).toBe(icons[3]);
			r.update(fx.SharedReturnedChildren, { ...initial, rows: ['b'], tick: 3 });
			expect(r.find('.shared-if svg')).not.toBe(icons[1]);
			expect(r.find('.shared-switch svg')).not.toBe(icons[4]);
			expect(r.find('.shared-direct svg')).toBe(icons[0]);
			expect(input.value).toBe('typed draft');
		} finally {
			r.unmount();
		}
		expect(r.container.textContent).toBe('');
	});

	it('adopts returned SVGs in template branches and preserves an edited input', async () => {
		const server = loadServerFixture<typeof fx>('packages/octane/tests/_fixtures/components.tsrx', {
			compileOptions: { dev: false, hmr: false },
		});
		const container = document.createElement('div');
		container.innerHTML = (await renderToString(server.SharedReturnedChildren, initial)).html;
		document.body.appendChild(container);
		const icons = positions.map((selector) => container.querySelector(selector)!);
		const titles = icons.map((icon) => icon.querySelector('title')!.firstChild);
		const input = container.querySelector<HTMLInputElement>('.shared-draft')!;
		input.value = 'before hydration';
		const recovery: unknown[] = [];
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			const hydrated = hydrateRoot(container, fx.SharedReturnedChildren, initial, {
				onRecoverableError: (error) => recovery.push(error),
			});
			root = hydrated;
			flushSync(() => {});
			flushSync(() => hydrated.render(fx.SharedReturnedChildren, { ...initial, tick: 1 }));
			positions.forEach((selector, index) => {
				const icon = container.querySelector(selector)!;
				expect(icon).toBe(icons[index]);
				expect(icon.querySelector('title')!.firstChild).toBe(titles[index]);
				expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
			});
			expect(container.querySelector('.shared-draft')).toBe(input);
			expect(input.value).toBe('before hydration');
			flushSync(() =>
				hydrated.render(fx.SharedReturnedChildren, {
					show: false,
					rows: ['b'],
					selected: 'label',
					tick: 2,
				}),
			);
			expect(container.querySelector('.shared-switch .shared-label')?.textContent).toBe(
				'Shared label',
			);
			for (const index of [1, 2, 4]) expect(icons[index].isConnected).toBe(false);
			flushSync(() => hydrated.render(fx.SharedReturnedChildren, { ...initial, tick: 3 }));
			positions.forEach((selector, index) => {
				const icon = container.querySelector(selector)!;
				expect(icon.querySelector('title')?.textContent).toBe('Shared icon');
				if ([1, 2, 4].includes(index)) expect(icon).not.toBe(icons[index]);
				else expect(icon).toBe(icons[index]);
			});
			expect(input.value).toBe('before hydration');
			expect(recovery).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
		}
		expect(container.textContent).toBe('');
	});

	it('respects local component bindings and default props exposed by escaped descriptors', () => {
		const shadowed = mount(fx.ShadowedReturnedChild);
		try {
			expect(shadowed.find('.module-icon').textContent).toBe('Module icon');
			expect(shadowed.find('.local-icon').textContent).toBe('Local icon');
			expect(shadowed.findAll('svg')).toEqual([]);
		} finally {
			shadowed.unmount();
		}
		const descriptor = fx.escapedReturnedDescriptor();
		expect(isValidElement(descriptor)).toBe(true);
		const type = descriptor.type as object;
		const reads: string[] = [];
		Object.defineProperty(type, 'defaultProps', {
			configurable: true,
			get() {
				reads.push('defaults');
				return {};
			},
		});
		try {
			const r = mount(fx.EscapedReturnedChild);
			try {
				expect(r.findAll('.escaped-label').map((label) => label.textContent)).toEqual([
					'Escaped label',
					'Escaped label',
				]);
				expect(reads).toContain('defaults');
			} finally {
				r.unmount();
			}
		} finally {
			Reflect.deleteProperty(type, 'defaultProps');
		}
	});

	it('retains returned SVG and input state while pending, then retries a caught error', async () => {
		const props = { promise: Promise.resolve('initial') };
		const r = mount(fx.ReturnedRetryBoundary, props);
		try {
			await act(() => {});
			expect(r.find('.retry-value').textContent).toBe('initial');
			const svg = r.find('.retry-content svg');
			const titleText = svg.querySelector('title')!.firstChild;
			const label = r.find('.retry-content .shared-label');
			const labelText = label.firstChild;
			const input = r.find('.retry-draft') as HTMLInputElement;
			const sibling = r.find('.retry-sibling-draft') as HTMLInputElement;
			input.value = 'primary draft';
			sibling.value = 'sibling draft';
			let resolveNext!: (value: string) => void;
			const next = new Promise<string>((resolve) => {
				resolveNext = resolve;
			});
			await act(() => r.update(fx.ReturnedRetryBoundary, { promise: next }));
			const pending = r.find('.retry-pending');
			expect(pending.textContent).toBe('Loading');
			expect(r.find('.retry-content svg')).toBe(svg);
			expect(svg.isConnected).toBe(true);
			expect(r.find('.retry-draft')).toBe(input);
			expect(input.value).toBe('primary draft');
			await act(() => resolveNext('next'));
			expect(pending.isConnected).toBe(false);
			expect(r.find('.retry-value').textContent).toBe('next');
			expect(r.find('.retry-content svg')).toBe(svg);
			expect(svg.querySelector('title')!.firstChild).toBe(titleText);
			expect(r.find('.retry-content .shared-label')).toBe(label);
			expect(label.firstChild).toBe(labelText);
			expect(r.find('.retry-draft')).toBe(input);
			expect(input.value).toBe('primary draft');

			await act(() => r.update(fx.ReturnedRetryBoundary, { promise: next, failed: true }));
			const caught = r.find('.retry-reset');
			expect(caught.textContent).toBe('Retry: retry failed');
			expect(r.findAll('.retry-pending')).toEqual([]);
			expect(r.find('.retry-sibling-draft')).toBe(sibling);
			expect(sibling.value).toBe('sibling draft');
			r.update(fx.ReturnedRetryBoundary, { promise: Promise.resolve('recovered') });
			expect(r.find('.retry-reset')).toBe(caught);
			await act(() => r.click('.retry-reset'));
			expect(caught.isConnected).toBe(false);
			expect(r.findAll('.retry-pending')).toEqual([]);
			expect(r.find('.retry-value').textContent).toBe('recovered');
			expect(r.find('.retry-content svg').namespaceURI).toBe('http://www.w3.org/2000/svg');
			expect(r.find('.retry-content .shared-label').textContent).toBe('Shared label');
			expect(r.find('.retry-sibling-draft')).toBe(sibling);
			expect(sibling.value).toBe('sibling draft');
		} finally {
			r.unmount();
		}
		expect(r.container.textContent).toBe('');
	});

	it('adopts returned SVGs before a later suspension and retains edited drafts on retry', async () => {
		const server = loadServerFixture<typeof fx>('packages/octane/tests/_fixtures/components.tsrx', {
			compileOptions: { dev: false, hmr: false },
		});
		const props = { promise: Promise.resolve('server value') };
		const container = document.createElement('div');
		container.innerHTML = (await prerender(server.ReturnedRetryBoundary, props)).html;
		document.body.appendChild(container);
		const svg = container.querySelector('.retry-content svg')!;
		const titleText = svg.querySelector('title')!.firstChild;
		const label = container.querySelector('.retry-content .shared-label')!;
		const labelText = label.firstChild;
		const input = container.querySelector<HTMLInputElement>('.retry-draft')!;
		const sibling = container.querySelector<HTMLInputElement>('.retry-sibling-draft')!;
		input.value = 'server primary draft';
		sibling.value = 'server sibling draft';
		const recovery: unknown[] = [];
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(() => {
				root = hydrateRoot(container, fx.ReturnedRetryBoundary, props, {
					onRecoverableError: (error) => recovery.push(error),
				});
			});
			expect(container.querySelector('.retry-content svg')).toBe(svg);
			expect(container.querySelector('.retry-draft')).toBe(input);
			expect(input.value).toBe('server primary draft');
			let resolveNext!: (value: string) => void;
			const next = new Promise<string>((resolve) => {
				resolveNext = resolve;
			});
			await act(() => root!.render(fx.ReturnedRetryBoundary, { promise: next }));
			const pending = container.querySelector('.retry-pending')!;
			expect(pending.textContent).toBe('Loading');
			expect(container.querySelector('.retry-content svg')).toBe(svg);
			expect(svg.isConnected).toBe(true);
			await act(() => resolveNext('client value'));
			expect(pending.isConnected).toBe(false);
			expect(container.querySelector('.retry-value')!.textContent).toBe('client value');
			expect(container.querySelector('.retry-content svg')).toBe(svg);
			expect(svg.querySelector('title')!.firstChild).toBe(titleText);
			expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
			expect(container.querySelector('.retry-content .shared-label')).toBe(label);
			expect(label.firstChild).toBe(labelText);
			expect(container.querySelector('.retry-draft')).toBe(input);
			expect(input.value).toBe('server primary draft');
			expect(container.querySelector('.retry-sibling-draft')).toBe(sibling);
			expect(sibling.value).toBe('server sibling draft');
			expect(recovery).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
		}
		expect(container.textContent).toBe('');
	});

	it.each([
		{
			name: 'an enum initializer',
			read: readEnumReturnedDescriptor,
			App: EnumReturnedChild,
			selector: '.enum-escaped-icon',
			text: 'enum icon',
		},
		{
			name: 'a constructor parameter property',
			read: fx.readParameterReturnedDescriptor,
			App: fx.ParameterReturnedChild,
			selector: '.parameter-escaped-icon',
			text: 'parameter icon',
		},
		{
			name: 'an exported import-equals alias',
			read: AliasedIcon,
			App: ImportAliasChild,
			selector: '.alias-escaped-icon',
			text: 'alias icon',
		},
		{
			name: 'an earlier returned host tree',
			read: () => {
				const child = Object.values(fx.ForwardReturnedCard().props).find(isValidElement);
				return child ? (child.type as typeof fx.readParameterReturnedDescriptor)() : null;
			},
			// A compiler that folds this forward reference may remove the escape.
			allowUnexposed: true,
			App: fx.ForwardReturnedChild,
			selector: '.forward-escaped-icon',
			text: 'forward icon',
		},
	])(
		'observes default props on a returned element exposed by $name',
		({ read, App, selector, text, allowUnexposed = false }) => {
			const descriptor = read();
			if (allowUnexposed && descriptor === null) {
				const r = mount(App);
				try {
					expect(r.find(selector).textContent).toBe(text);
				} finally {
					r.unmount();
				}
				return;
			}
			expect(isValidElement(descriptor)).toBe(true);
			const type = descriptor!.type as object;
			const previous = Object.getOwnPropertyDescriptor(type, 'defaultProps');
			const reads: string[] = [];
			let r: ReturnType<typeof mount> | undefined;
			try {
				Object.defineProperty(type, 'defaultProps', {
					configurable: true,
					get() {
						reads.push('defaults');
						return {};
					},
				});
				r = mount(App);
				expect(r.find(selector).textContent).toBe(text);
				expect(reads).toContain('defaults');
			} finally {
				r?.unmount();
				if (previous) Object.defineProperty(type, 'defaultProps', previous);
				else Reflect.deleteProperty(type, 'defaultProps');
			}
		},
	);
});
