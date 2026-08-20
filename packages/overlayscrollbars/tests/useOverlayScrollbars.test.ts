// Per packages/overlayscrollbars/upstream/canonical/test/useOverlayScrollbars.test.tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement as h } from 'octane';
import { OverlayScrollbars } from 'overlayscrollbars';
import { ReinitButton } from './_fixtures/reinit.tsrx';

afterEach(cleanup);

describe('useOverlayScrollbars', function useOverlayScrollbarsSuite() {
	it('re-initialization', function reinitialization() {
		const { unmount, getByRole } = render(h(ReinitButton));
		const initializeBtn = getByRole('button');

		fireEvent.click(initializeBtn);
		fireEvent.click(initializeBtn);
		const snapshot = initializeBtn.innerHTML;
		fireEvent.click(initializeBtn);

		expect(snapshot).toBe(initializeBtn.innerHTML);
		expect(OverlayScrollbars(initializeBtn)).toBeDefined();

		unmount();

		expect(OverlayScrollbars(initializeBtn)).toBeUndefined();
	});
});
