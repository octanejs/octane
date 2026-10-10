import { describe, expect, it } from 'vitest';
import { createElement, lazy, memo, type ComponentBody } from '../src/index.js';
import { act, mount } from './_helpers';
import {
	AppLite,
	CapturePromotionChildren,
	MemoPromotionTree,
	PromotionBodyShell,
	PromotionLazyShell,
	PromotionTree,
} from './_fixtures/context-bailout-lite.tsrx';

function immediate<T>(value: T): PromiseLike<T> {
	return {
		then(resolve: any) {
			resolve(value);
		},
	} as PromiseLike<T>;
}

describe('context propagation through lightweight component scopes', () => {
	it('keeps memo wrappers callable outside their own rendered boundary', () => {
		const Value = memo((props: { text: string }) => props.text);
		expect(Value({ text: 'outside' })).toBe('outside');
		expect(Reflect.apply(Value, null, [{ text: 'extra argument' }, {}])).toBe('extra argument');
		const view = mount(() => Value({ text: 'inside' }));
		try {
			expect(view.container.textContent).toBe('inside');
		} finally {
			view.unmount();
		}
	});

	it('updates retained context consumers below memo without replacing their DOM', () => {
		const retained = [{ id: 'A' }, { id: 'B' }];
		for (const memoized of [false, true]) {
			const r = mount(AppLite, {
				memoized,
				identity: { label: 'one' },
				active: 'A',
				retained,
			});
			const originalA = r.find('output[data-owner="A"]');
			const update = (active: string, label: string) =>
				r.update(AppLite, { memoized, identity: { label }, active, retained });
			expect(originalA.textContent).toBe('one');

			update('A', 'two');
			expect(r.find('output[data-owner="A"]').textContent).toBe('two');

			update('B', 'three');
			expect(r.find('output[data-owner="B"]').textContent).toBe('three');
			update('B', 'four');
			expect(r.find('output[data-owner="B"]').textContent).toBe('four');

			update('A', 'five');
			const restoredA = r.find('output[data-owner="A"]');
			expect(restoredA).toBe(originalA);
			expect(restoredA.textContent).toBe('five');
			r.unmount();
		}
	});

	it('keeps retained consumers reactive when a lazy body becomes memoized', () => {
		let selected = PromotionTree;
		const Target = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		const identity = { label: 'one' };
		const view = mount(PromotionLazyShell, { Target, identity });
		try {
			const input = view.find('#promotion-draft') as HTMLInputElement;
			input.value = 'kept';
			selected = MemoPromotionTree;
			view.update(PromotionLazyShell, { Target, identity });
			for (const label of ['two', 'three']) {
				view.update(PromotionLazyShell, { Target, identity: { label } });
				expect(view.find('#promotion-value').textContent).toBe(label);
				expect(view.find('#promotion-draft')).toBe(input);
				expect(input.value).toBe('kept');
			}
		} finally {
			view.unmount();
		}
	});

	it('keeps context live when a render function becomes cached compiled children', () => {
		let child!: ComponentBody;
		const capture = mount(CapturePromotionChildren, {
			capture: (value: ComponentBody) => {
				child = value;
			},
		});
		capture.unmount();
		const identity = { label: 'one' };
		const forward: ComponentBody = (props, scope, extra) => child(props, scope, extra);
		const view = mount(PromotionBodyShell, { identity, child: forward });
		try {
			const input = view.find('#promotion-draft') as HTMLInputElement;
			input.value = 'kept';
			view.update(PromotionBodyShell, { identity, child });
			for (const label of ['two', 'three']) {
				view.update(PromotionBodyShell, { identity: { label }, child });
				expect(view.find('#promotion-value').textContent).toBe(label);
				expect(view.find('#promotion-draft')).toBe(input);
				expect(input.value).toBe('kept');
			}
		} finally {
			view.unmount();
		}
	});

	it('keeps context live when a memo render function becomes an element', () => {
		const identity = { label: 'one' };
		const view = mount(PromotionBodyShell, { identity, child: PromotionTree });
		try {
			const input = view.find('#promotion-draft') as HTMLInputElement;
			input.value = 'kept';
			view.update(PromotionBodyShell, { identity, child: MemoPromotionTree });
			const child = createElement(MemoPromotionTree);
			for (const label of ['two', 'three']) {
				view.update(PromotionBodyShell, { identity: { label }, child });
				expect(view.find('#promotion-value').textContent).toBe(label);
				expect(view.find('#promotion-draft')).toBe(input);
				expect(input.value).toBe('kept');
			}
		} finally {
			view.unmount();
		}
	});

	it('keeps context reactive after a memo promotion is rolled back by suspension', async () => {
		let selected = PromotionTree;
		const Target = lazy(() =>
			immediate({
				get default() {
					return selected;
				},
			}),
		);
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = done;
		});
		const view = mount(PromotionLazyShell, { Target, identity: { label: 'one' } });
		try {
			const input = view.find('#promotion-draft') as HTMLInputElement;
			input.value = 'kept';
			selected = MemoPromotionTree;
			view.update(PromotionLazyShell, { Target, identity: { label: 'held' }, promise: pending });
			expect(view.find('#promotion-value').textContent).toBe('one');
			expect(view.find('#promotion-draft')).toBe(input);
			await act(() => resolve());
			expect(view.find('#promotion-value').textContent).toBe('held');
			view.update(PromotionLazyShell, { Target, identity: { label: 'after' } });
			expect(view.find('#promotion-value').textContent).toBe('after');
			expect(view.find('#promotion-draft')).toBe(input);
			expect(input.value).toBe('kept');
		} finally {
			view.unmount();
		}
	});
});
