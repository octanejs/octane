import type { Store, StoreRegistry, SyncStatus } from '@livestore/livestore';
import { renderToStaticMarkup } from 'octane/server';
import { describe, expect, it, vi } from 'vitest';
import { ServerView } from '../_fixtures/server.tsrx';

describe('@octanejs/livestore SSR', () => {
	it('reads synchronous state without starting subscriptions or browser work', () => {
		expect(typeof document).toBe('undefined');
		const subscribeSyncStatus = vi.fn();
		const status = { isSynced: false, pendingCount: 2 } as SyncStatus;
		const store = {
			syncStatus: () => status,
			subscribeSyncStatus,
		} as unknown as Store<any>;
		const registry = { marker: 'registry' } as unknown as StoreRegistry;

		const { html, css } = renderToStaticMarkup(ServerView, { store, registry });

		expect(html).toBe('<p id="server-state">{"marker":"registry"}/false/2</p>');
		expect(css).toBe('');
		expect(subscribeSyncStatus).not.toHaveBeenCalled();
	});
});
