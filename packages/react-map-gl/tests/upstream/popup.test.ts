/** Ported from upstream/test/components/popup.spec.jsx. */
import { describe, expect, it } from 'vitest';
import { act, mapboxgl, mount, settle } from '../_helpers';
import { PopupMap } from '../_fixtures/upstream-apps.tsrx';

function baseProps(popupProps: Record<string, unknown>, richContent = false) {
	return {
		mapLib: Promise.resolve(mapboxgl),
		mapboxAccessToken: 'test-token',
		popupProps,
		richContent,
	};
}

describe('Popup', () => {
	// Per upstream/test/components/popup.spec.jsx:8 ('Popup')
	// @parity-case ported:popup:1
	it('attaches to the DOM, renders children, and updates its options', async () => {
		const ref: { current: any } = { current: null };
		const view = mount(
			PopupMap,
			baseProps({ ref, longitude: -122, latitude: 38, offset: [0, 10] }) as any,
		);
		try {
			await settle();

			expect(view.container.querySelector('.mapboxgl-popup')).not.toBeNull();
			expect(ref.current).toBeTruthy();

			const popup = ref.current;
			const { anchor, offset, maxWidth } = popup.options;

			view.update(
				PopupMap,
				baseProps({ ref, longitude: -122, latitude: 38, offset: [0, 10] }, true) as any,
			);
			await settle();

			expect(popup.options.offset).toBe(offset);
			expect(view.container.querySelector('#popup-content')).not.toBeNull();

			view.update(
				PopupMap,
				baseProps(
					{
						ref,
						longitude: -122,
						latitude: 38,
						offset: { top: [0, 0], left: [10, 0] },
						anchor: 'top',
						maxWidth: '100px',
					},
					true,
				) as any,
			);
			await settle();

			expect(popup.options.offset).not.toBe(offset);
			expect(popup.options.anchor).not.toBe(anchor);
			expect(popup.options.maxWidth).not.toBe(maxWidth);

			view.update(
				PopupMap,
				baseProps({ ref, longitude: -122, latitude: 38, className: 'classA' }, true) as any,
			);
			await settle();

			expect(popup._container.classList.contains('classA')).toBe(true);
		} finally {
			act(() => view.unmount());
		}
	});

	// Per upstream/test/components/popup.ts:54 — the unmount path must not report
	// a user-initiated close, or a controlled popup would immediately reopen.
	// @parity-case ported:popup:2
	it('does not fire onClose when the popup is removed by unmounting', async () => {
		let closes = 0;
		const view = mount(
			PopupMap,
			baseProps({ longitude: -122, latitude: 38, onClose: () => closes++ }) as any,
		);
		await settle();

		act(() => view.unmount());
		await settle();

		expect(closes).toBe(0);
	});
});
