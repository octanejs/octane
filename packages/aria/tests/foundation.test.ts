import { describe, it, expect } from 'vitest';
import { act, mount, nextPaint } from '../../octane/tests/_helpers';
import {
	IdOnElement,
	IdDefault,
	ChainedHandlers,
	MergedIds,
	ObjectRefProbe,
} from './_fixtures/foundation.tsx';

// @octanejs/aria Phase 0 — the utils foundation (useId / mergeProps / useObjectRef).

describe('@octanejs/aria — useId', () => {
	it('renders a react-aria-prefixed id', () => {
		const r = mount(IdOnElement);
		const el = r.container.querySelector('div')!;
		expect(el.id.startsWith('react-aria')).toBe(true);
		r.unmount();
	});

	it('a caller-supplied default id wins', () => {
		const r = mount(IdDefault);
		const el = r.container.querySelector('div')!;
		expect(el.id).toBe('my-id');
		r.unmount();
	});
});

describe('@octanejs/aria — mergeProps', () => {
	it('chains both event handlers and combines classNames', async () => {
		const r = mount(ChainedHandlers);
		const btn = r.container.querySelector('button')!;
		expect(btn.className).toBe('one two');
		await act(() => {
			btn.click();
		});
		expect(btn.textContent).toBe('clicks:1:10');
		r.unmount();
	});

	it('merged ids converge: both useId consumers end up with the merged id', async () => {
		const r = mount(MergedIds);
		// The retroactive id update runs from a passive effect; let it settle.
		await nextPaint();
		await nextPaint();
		const a = r.container.querySelector('[data-testid="a"]')!;
		const b = r.container.querySelector('[data-testid="b"]')!;
		const merged = r.container.querySelector('[data-testid="merged"]')!;
		expect(a.id).toBe(merged.id);
		expect(b.id).toBe(merged.id);
		expect(merged.id.length).toBeGreaterThan(0);
		r.unmount();
	});
});

describe('@octanejs/aria — useObjectRef', () => {
	it('forwards the attached node to the original callback ref', async () => {
		const r = mount(ObjectRefProbe);
		await nextPaint();
		const el = r.container.querySelector('output')!;
		expect(el.getAttribute('data-tag')).toBe('output');
		r.unmount();
	});
});
