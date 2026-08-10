import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountResult } from '../_helpers';
import { FragmentInstance } from '../../src/index.js';
import {
	ActivityFragmentGroup,
	ActivityFragmentPortal,
	NestedActivityFragmentGroup,
} from './_fixtures/fragment-refs-activity.tsrx';

type FragmentHost = Element & { reactFragments?: Set<FragmentInstance> };

let mounted: MountResult | null = null;
let portalTarget: HTMLElement | null = null;

afterEach(() => {
	try {
		mounted?.unmount();
	} finally {
		mounted = null;
		portalTarget?.remove();
		portalTarget = null;
		vi.restoreAllMocks();
	}
});

function renderGroup(mode: 'visible' | 'hidden') {
	const fragmentRef: { current: FragmentInstance | null } = { current: null };
	const innerRef: { current: FragmentInstance | null } = { current: null };
	const wrappedRef: { current: FragmentInstance | null } = { current: null };
	const props = { mode, fragmentRef, innerRef, wrappedRef };
	mounted = mount(ActivityFragmentGroup, props);
	return {
		result: mounted,
		props,
		fragment: fragmentRef.current!,
		inner: innerRef.current!,
		wrapped: wrappedRef.current!,
	};
}

describe('Fragment refs and Activity visibility', () => {
	// Per ReactDOMFragmentRefs-test.js:959.
	it('excludes hidden Activity children from listeners and fragment ownership', () => {
		const { result, fragment, inner, wrapped } = renderGroup('hidden');
		const fired: string[] = [];
		fragment.addEventListener('click', (event) => {
			fired.push((event.target as Element).id);
		});

		for (const id of [
			'activity-first',
			'activity-nested',
			'activity-wrapped-child',
			'activity-visible',
			'authored-hidden',
			'activity-last',
		]) {
			result.find('#' + id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		}

		expect(fired).toEqual(['activity-visible', 'authored-hidden']);
		expect((result.find('#activity-first') as FragmentHost).reactFragments?.has(fragment)).not.toBe(
			true,
		);
		expect(
			(result.find('#activity-nested') as FragmentHost).reactFragments?.has(fragment),
		).not.toBe(true);
		expect((result.find('#activity-nested') as FragmentHost).reactFragments?.has(inner)).not.toBe(
			true,
		);
		expect(
			(result.find('#activity-wrapped-child') as FragmentHost).reactFragments?.has(wrapped),
		).not.toBe(true);
		expect((result.find('#activity-visible') as FragmentHost).reactFragments?.has(fragment)).toBe(
			true,
		);
		expect((result.find('#authored-hidden') as FragmentHost).reactFragments?.has(fragment)).toBe(
			true,
		);
	});

	// Per ReactDOMFragmentRefs-test.js:1025.
	it('disconnects preserved hidden children and reconnects them when Activity reveals', () => {
		const { result, props, fragment, inner } = renderGroup('visible');
		const first = result.find('#activity-first') as FragmentHost;
		const nested = result.find('#activity-nested') as FragmentHost;
		const fired: string[] = [];
		fragment.addEventListener('click', (event) => fired.push((event.target as Element).id));
		first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-first']);
		expect(nested.reactFragments?.has(fragment)).toBe(true);
		expect(nested.reactFragments?.has(inner)).toBe(true);

		result.update(ActivityFragmentGroup, { ...props, mode: 'hidden' });
		first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		nested.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-first']);
		expect(first.reactFragments?.has(fragment)).toBe(false);
		expect(nested.reactFragments?.has(fragment)).toBe(false);
		expect(nested.reactFragments?.has(inner)).toBe(false);

		result.update(ActivityFragmentGroup, { ...props, mode: 'visible' });
		first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		nested.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-first', 'activity-first', 'activity-nested']);
		expect(first.reactFragments?.has(fragment)).toBe(true);
		expect(nested.reactFragments?.has(fragment)).toBe(true);
		expect(nested.reactFragments?.has(inner)).toBe(true);
	});

	it('observes and measures only visible Fragment children', () => {
		const { result, fragment } = renderGroup('hidden');
		const observer = { observe: vi.fn(), unobserve: vi.fn() };
		fragment.observeUsing(observer);
		expect(observer.observe.mock.calls.map(([element]) => element.id)).toEqual([
			'activity-visible',
			'authored-hidden',
		]);

		for (const element of result.findAll('button, #authored-hidden')) {
			vi.spyOn(element, 'getClientRects').mockReturnValue([
				{ id: element.id } as unknown as DOMRect,
			] as unknown as DOMRectList);
		}
		expect(fragment.getClientRects().map((rect) => (rect as unknown as { id: string }).id)).toEqual(
			['activity-visible', 'authored-hidden'],
		);
	});

	it('restores Activity-owned text geometry only after the boundary reveals', () => {
		const { result, props, fragment } = renderGroup('hidden');
		const rect = { width: 72, height: 16 } as DOMRect;
		const createRange = document.createRange.bind(document);
		vi.spyOn(document, 'createRange').mockImplementation(() => {
			const range = createRange();
			range.getClientRects = () => [rect] as unknown as DOMRectList;
			return range;
		});

		expect(fragment.getClientRects()).toEqual([]);

		result.update(ActivityFragmentGroup, { ...props, mode: 'visible' });
		expect(fragment.getClientRects()).toEqual([rect]);
	});

	it('focuses and scrolls only visible Fragment children', () => {
		const { result, fragment } = renderGroup('hidden');
		const visible = result.find('#activity-visible') as HTMLButtonElement;
		fragment.focus();
		expect(document.activeElement).toBe(visible);
		fragment.focusLast();
		expect(document.activeElement).toBe(visible);

		const calls: string[] = [];
		for (const element of result.findAll('button, #authored-hidden')) {
			(element as HTMLElement).scrollIntoView = () => calls.push(element.id);
		}
		fragment.scrollIntoView();
		expect(calls).toEqual(['authored-hidden', 'activity-visible']);
	});

	it('retains hidden ownership until every nested Activity has revealed', () => {
		const fragmentRef: { current: FragmentInstance | null } = { current: null };
		const props = { outerMode: 'hidden' as const, innerMode: 'hidden' as const, fragmentRef };
		mounted = mount(NestedActivityFragmentGroup, props);
		const result = mounted;
		const fragment = fragmentRef.current!;
		const child = result.find('#double-hidden') as FragmentHost;
		expect(child.reactFragments?.has(fragment)).not.toBe(true);

		result.update(NestedActivityFragmentGroup, { ...props, outerMode: 'visible' });
		expect(child.reactFragments?.has(fragment)).not.toBe(true);

		result.update(NestedActivityFragmentGroup, {
			...props,
			outerMode: 'visible',
			innerMode: 'visible',
		});
		expect(child.reactFragments?.has(fragment)).toBe(true);
	});

	it('excludes logically owned portal children while their Activity is hidden', () => {
		portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);
		const fragmentRef: { current: FragmentInstance | null } = { current: null };
		const props = { mode: 'visible' as const, fragmentRef, target: portalTarget };
		mounted = mount(ActivityFragmentPortal, props);
		const fragment = fragmentRef.current!;
		const portaled = portalTarget.querySelector('#activity-portal-child') as FragmentHost;
		const fired: string[] = [];
		fragment.addEventListener('click', (event) => fired.push((event.target as Element).id));
		portaled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-portal-child']);
		expect(portaled.reactFragments?.has(fragment)).toBe(true);

		mounted.update(ActivityFragmentPortal, { ...props, mode: 'hidden' });
		portaled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-portal-child']);
		expect(portaled.reactFragments?.has(fragment)).toBe(false);

		mounted.update(ActivityFragmentPortal, { ...props, mode: 'visible' });
		portaled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-portal-child', 'activity-portal-child']);
		expect(portaled.reactFragments?.has(fragment)).toBe(true);
	});

	it('connects an initially hidden portal only after its Activity reveals', () => {
		portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);
		const fragmentRef: { current: FragmentInstance | null } = { current: null };
		const props = { mode: 'hidden' as const, fragmentRef, target: portalTarget };
		mounted = mount(ActivityFragmentPortal, props);
		const fragment = fragmentRef.current!;
		const portaled = portalTarget.querySelector('#activity-portal-child') as FragmentHost;
		const fired: string[] = [];
		fragment.addEventListener('click', (event) => fired.push((event.target as Element).id));
		portaled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual([]);
		expect(portaled.reactFragments?.has(fragment)).not.toBe(true);

		mounted.update(ActivityFragmentPortal, { ...props, mode: 'visible' });
		portaled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['activity-portal-child']);
		expect(portaled.reactFragments?.has(fragment)).toBe(true);
	});
});
