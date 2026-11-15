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
