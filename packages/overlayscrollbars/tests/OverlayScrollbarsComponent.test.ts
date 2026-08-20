// Per packages/overlayscrollbars/upstream/canonical/test/OverlayScrollbarsComponent.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement as h } from 'octane';
import { OverlayScrollbars } from 'overlayscrollbars';
import { OverlayScrollbarsComponent, type OverlayScrollbarsComponentRef } from '../src/index.ts';
import { DynamicChildren } from './_fixtures/dynamic-children.tsrx';

vi.useFakeTimers({
	toFake: [
		'requestAnimationFrame',
		'cancelAnimationFrame',
		'requestIdleCallback',
		'cancelIdleCallback',
	],
});

afterEach(cleanup);

describe('OverlayScrollbarsComponent', function componentSuite() {
	describe('correct rendering', function rendering() {
		it('correct root element with instance', function rootElement() {
			const elementA = 'code';
			const elementB = 'span';
			const view = render(h(OverlayScrollbarsComponent, null));
			const container = view.container;

			expect(container.firstElementChild).toBeTruthy();
			expect(container.querySelector('div')).toBe(container.firstElementChild);

			let osInstance = OverlayScrollbars(container.firstElementChild as HTMLElement);
			expect(osInstance).toBeDefined();
			expect(OverlayScrollbars.valid(osInstance)).toBe(true);

			view.rerender(h(OverlayScrollbarsComponent, { element: elementA }));
			expect(container.querySelector(elementA)).toBe(container.firstElementChild);
			expect(OverlayScrollbars.valid(osInstance)).toBe(false);
			osInstance = OverlayScrollbars(container.firstElementChild as HTMLElement);
			expect(osInstance).toBeDefined();
			expect(OverlayScrollbars.valid(osInstance)).toBe(true);

			view.rerender(h(OverlayScrollbarsComponent, { element: elementB }));
			expect(container.querySelector(elementB)).toBe(container.firstElementChild);
			expect(OverlayScrollbars.valid(osInstance)).toBe(false);
			osInstance = OverlayScrollbars(container.firstElementChild as HTMLElement);
			expect(osInstance).toBeDefined();
			expect(OverlayScrollbars.valid(osInstance)).toBe(true);
		});

		it('data-overlayscrollbars-initialize', function initializeAttr() {
			const { container } = render(h(OverlayScrollbarsComponent, null));
			expect(container.querySelector('[data-overlayscrollbars-initialize]')).toBeTruthy();
		});

		it('children', function children() {
			const { container, getByText } = render(
				h(OverlayScrollbarsComponent, null, 'hello ', h('span', null, 'react')),
			);
			expect(getByText(/hello/).textContent).toMatch(/hello/);
			expect(getByText(/react/).textContent).toMatch(/react/);
			expect(getByText(/react/).parentElement).not.toBe(container.firstElementChild);
		});

		it('dynamic children', function dynamicChildren() {
			const view = render(h(DynamicChildren));
			const addBtn = view.getByText('add');
			const removeBtn = view.getByText('remove');
			const initialElement = view.getByText('0');
			expect(initialElement).toBeTruthy();
			const initialElementParent = initialElement.parentElement;
			expect(initialElementParent).toBeTruthy();

			fireEvent.click(addBtn);
			expect(view.getByText('1').parentElement).toBe(initialElementParent);

			fireEvent.click(removeBtn);
			fireEvent.click(removeBtn);
			expect(view.getByText('empty')).toBe(initialElementParent);
		});

		it('className', function className() {
			const view = render(h(OverlayScrollbarsComponent, { className: 'overlay scrollbars' }));
			const root = view.container.firstElementChild as HTMLElement;
			expect(root.classList.contains('overlay')).toBe(true);
			expect(root.classList.contains('scrollbars')).toBe(true);

			view.rerender(h(OverlayScrollbarsComponent, { className: 'overlay scrollbars react' }));
			expect(root.classList.contains('react')).toBe(true);
		});

		it('style', function style() {
			const view = render(h(OverlayScrollbarsComponent, { style: { width: '22px' } }));
			const root = view.container.firstElementChild as HTMLElement;
			expect(root.style.width).toBe('22px');

			view.rerender(h(OverlayScrollbarsComponent, { style: { height: '33px' } }));
			expect(root.style.height).toBe('33px');
		});
	});

	describe('deferred initialization', function deferred() {
		it('basic defer', function basicDefer() {
			const { container } = render(h(OverlayScrollbarsComponent, { defer: true }));
			expect(OverlayScrollbars(container.firstElementChild as HTMLElement)).toBeUndefined();
			vi.advanceTimersByTime(2000);
			expect(OverlayScrollbars(container.firstElementChild as HTMLElement)).toBeDefined();
		});

		it('options defer', function optionsDefer() {
			const { container } = render(h(OverlayScrollbarsComponent, { defer: { timeout: 0 } }));
			expect(OverlayScrollbars(container.firstElementChild as HTMLElement)).toBeUndefined();
			vi.advanceTimersByTime(2000);
			expect(OverlayScrollbars(container.firstElementChild as HTMLElement)).toBeDefined();
		});

		it('defer with unsupported Idle', function unsupportedIdle() {
			const original = window.requestIdleCallback;
			window.requestIdleCallback = undefined as unknown as typeof window.requestIdleCallback;

			const { container } = render(h(OverlayScrollbarsComponent, { defer: true }));
			expect(OverlayScrollbars(container.firstElementChild as HTMLElement)).toBeUndefined();
			vi.advanceTimersByTime(2000);
			expect(OverlayScrollbars(container.firstElementChild as HTMLElement)).toBeDefined();

			window.requestIdleCallback = original;
		});
	});

	it('ref', function ref() {
		const ref: { current: OverlayScrollbarsComponentRef | null } = { current: null };
		const { container } = render(h(OverlayScrollbarsComponent, { ref }));
		const handle = ref.current!;
		expect(typeof handle.osInstance).toBe('function');
		expect(typeof handle.getElement).toBe('function');
		expect(OverlayScrollbars.valid(handle.osInstance())).toBe(true);
		expect(handle.getElement()).toBe(container.firstElementChild);
	});

	it('options', function options() {
		const ref: { current: OverlayScrollbarsComponentRef | null } = { current: null };
		const view = render(
			h(OverlayScrollbarsComponent, {
				options: { paddingAbsolute: true, overflow: { y: 'hidden' } },
				ref,
			}),
		);
		const instance = ref.current!.osInstance()!;
		const opts = instance.options();
		expect(opts.paddingAbsolute).toBe(true);
		expect(opts.overflow.y).toBe('hidden');

		view.rerender(
			h(OverlayScrollbarsComponent, {
				options: { overflow: { x: 'hidden' } },
				ref,
			}),
		);

		const newOpts = instance.options();
		expect(newOpts.paddingAbsolute).toBe(false);
		expect(newOpts.overflow.x).toBe('hidden');
		expect(newOpts.overflow.y).toBe('scroll');
		expect(instance).toBe(ref.current!.osInstance());

		view.rerender(
			h(OverlayScrollbarsComponent, {
				element: 'span',
				options: { overflow: { x: 'hidden', y: 'hidden' } },
				ref,
			}),
		);

		const newElementInstance = ref.current!.osInstance()!;
		const newElementNewOpts = newElementInstance.options();
		expect(newElementInstance).not.toBe(instance);
		expect(newElementNewOpts.paddingAbsolute).toBe(false);
		expect(newElementNewOpts.overflow.x).toBe('hidden');
		expect(newElementNewOpts.overflow.y).toBe('hidden');

		view.rerender(
			h(OverlayScrollbarsComponent, {
				element: 'span',
				options: undefined,
				ref,
			}),
		);

		const resetOpts = newElementInstance.options();
		expect(newElementInstance).toBe(ref.current!.osInstance());
		expect(resetOpts.paddingAbsolute).toBe(false);
		expect(resetOpts.overflow.x).toBe('scroll');
		expect(resetOpts.overflow.y).toBe('scroll');
	});

	it('events', function events() {
		const onUpdatedInitial = vi.fn();
		const onUpdated = vi.fn();
		const ref: { current: OverlayScrollbarsComponentRef | null } = { current: null };
		const view = render(
			h(OverlayScrollbarsComponent, { events: { updated: onUpdatedInitial }, ref }),
		);
		const instance = ref.current!.osInstance()!;
		expect(onUpdatedInitial).toHaveBeenCalledTimes(1);

		view.rerender(h(OverlayScrollbarsComponent, { events: { updated: onUpdated }, ref }));
		expect(onUpdated).not.toHaveBeenCalled();

		instance.update(true);
		expect(onUpdatedInitial).toHaveBeenCalledTimes(1);
		expect(onUpdated).toHaveBeenCalledTimes(1);

		view.rerender(
			h(OverlayScrollbarsComponent, {
				events: { updated: [onUpdated, onUpdatedInitial] },
				ref,
			}),
		);
		instance.update(true);
		expect(onUpdatedInitial).toHaveBeenCalledTimes(2);
		expect(onUpdated).toHaveBeenCalledTimes(2);

		view.rerender(h(OverlayScrollbarsComponent, { events: { updated: null }, ref }));
		instance.update(true);
		expect(onUpdatedInitial).toHaveBeenCalledTimes(2);
		expect(onUpdated).toHaveBeenCalledTimes(2);
		expect(instance).toBe(ref.current!.osInstance());

		view.rerender(
			h(OverlayScrollbarsComponent, {
				element: 'span',
				events: { updated: [onUpdated, onUpdatedInitial] },
				ref,
			}),
		);
		const newElementInstance = ref.current!.osInstance()!;
		expect(newElementInstance).not.toBe(instance);
		expect(onUpdatedInitial).toHaveBeenCalledTimes(3);
		expect(onUpdated).toHaveBeenCalledTimes(3);

		view.rerender(
			h(OverlayScrollbarsComponent, {
				element: 'span',
				events: undefined,
				ref,
			}),
		);
		newElementInstance.update(true);
		expect(newElementInstance).toBe(ref.current!.osInstance());
		expect(onUpdatedInitial).toHaveBeenCalledTimes(3);
		expect(onUpdated).toHaveBeenCalledTimes(3);
	});

	it('destroy', function destroy() {
		const ref: { current: OverlayScrollbarsComponentRef | null } = { current: null };
		const { unmount } = render(h(OverlayScrollbarsComponent, { ref }));
		const { osInstance } = ref.current!;
		expect(OverlayScrollbars.valid(osInstance())).toBe(true);
		unmount();
		expect(osInstance()).toBeDefined();
		expect(OverlayScrollbars.valid(osInstance())).toBe(false);
	});
});
