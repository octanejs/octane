import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { PersistenceHydrationFixture } from '../_fixtures/persistence-hydration.tsrx';

describe('react-resizable-panels persistence SSR', () => {
	it('renders deterministic defaults when no server-capable storage is provided', () => {
		const first = renderToString(PersistenceHydrationFixture, {}).html;
		const second = renderToString(PersistenceHydrationFixture, {}).html;
		expect(first).toBe(second);
		expect(first).toContain('data-layout="default"');
	});

	it('restores an injected server-capable storage layout during SSR', () => {
		const values = new Map([['react-resizable-panels:hydrated', '{"left":30,"right":70}']]);
		const storage = {
			getItem(key: string) {
				return values.get(key) ?? null;
			},
			setItem() {
				throw new Error('storage must not be written during server render');
			},
		};

		const html = renderToString(PersistenceHydrationFixture, { storage }).html;
		expect(html).toContain('data-layout="{&quot;left&quot;:30,&quot;right&quot;:70}"');
	});
});
