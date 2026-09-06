// Misuse must be loud. Metadata that silently does nothing is worse than a
// crash, because nobody notices until a page has been unindexed for weeks.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { NoHead, StrayOwners } from './_fixtures/misuse.tsrx';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

function mount(Component: unknown) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	return {
		render: () => {
			root.render(Component as never);
			settle();
		},
		cleanup: () => {
			try {
				root.unmount();
			} catch {
				// A render that threw may leave nothing to unmount.
			}
			container.remove();
		},
	};
}

afterEach(() => {
	document.head.innerHTML = '';
});

describe('misuse diagnostics', () => {
	it('throws when a tag renders with no <Head> above it', () => {
		const app = mount(NoHead);
		expect(app.render).toThrow(/@octanejs\/seo.*<Head>/s);
		app.cleanup();
	});

	it('reports two <Head> elements where neither contains the other', () => {
		// This arrangement makes one component's metadata silently ineffective,
		// so it is an error-level report naming the fix, not a style warning.
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const app = mount(StrayOwners);
		app.render();

		const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
		expect(messages).toContain('@octanejs/seo');
		expect(messages).toContain('Wrap the app in a single');

		app.cleanup();
		error.mockRestore();
	});

	it('stays silent in a production build', () => {
		// The report is a development check, and the guard around it was rewritten
		// so a host without a `process` global stops throwing. A production build
		// that still has one must keep skipping it.
		vi.stubEnv('NODE_ENV', 'production');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const app = mount(StrayOwners);

		try {
			app.render();
			expect(error).not.toHaveBeenCalled();
		} finally {
			app.cleanup();
			error.mockRestore();
			vi.unstubAllEnvs();
		}
	});
});
