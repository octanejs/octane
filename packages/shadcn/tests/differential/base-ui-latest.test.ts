// References: shadcn-ui/ui@7c9eaba1c0a6404c990c144a654792e3313c650d,
// apps/v4/registry/bases/base/ui/{select,navigation-menu,scroll-area}.tsx.
// React uses the pinned Base UI 1.8 primitives and the same Nova style transform.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/shadcn-diff/base-ui-latest.tsrx');
const cache = resolve(__dirname, '.react-cache');
await preloadDifferentialFixture(fixture, cache);

describe('differential: shadcn 4.21 Base UI wrappers', () => {
	// @parity-case differential:shadcn-base-select
	it('Select preserves selected labels and controlled updates', async () => {
		const pair = await mountDifferential(fixture, 'SelectExample', undefined, cache);
		try {
			await pair.step('selected Apple', () => {});
			await pair.step('controlled selection changes to Pear', async (octane, react) => {
				await octane.click('#choose-pear');
				await react.click('#choose-pear');
			});
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#selected-fruit').textContent).toBe('pear');
				expect(mount.find('#fruit-trigger').textContent).toContain('Pear');
			}
		} finally {
			pair.unmount();
		}
	});

	// @parity-case differential:shadcn-base-navigation-menu
	it('NavigationMenu preserves links, active state and trigger markup', async () => {
		const pair = await mountDifferential(fixture, 'NavigationExample', undefined, cache);
		try {
			await pair.step('navigation mount', () => {});
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#home-link').getAttribute('href')).toBe('#home');
				expect(mount.find('#docs-trigger').getAttribute('aria-expanded')).toBe('false');
			}
		} finally {
			pair.unmount();
		}
	});

	// @parity-case differential:shadcn-base-scroll-area
	it('ScrollArea preserves viewport content and horizontal scrollbar markup', async () => {
		const pair = await mountDifferential(fixture, 'ScrollExample', undefined, cache);
		try {
			await pair.step('scroll area mount', () => {});
			for (const mount of [pair.octane, pair.react])
				expect(mount.container.textContent).toContain('Scrollable content');
		} finally {
			pair.unmount();
		}
	});
});
