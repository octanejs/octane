import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';
import { Collapsible } from '@octanejs/base-ui/collapsible';
import { mount } from '../../octane/tests/_helpers';

const KEEP_MOUNTED_WARNING =
	'Base UI: The `keepMounted={false}` prop on `Collapsible.Panel` is ignored when ' +
	'`hiddenUntilFound` is enabled, since the panel must remain mounted while closed.';

function mountConflictingPanel() {
	return mount(() =>
		createElement(Collapsible.Root, {
			children: createElement(
				Collapsible.Panel,
				{ hiddenUntilFound: true, keepMounted: false },
				'Panel content',
			),
		}),
	);
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('Collapsible diagnostics', () => {
	it('warns in development when hiddenUntilFound overrides keepMounted={false}', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const m = mountConflictingPanel();

		try {
			expect(warn).toHaveBeenCalledWith(KEEP_MOUNTED_WARNING);
		} finally {
			m.unmount();
		}
	});

	it('does not warn in production when hiddenUntilFound overrides keepMounted={false}', () => {
		vi.stubEnv('NODE_ENV', 'production');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const m = mountConflictingPanel();

		try {
			expect(m.container.textContent).toBe('Panel content');
			expect(warn).not.toHaveBeenCalled();
		} finally {
			m.unmount();
		}
	});
});
