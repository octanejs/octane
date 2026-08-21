import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '../_helpers';
import {
	Fragment,
	FragmentInstance,
	cloneElement,
	createElement,
	createRoot,
	flushSync,
	type ElementDescriptor,
} from '../../src/index.js';
import {
	ActivityDescriptorFragment,
	SuspenseDescriptorFragment,
} from './_fixtures/fragment-refs-descriptors.tsrx';

type FragmentReference = { current: FragmentInstance | null };
type PublicRoot = ReturnType<typeof createRoot>;

let root: PublicRoot | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
	try {
		root?.unmount();
	} finally {
		root = null;
		container?.remove();
		container = null;
		vi.restoreAllMocks();
	}
});

function render<Props>(value: ElementDescriptor<Props>): HTMLDivElement {
	if (root === null) {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	}
	flushSync(() => root!.render(value));
	return container!;
}

describe('Fragment refs on public createElement descriptors', () => {
	it('attaches an object ref to a directly rendered Fragment descriptor', () => {
		const ref: FragmentReference = { current: null };
		const host = render(
			createElement(
				Fragment,
				{ ref },
				createElement('button', { id: 'descriptor-direct' }, 'direct'),
			),
		);
		const child = host.querySelector('#descriptor-direct')!;
		expect(ref.current).toBeInstanceOf(FragmentInstance);
		expect(ref.current!.compareDocumentPosition(child)).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
		expect(
			(child as Element & { reactFragments?: Set<FragmentInstance> }).reactFragments,
		).toContain(ref.current!);
	});

	it('attaches a ref inside a host descriptor without adding a wrapper element', () => {
		const ref: FragmentReference = { current: null };
		const host = render(
			createElement(
				'main',
				{ id: 'descriptor-host' },
				createElement('i', { id: 'descriptor-before' }, 'before'),
				createElement(
					Fragment,
					{ ref },
					createElement('button', { id: 'descriptor-child' }, 'child'),
				),
				createElement('i', { id: 'descriptor-after' }, 'after'),
			),
		);
		const main = host.querySelector('#descriptor-host')!;
		expect(Array.from(main.children).map((element) => element.id)).toEqual([
			'descriptor-before',
			'descriptor-child',
			'descriptor-after',
		]);
		expect(ref.current).toBeInstanceOf(FragmentInstance);
		expect(ref.current!.compareDocumentPosition(main.querySelector('#descriptor-child')!)).toBe(
			Node.DOCUMENT_POSITION_CONTAINED_BY,
		);
		expect(
			ref.current!.compareDocumentPosition(main.querySelector('#descriptor-before')!) &
				Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBe(0);
	});

	it('calls descriptor callback refs and their React 19 cleanup on unmount', () => {
		const calls: string[] = [];
		const callback = (fragment: FragmentInstance | null) => {
			if (fragment === null) {
				calls.push('null');
				return;
			}
			calls.push('attach');
			return () => calls.push('cleanup');
		};
		render(createElement(Fragment, { ref: callback }, createElement('span', null, 'callback')));
		expect(calls).toEqual(['attach']);
		root!.unmount();
		root = null;
		expect(calls).toEqual(['attach', 'cleanup']);
	});

	it('attaches nested arrays of descriptor refs to the same FragmentInstance', () => {
		const first: FragmentReference = { current: null };
		const second: FragmentReference = { current: null };
		let callbackValue: FragmentInstance | null = null;
		render(
			createElement(
				Fragment,
				{
					ref: [first, [second, (instance: FragmentInstance | null) => (callbackValue = instance)]],
				},
				createElement('span', null, 'array'),
			),
		);
		expect(first.current).toBeInstanceOf(FragmentInstance);
		expect(second.current).toBe(first.current);
		expect(callbackValue).toBe(first.current);
		root!.unmount();
		root = null;
		expect(first.current).toBeNull();
		expect(second.current).toBeNull();
		expect(callbackValue).toBeNull();
	});

	it('keeps nested descriptor Fragment refs independent and shares inner children', () => {
		const outer: FragmentReference = { current: null };
		const inner: FragmentReference = { current: null };
		const host = render(
			createElement(
				Fragment,
				{ ref: outer },
				createElement('span', { id: 'descriptor-outer' }, 'outer'),
				createElement(
					Fragment,
					{ ref: inner },
					createElement('button', { id: 'descriptor-inner' }, 'inner'),
				),
			),
		);
		const outerChild = host.querySelector('#descriptor-outer')!;
		const innerChild = host.querySelector('#descriptor-inner')!;
		expect(outer.current).toBeInstanceOf(FragmentInstance);
		expect(inner.current).toBeInstanceOf(FragmentInstance);
		expect(outer.current).not.toBe(inner.current);
		expect(outer.current!.compareDocumentPosition(innerChild)).toBe(
			Node.DOCUMENT_POSITION_CONTAINED_BY,
		);
		expect(inner.current!.compareDocumentPosition(innerChild)).toBe(
			Node.DOCUMENT_POSITION_CONTAINED_BY,
		);
		expect(
			inner.current!.compareDocumentPosition(outerChild) & Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBe(0);
	});

	it('updates a descriptor ref without replacing its instance or existing host', () => {
		const first: FragmentReference = { current: null };
		const second: FragmentReference = { current: null };
		const descriptor = (ref: FragmentReference, label: string) =>
			createElement(Fragment, { ref }, createElement('button', { id: 'descriptor-stable' }, label));
		const host = render(descriptor(first, 'before'));
		const instance = first.current!;
		const child = host.querySelector('#descriptor-stable')!;
		expect(instance).toBeInstanceOf(FragmentInstance);

		render(descriptor(second, 'after'));
		expect(first.current).toBeNull();
		expect(second.current).toBe(instance);
		expect(host.querySelector('#descriptor-stable')).toBe(child);
		expect(child.textContent).toBe('after');
	});

	it('uses a cloned Fragment descriptor ref without attaching the original ref', () => {
		const original: FragmentReference = { current: null };
		const replacement: FragmentReference = { current: null };
		const initial = createElement(
			Fragment,
			{ ref: original },
			createElement('button', { id: 'descriptor-clone' }, 'cloned'),
		);
		const cloned = cloneElement(initial, { ref: replacement });
		const host = render(cloned);
		expect(original.current).toBeNull();
		expect(replacement.current).toBeInstanceOf(FragmentInstance);
		expect(
			replacement.current!.compareDocumentPosition(host.querySelector('#descriptor-clone')!),
		).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
	});

	it('preserves child identity when descriptor Fragment refs are added and removed', () => {
		const first: FragmentReference = { current: null };
		const second: FragmentReference = { current: null };
		const descriptor = (ref: FragmentReference | null) =>
			createElement(
				Fragment,
				{ ref },
				createElement('input', { id: 'descriptor-ref-toggle', defaultValue: 'initial' }),
			);
		const host = render(descriptor(null));
		const input = host.querySelector('#descriptor-ref-toggle') as HTMLInputElement;
		input.value = 'user editing';

		render(descriptor(first));
		expect(first.current).toBeInstanceOf(FragmentInstance);
		expect(host.querySelector('#descriptor-ref-toggle')).toBe(input);
		expect(input.value).toBe('user editing');

		render(descriptor(null));
		expect(first.current).toBeNull();
		expect(host.querySelector('#descriptor-ref-toggle')).toBe(input);
		expect(input.value).toBe('user editing');

		render(descriptor(second));
		expect(second.current).toBeInstanceOf(FragmentInstance);
		expect(host.querySelector('#descriptor-ref-toggle')).toBe(input);
		expect(input.value).toBe('user editing');
	});

	it('remounts keyed descriptor Fragments only when their key changes', () => {
		const ref: FragmentReference = { current: null };
		const descriptor = (key: string, label: string) =>
			createElement(
				'main',
				null,
				createElement(
					Fragment,
					{ key, ref },
					createElement('button', { id: 'descriptor-keyed' }, label),
				),
			);
		const host = render(descriptor('first', 'before'));
		const original = ref.current!;
		const originalChild = host.querySelector('#descriptor-keyed')!;
		expect(original).toBeInstanceOf(FragmentInstance);

		render(descriptor('first', 'updated'));
		expect(ref.current).toBe(original);
		expect(host.querySelector('#descriptor-keyed')).toBe(originalChild);
		expect(originalChild.textContent).toBe('updated');

		render(descriptor('second', 'replacement'));
		expect(ref.current).toBeInstanceOf(FragmentInstance);
		expect(ref.current).not.toBe(original);
		expect(host.querySelector('#descriptor-keyed')).not.toBe(originalChild);
	});

	it('attaches refs to empty and text-only descriptor Fragments', () => {
		const empty: FragmentReference = { current: null };
		const text: FragmentReference = { current: null };
		const host = render(
			createElement(
				'main',
				null,
				createElement(Fragment, { key: 'empty', ref: empty }),
				createElement(Fragment, { key: 'text', ref: text }, 'descriptor text'),
			),
		);
		expect(empty.current).toBeInstanceOf(FragmentInstance);
		expect(text.current).toBeInstanceOf(FragmentInstance);
		expect(empty.current!.getClientRects()).toEqual([]);
		expect(host.textContent).toBe('descriptor text');
	});

	it('attaches a Fragment descriptor returned by a normal JavaScript component', () => {
		const ref: FragmentReference = { current: null };
		function DescriptorComponent() {
			return createElement(
				Fragment,
				{ ref },
				createElement('button', { id: 'descriptor-component' }, 'component'),
			);
		}
		const host = render(createElement(DescriptorComponent, null));
		expect(ref.current).toBeInstanceOf(FragmentInstance);
		expect(ref.current!.compareDocumentPosition(host.querySelector('#descriptor-component')!)).toBe(
			Node.DOCUMENT_POSITION_CONTAINED_BY,
		);
	});

	it('preserves keyed descriptor Fragment instances and hosts through list reordering', () => {
		const first: FragmentReference = { current: null };
		const second: FragmentReference = { current: null };
		const descriptor = (reverse: boolean) => {
			const children = [
				createElement(
					Fragment,
					{ key: 'first', ref: first },
					createElement('input', { id: 'descriptor-list-first', defaultValue: 'first' }),
				),
				createElement(
					Fragment,
					{ key: 'second', ref: second },
					createElement('input', { id: 'descriptor-list-second', defaultValue: 'second' }),
				),
			];
			return createElement('main', null, reverse ? children.reverse() : children);
		};
		const host = render(descriptor(false));
		const firstInstance = first.current!;
		const secondInstance = second.current!;
		const firstInput = host.querySelector('#descriptor-list-first') as HTMLInputElement;
		const secondInput = host.querySelector('#descriptor-list-second') as HTMLInputElement;
		firstInput.value = 'edited first';
		secondInput.value = 'edited second';

		render(descriptor(true));
		expect(first.current).toBe(firstInstance);
		expect(second.current).toBe(secondInstance);
		expect(host.querySelector('#descriptor-list-first')).toBe(firstInput);
		expect(host.querySelector('#descriptor-list-second')).toBe(secondInput);
		expect(firstInput.value).toBe('edited first');
		expect(secondInput.value).toBe('edited second');
		expect(Array.from(host.querySelectorAll('input')).map((input) => input.id)).toEqual([
			'descriptor-list-second',
			'descriptor-list-first',
		]);
	});

	// Per ReactFiberCommitWork.js disappearLayoutEffects/reappearLayoutEffects
	// (React canary b740af2510de1e19fcb399abb862af26ff95ac80).
	it('disconnects descriptor refs while Activity preserves and reveals their hosts', () => {
		const fragmentRef: FragmentReference = { current: null };
		const host = render(
			createElement(ActivityDescriptorFragment, { fragmentRef, mode: 'visible' as const }),
		);
		const fragment = fragmentRef.current!;
		const child = host.querySelector('#descriptor-activity-child') as HTMLButtonElement & {
			reactFragments?: Set<FragmentInstance>;
		};
		expect(fragment).toBeInstanceOf(FragmentInstance);
		expect(child.reactFragments?.has(fragment)).toBe(true);

		render(createElement(ActivityDescriptorFragment, { fragmentRef, mode: 'hidden' as const }));
		expect(fragmentRef.current).toBeNull();
		expect(host.querySelector('#descriptor-activity-child')).toBe(child);
		expect(child.style.display).toBe('none');
		expect(child.reactFragments?.has(fragment)).toBe(false);

		render(createElement(ActivityDescriptorFragment, { fragmentRef, mode: 'visible' as const }));
		expect(fragmentRef.current).toBe(fragment);
		expect(host.querySelector('#descriptor-activity-child')).toBe(child);
		expect(child.style.display).toBe('');
		expect(child.reactFragments?.has(fragment)).toBe(true);
	});

	it('detaches and restores descriptor refs when Suspense hides and reveals a committed tree', async () => {
		const ready = Promise.resolve('ready') as Promise<string> & {
			status?: string;
			value?: string;
		};
		ready.status = 'fulfilled';
		ready.value = 'ready';
		const fragmentRef: FragmentReference = { current: null };
		const host = render(createElement(SuspenseDescriptorFragment, { fragmentRef, promise: ready }));
		const fragment = fragmentRef.current!;
		const child = host.querySelector('#descriptor-suspense-child') as HTMLButtonElement;
		expect(fragment).toBeInstanceOf(FragmentInstance);
		expect(host.querySelector('#descriptor-suspend-value')?.textContent).toBe('ready');

		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		render(createElement(SuspenseDescriptorFragment, { fragmentRef, promise: pending }));
		expect(host.querySelector('#descriptor-suspense-fallback')?.textContent).toBe('loading');
		expect(fragmentRef.current).toBeNull();

		await act(() => resolve('revealed'));
		expect(fragmentRef.current).toBe(fragment);
		expect(host.querySelector('#descriptor-suspense-child')).toBe(child);
		expect(host.querySelector('#descriptor-suspend-value')?.textContent).toBe('revealed');
	});
});
