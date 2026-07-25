import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import {
	BoundaryRoot,
	ComponentRoot,
	DeeplyNested,
	DynamicTagRoot,
	ForRoot,
	FragmentRoot,
	IfRoot,
	NestedIf,
	PlainElement,
	PortalHost,
	ProviderRoot,
	SuspenseRoot,
	SwitchRoot,
	TryRoot,
} from './_fixtures/block-header.tsrx';

const texts = (r: { container: HTMLElement }): string[] =>
	[...r.container.querySelectorAll('.out')].map((n) => n.textContent ?? '');

describe('components whose output is a range', () => {
	// Each of these renders through the compiler-emitted block handle. If the
	// scan that decides to emit that handle under-reports, the component throws
	// ReferenceError on first render rather than producing wrong markup.
	it('renders a root-level @if in both arms', () => {
		const on = mount(IfRoot, { on: true });
		expect(texts(on)).toEqual(['on']);
		on.unmount();

		const off = mount(IfRoot, { on: false });
		expect(texts(off)).toEqual(['off']);
		off.unmount();
	});

	it('renders a root-level @for including its empty arm', () => {
		const filled = mount(ForRoot, {
			items: [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
			],
		});
		expect(texts(filled)).toEqual(['a', 'b']);
		filled.unmount();

		const empty = mount(ForRoot, { items: [] });
		expect(texts(empty)).toEqual(['empty']);
		empty.unmount();
	});

	it('renders a root-level @switch in a matched and a default case', () => {
		const matched = mount(SwitchRoot, { kind: 'a' });
		expect(texts(matched)).toEqual(['A']);
		matched.unmount();

		const fallback = mount(SwitchRoot, { kind: 'zzz' });
		expect(texts(fallback)).toEqual(['D']);
		fallback.unmount();
	});

	it('renders a root-level @try', () => {
		const r = mount(TryRoot, { value: 'body' });
		expect(texts(r)).toEqual(['body']);
		r.unmount();
	});

	it('renders a multi-root fragment', () => {
		const r = mount(FragmentRoot);
		expect(texts(r)).toEqual(['one', 'two']);
		r.unmount();
	});

	it('renders a dynamic root tag', () => {
		const r = mount(DynamicTagRoot, { tag: 'span' });
		expect(texts(r)).toEqual(['dyn']);
		expect(r.container.querySelector('.out')?.tagName).toBe('SPAN');
		r.unmount();
	});

	it('renders a component as the sole root', () => {
		const r = mount(ComponentRoot, { text: 'leaf' });
		expect(texts(r)).toEqual(['leaf']);
		r.unmount();
	});

	it('renders a Suspense root that never suspends', () => {
		const r = mount(SuspenseRoot, { value: 'ready' });
		expect(texts(r)).toEqual(['ready']);
		r.unmount();
	});

	it('renders a context provider root', () => {
		const r = mount(ProviderRoot, { value: 'dark' });
		expect(texts(r)).toEqual(['dark']);
		r.unmount();
	});

	it('renders range constructs nested inside each other', () => {
		const r = mount(DeeplyNested, {
			on: true,
			items: [
				{ id: 1, label: 'a', extra: 'x' },
				{ id: 2, label: 'b', extra: null },
			],
		});
		expect(texts(r)).toEqual(['a', 'x', 'b']);
		r.unmount();
	});

	it('recovers through an ErrorBoundary root after its element is lowered', () => {
		// Exercises the reference scan's other caller: deciding whether the
		// <ErrorBoundary> binding is still live once the element is lowered away.
		const ok = mount(BoundaryRoot, { explode: false });
		expect(texts(ok)).toEqual(['ok']);
		ok.unmount();

		const caught = mount(BoundaryRoot, { explode: true });
		expect(texts(caught)).toEqual(['caught']);
		caught.unmount();
	});
});

describe('components whose output is a single element', () => {
	it('renders a plain element root', () => {
		const r = mount(PlainElement, { text: 'flat' });
		expect(texts(r)).toEqual(['flat']);
		r.unmount();
	});

	it('renders an @if nested inside an element root', () => {
		const r = mount(NestedIf, { on: true });
		expect(texts(r)).toEqual(['nested']);
		r.unmount();
	});

	it('renders a portal from an element root', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const r = mount(PortalHost, { target });
		expect(target.querySelector('.out')?.textContent).toBe('portal');
		r.unmount();
		expect(target.querySelector('.out')).toBe(null);
		target.remove();
	});
});
