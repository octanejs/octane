import { describe, it, expect, vi } from 'vitest';
const { animateMock } = vi.hoisted(() => ({
	animateMock: vi.fn<
		(...args: unknown[]) => { stop: () => void; finished?: { then(done: () => void): unknown } }
	>(() => ({ stop: () => {} })),
}));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import {
	InheritedVariantCompletion,
	EqualVariantCompletion,
	DisabledVariantCompletion,
	ReducedEqualVariantCompletion,
	VariantCompletion,
	VariantTree,
} from '../_fixtures/variants.tsrx';

describe('variants', () => {
	it('resolves a label to a target, and propagates the active label to children', async () => {
		const r = mount(VariantTree);
		await nextPaint();
		const parent = r.find('#parent');
		const child = r.find('#child');
		// Parent resolves animate="visible" against its own variants.
		expect(animateMock).toHaveBeenCalledWith(parent, { opacity: 1 }, undefined);
		// Child has no explicit animate → inherits "visible" → resolves ITS variants.
		expect(animateMock).toHaveBeenCalledWith(child, { x: 100 }, undefined);
		r.unmount();
	});

	it('passes the authored definition of a completed host animation', async () => {
		const onComplete = vi.fn();
		const r = mount(VariantCompletion, { target: 'hidden', onComplete });
		try {
			await nextPaint();
			expect(onComplete).not.toHaveBeenCalled();
			r.update(VariantCompletion, { target: 'visible', onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toEqual([['visible']]);

			const target = Object.freeze({ opacity: 0.5, transition: Object.freeze({ duration: 0 }) });
			r.update(VariantCompletion, { target, onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toHaveLength(2);
			expect(onComplete.mock.lastCall?.[0]).toBe(target);

			r.update(VariantCompletion, { target: { ...target }, onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toHaveLength(2);
		} finally {
			r.unmount();
		}
	});

	it.each(['replaces', 'adds', 'removes'] as const)(
		'%s the completion listener without restarting the animation',
		async (change) => {
			const stop = vi.fn();
			let finish!: () => void;
			const finished = new Promise<void>((resolve) => {
				finish = resolve;
			});
			animateMock.mockReturnValueOnce({ stop, finished });
			const original = vi.fn();
			const next = vi.fn();
			const first = change === 'adds' ? undefined : original;
			const second = change === 'removes' ? undefined : next;
			const r = mount(VariantCompletion, { target: 'hidden', onComplete: first });
			try {
				r.update(VariantCompletion, { target: 'visible', onComplete: first });
				r.update(VariantCompletion, { target: 'visible', onComplete: second });
				expect(stop).not.toHaveBeenCalled();
				expect(original).not.toHaveBeenCalled();
				expect(next).not.toHaveBeenCalled();
				finish();
				await nextPaint();
				expect(original).not.toHaveBeenCalled();
				expect(next.mock.calls).toEqual(change === 'removes' ? [] : [['visible']]);
			} finally {
				r.unmount();
			}
		},
	);

	it('does not complete when no target ever starts', async () => {
		const onComplete = vi.fn();
		const r = mount(VariantCompletion, {});
		try {
			r.update(VariantCompletion, { onComplete });
			await nextPaint();
			expect(onComplete).not.toHaveBeenCalled();
		} finally {
			r.unmount();
		}
	});

	it.each(['replacement', 'target removal', 'unmount'] as const)(
		'suppresses completion delivered by a stopped animation on %s',
		async (teardown) => {
			let finish: (() => void) | undefined;
			const finished = {
				then(done: () => void) {
					finish = done;
				},
			};
			const stop = vi.fn(() => finish?.());
			animateMock.mockReturnValueOnce({ stop, finished });
			const onComplete = vi.fn();
			const r = mount(VariantCompletion, { target: 'hidden', onComplete });
			try {
				r.update(VariantCompletion, { target: 'visible', onComplete });
				if (teardown === 'unmount') r.unmount();
				else
					r.update(VariantCompletion, {
						target: teardown === 'replacement' ? 'hidden' : undefined,
						onComplete,
					});
				await nextPaint();
				expect(stop).toHaveBeenCalledOnce();
				expect(onComplete.mock.calls).toEqual(teardown === 'replacement' ? [['hidden']] : []);
			} finally {
				r.unmount();
			}
		},
	);

	it.each(['synchronous', 'promise'] as const)(
		'reports a throwing %s completion and still stops the animation',
		async (mode) => {
			const stop = vi.fn();
			animateMock.mockReturnValueOnce(
				mode === 'synchronous' ? { stop } : { stop, finished: Promise.resolve() },
			);
			const error = new Error('completion failed');
			const reportError = vi.fn();
			vi.stubGlobal('reportError', reportError);
			const onComplete = () => {
				throw error;
			};
			const r = mount(VariantCompletion, { target: 'hidden', onComplete });
			try {
				r.update(VariantCompletion, { target: 'visible', onComplete });
				await nextPaint();
				expect(reportError.mock.calls).toEqual([[error]]);
			} finally {
				r.unmount();
				vi.unstubAllGlobals();
			}
			expect(stop).toHaveBeenCalledOnce();
		},
	);

	it('completes changed equal-target named labels in descendant order without physical work', async () => {
		animateMock.mockClear();
		const onComplete = vi.fn();
		const r = mount(EqualVariantCompletion, { label: 'first', onComplete, child: true });
		try {
			expect(onComplete).not.toHaveBeenCalled();
			r.update(EqualVariantCompletion, { label: 'second', onComplete, child: true });
			await nextPaint();
			expect(onComplete.mock.calls).toEqual([
				['child', 'second'],
				['parent', 'second'],
			]);
			expect(animateMock).not.toHaveBeenCalled();
		} finally {
			r.unmount();
		}
	});

	it('completes an equal-target label immediately while the original animation finishes later', async () => {
		let finish!: () => void;
		const stop = vi.fn();
		animateMock.mockClear();
		animateMock.mockReturnValueOnce({
			stop,
			finished: {
				then(done: () => void) {
					finish = done;
				},
			},
		});
		const onComplete = vi.fn();
		const r = mount(EqualVariantCompletion, { label: 'first', onComplete });
		try {
			r.update(EqualVariantCompletion, { label: 'third', onComplete });
			r.update(EqualVariantCompletion, { label: 'fourth', onComplete });
			expect(onComplete.mock.calls).toEqual([['parent', 'fourth']]);
			expect(stop).not.toHaveBeenCalled();
			expect(animateMock).toHaveBeenCalledOnce();
			finish();
			expect(onComplete.mock.calls).toEqual([
				['parent', 'fourth'],
				['parent', 'third'],
			]);
		} finally {
			r.unmount();
		}
	});

	it('uses the effective child label and ignores listener-only changes', () => {
		const first = vi.fn();
		const next = vi.fn();
		const r = mount(EqualVariantCompletion, { label: 'first', child: true, onComplete: first });
		try {
			r.update(EqualVariantCompletion, {
				label: 'second',
				child: true,
				childLabel: 'second',
				onComplete: first,
			});
			expect(first.mock.calls).toEqual([
				['child', 'second'],
				['parent', 'second'],
			]);
			r.update(EqualVariantCompletion, { label: 'second', child: true, onComplete: next });
			expect(next).not.toHaveBeenCalled();
		} finally {
			r.unmount();
		}
	});

	it('lets a changed physical transition complete once instead of also completing the label', () => {
		animateMock.mockClear();
		const onComplete = vi.fn();
		const r = mount(EqualVariantCompletion, {
			label: 'first',
			transition: { duration: 1 },
			onComplete,
		});
		try {
			r.update(EqualVariantCompletion, {
				label: 'second',
				transition: { duration: 2 },
				onComplete,
			});
			expect(animateMock).toHaveBeenCalledOnce();
			expect(onComplete.mock.calls).toEqual([['parent', 'second']]);
		} finally {
			r.unmount();
		}
	});

	it('does not duplicate a named completion when reduced-motion policy restarts physical work', () => {
		animateMock.mockClear();
		const onComplete = vi.fn();
		const r = mount(ReducedEqualVariantCompletion, {
			label: 'first',
			reduced: 'never',
			onComplete,
		});
		try {
			r.update(ReducedEqualVariantCompletion, { label: 'second', reduced: 'always', onComplete });
			expect(animateMock).toHaveBeenCalledOnce();
			expect(onComplete.mock.calls).toEqual([['parent', 'second']]);
		} finally {
			r.unmount();
		}
	});

	it('does not complete unresolved or disabled named variants', () => {
		const onComplete = vi.fn();
		const unresolved = mount(EqualVariantCompletion, { label: 'missing', onComplete });
		try {
			unresolved.update(EqualVariantCompletion, { label: 'also-missing', onComplete });
		} finally {
			unresolved.unmount();
		}
		const disabled = mount(DisabledVariantCompletion, { label: 'first', onComplete });
		try {
			disabled.update(DisabledVariantCompletion, { label: 'second', onComplete });
		} finally {
			disabled.unmount();
		}
		expect(onComplete).not.toHaveBeenCalled();
	});

	it('does not dispatch a departing parent after the child completion unmounts it', () => {
		const calls: unknown[] = [];
		let r: ReturnType<typeof mount>;
		const onComplete = (host: string, definition: unknown) => {
			calls.push([host, definition]);
			if (host === 'child') r.unmount();
		};
		r = mount(EqualVariantCompletion, { label: 'first', child: true, onComplete });
		r.update(EqualVariantCompletion, { label: 'second', child: true, onComplete });
		expect(calls).toEqual([['child', 'second']]);
	});

	it('passes the inherited label from a completed child animation', async () => {
		const onComplete = vi.fn();
		const r = mount(InheritedVariantCompletion, { label: 'hidden', onComplete });
		try {
			await nextPaint();
			expect(onComplete).not.toHaveBeenCalled();
			r.update(InheritedVariantCompletion, { label: 'visible', onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toEqual([['visible']]);
		} finally {
			r.unmount();
		}
	});
});
