import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { RouterProvider } from '@octanejs/tanstack-router';
import { getLinkEvidence, makeLinkRouter, resetLinkEvidence } from '../_fixtures/link.tsrx';

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

// Documented Link divergences selected by the adapted-octane parity lanes.
describe('@octanejs/tanstack-router — Link', () => {
	// Octane framework contract: plain ref prop (no forwardRef).
	// @parity-case adapted:tanstack-router-ref-prop
	it('passes the custom createLink anchor through the plain ref prop', async () => {
		resetLinkEvidence();
		const router = makeLinkRouter('/cl');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(getLinkEvidence().ref).toBe(r.find('.l-fancy'));
		r.unmount();
	});

	// Octane framework contract: native MouseEvent link callbacks.
	// @parity-case adapted:tanstack-router-native-events
	it('passes a native MouseEvent to Link callbacks', async () => {
		resetLinkEvidence();
		const router = makeLinkRouter('/');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		(r.find('.l-evidence') as HTMLElement).click();
		await flush();
		const event = getLinkEvidence().event;
		expect(event).toBeInstanceOf(MouseEvent);
		expect(event?.target).toBe(r.find('.l-evidence'));
		r.unmount();
	});
});
