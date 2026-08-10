import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountResult } from '../_helpers';
import { FragmentInstance } from '../../src/index.js';
import {
	LedgerDynamicFocus,
	LedgerInterleavedPortals,
	LedgerNestedFocus,
	LedgerPortaledEmptyFragment,
	LedgerPortalScrollContainers,
	LedgerRemovableFragment,
	LedgerRootPositions,
} from './_fixtures/fragment-refs-parity-ledger.tsrx';
import { NestedFragments } from './_fixtures/fragment-refs-misc.tsrx';

let mounted: MountResult | null = null;
const portalTargets: Element[] = [];

afterEach(() => {
	try {
		mounted?.unmount();
	} finally {
		mounted = null;
		for (const target of portalTargets) target.remove();
		portalTargets.length = 0;
		vi.restoreAllMocks();
	}
});

function makeRef(): { current: FragmentInstance | null } {
	return { current: null };
}

describe('Fragment refs — upstream parity audit oracles', () => {
	it('focuses deeply nested focusable children depth-first with focus()', () => {
		const fragmentRef = makeRef();
		mounted = mount(LedgerNestedFocus, { fragmentRef });
		fragmentRef.current!.focus();
		expect(document.activeElement).toBe(mounted.find('#ledger-focus-first'));
	});

	it('focuses deeply nested focusable children depth-first with focusLast()', () => {
		const fragmentRef = makeRef();
		mounted = mount(LedgerNestedFocus, { fragmentRef });
		fragmentRef.current!.focusLast();
		expect(document.activeElement).toBe(mounted.find('#ledger-focus-last-nested'));
	});

	it('keeps focus on a nested child if already focused', () => {
		const fragmentRef = makeRef();
		mounted = mount(LedgerNestedFocus, { fragmentRef });
		const nested = mounted.find('#ledger-focus-first') as HTMLElement;
		nested.focus();
		const focus = vi.spyOn(nested, 'focus');
		fragmentRef.current!.focus();
		expect(document.activeElement).toBe(nested);
		expect(focus).not.toHaveBeenCalled();
	});

	it('preserves document order when adding and removing focusable children', () => {
		const fragmentRef = makeRef();
		const props = { fragmentRef, showFirst: true, showSecond: false };
		mounted = mount(LedgerDynamicFocus, props);
		const fragment = fragmentRef.current!;
		fragment.focus();
		expect(document.activeElement).toBe(mounted.find('#ledger-dynamic-first'));
		(document.activeElement as HTMLElement).blur();

		mounted.update(LedgerDynamicFocus, { ...props, showSecond: true });
		fragment.focus();
		expect(document.activeElement).toBe(mounted.find('#ledger-dynamic-first'));
		(document.activeElement as HTMLElement).blur();

		mounted.update(LedgerDynamicFocus, { ...props, showFirst: false, showSecond: true });
		fragment.focus();
		expect(document.activeElement).toBe(mounted.find('#ledger-dynamic-second'));
	});

	it('removes focus from a nested element inside the Fragment', () => {
		const fragmentRef = makeRef();
		mounted = mount(LedgerNestedFocus, { fragmentRef });
		const nested = mounted.find('#ledger-focus-first-nested') as HTMLElement;
		nested.focus();
		expect(document.activeElement).toBe(nested);
		fragmentRef.current!.blur();
		expect(document.activeElement).not.toBe(nested);
	});

	it('adds and removes event listeners from children with multiple fragments', () => {
		const outerRef = makeRef();
		const innerRef = makeRef();
		mounted = mount(NestedFragments, { outerRef, innerRef });
		const fired: string[] = [];
		const onOuter = () => fired.push('outer');
		const onInner = () => fired.push('inner');
		outerRef.current!.addEventListener('click', onOuter);
		innerRef.current!.addEventListener('click', onInner);
		mounted.find('#inner-a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['outer', 'inner']);

		fired.length = 0;
		mounted.find('#outer-a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['outer']);

		outerRef.current!.removeEventListener('click', onOuter);
		mounted.find('#inner-a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['outer', 'inner']);
		innerRef.current!.removeEventListener('click', onInner);
		mounted.find('#inner-a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toEqual(['outer', 'inner']);
	});

	it('returns disconnected for comparison with an unmounted fragment instance', () => {
		const fragmentRef = makeRef();
		mounted = mount(LedgerRemovableFragment, { fragmentRef, mounted: true });
		const fragment = fragmentRef.current!;
		const parent = mounted.find('#ledger-removable-parent');
		expect(fragment.compareDocumentPosition(parent)).toBe(
			Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINS,
		);

		mounted.update(LedgerRemovableFragment, { fragmentRef, mounted: false });
		expect(fragment.compareDocumentPosition(parent)).toBe(Node.DOCUMENT_POSITION_DISCONNECTED);
	});

	it('compares a root-level Fragment and its empty Fragment sibling', () => {
		const fragmentRef = makeRef();
		const emptyRef = makeRef();
		mounted = mount(LedgerRootPositions, { fragmentRef, emptyRef });
		const fragment = fragmentRef.current!;
		const empty = emptyRef.current!;
		const before = mounted.find('#ledger-root-before');
		const child = mounted.find('#ledger-root-child');
		const after = mounted.find('#ledger-root-after');
		expect(fragment.compareDocumentPosition(child)).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
		expect(fragment.compareDocumentPosition(before)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
		expect(fragment.compareDocumentPosition(after)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(empty.compareDocumentPosition(child)).toBe(
			Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		expect(empty.compareDocumentPosition(after)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
	});

	it('compares an empty Fragment rendered into a portal', () => {
		const fragmentRef = makeRef();
		mounted = mount(LedgerPortaledEmptyFragment, { fragmentRef, target: document.body });
		const fragment = fragmentRef.current!;
		expect(fragment.compareDocumentPosition(document.body)).toBe(
			Node.DOCUMENT_POSITION_PRECEDING |
				Node.DOCUMENT_POSITION_CONTAINS |
				Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		for (const selector of ['#ledger-empty-before', '#ledger-empty-after']) {
			expect(fragment.compareDocumentPosition(mounted.find(selector))).toBe(
				Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
			);
		}
	});

	it('distinguishes multiple Fragment-owned portals sharing one foreign target', () => {
		const firstTarget = document.createElement('section');
		const secondTarget = document.createElement('section');
		document.body.append(firstTarget, secondTarget);
		portalTargets.push(firstTarget, secondTarget);
		const fragmentRef = makeRef();
		mounted = mount(LedgerPortalScrollContainers, { fragmentRef, firstTarget, secondTarget });
		for (const id of ['ledger-portal-second', 'ledger-portal-third']) {
			const portaled = secondTarget.querySelector('#' + id)!;
			expect(fragmentRef.current!.compareDocumentPosition(portaled)).toBe(
				Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
			);
		}
		const outside = secondTarget.querySelector('#ledger-portal-outside')!;
		expect(
			fragmentRef.current!.compareDocumentPosition(outside) & Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBe(0);
	});

	it('validates logical position when sibling portals share the same host', () => {
		const fragmentRef = makeRef();
		const props = { fragmentRef, target: document.body, showLate: false };
		mounted = mount(LedgerInterleavedPortals, props);
		expect(fragmentRef.current).toBeInstanceOf(FragmentInstance);
		mounted.update(LedgerInterleavedPortals, { ...props, showLate: true });
		expect(fragmentRef.current).toBeInstanceOf(FragmentInstance);
		const fragment = fragmentRef.current!;
		const first = document.querySelector('#ledger-shared-first')!;
		const outside = document.querySelector('#ledger-shared-outside')!;
		const late = document.querySelector('#ledger-shared-late')!;
		const nested = document.querySelector('#ledger-shared-nested')!;
		const sourceBefore = mounted.find('#ledger-shared-source-before');
		const sourceAfter = mounted.find('#ledger-shared-source-after');
		expect(
			Array.from(
				document.querySelectorAll(
					'#ledger-shared-first, #ledger-shared-outside, #ledger-shared-late',
				),
			).map((element) => element.id),
		).toEqual(['ledger-shared-first', 'ledger-shared-outside', 'ledger-shared-late']);
		expect(fragment.compareDocumentPosition(document.body)).toBe(
			Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINS,
		);
		for (const child of [first, late, nested]) {
			expect(fragment.compareDocumentPosition(child)).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
		}
		expect(fragment.compareDocumentPosition(sourceBefore)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
		expect(fragment.compareDocumentPosition(outside)).toBe(
			Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		expect(fragment.compareDocumentPosition(sourceAfter)).toBe(
			Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
	});

	it('scrolls portaled children in order across different scroll containers', () => {
		const firstTarget = document.createElement('section');
		const secondTarget = document.createElement('section');
		document.body.append(firstTarget, secondTarget);
		portalTargets.push(firstTarget, secondTarget);
		const fragmentRef = makeRef();
		mounted = mount(LedgerPortalScrollContainers, { fragmentRef, firstTarget, secondTarget });
		const calls: string[] = [];
		for (const target of [firstTarget, secondTarget]) {
			for (const child of target.querySelectorAll('button')) {
				child.scrollIntoView = () => calls.push(child.id);
			}
		}

		fragmentRef.current!.scrollIntoView();
		expect(calls).toEqual(['ledger-portal-third', 'ledger-portal-second', 'ledger-portal-first']);
		calls.length = 0;
		fragmentRef.current!.scrollIntoView(false);
		expect(calls).toEqual(['ledger-portal-first', 'ledger-portal-second', 'ledger-portal-third']);
	});
});
