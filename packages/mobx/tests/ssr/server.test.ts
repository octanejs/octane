import { afterEach, describe, expect, it } from 'vitest';
import { enableStaticRendering, getObserverTree, observable } from '@octanejs/mobx';
import { renderToString } from 'octane/server';
import { ServerCounter } from '../_fixtures/store.tsrx';

describe('MobX static rendering', () => {
	afterEach(() => {
		enableStaticRendering(false);
	});

	it('renders deterministic markup without retaining an observer', () => {
		const store = observable({
			count: 4,
			other: 0,
			nested: { label: 'Ada' },
		});
		enableStaticRendering(true);

		const first = renderToString(ServerCounter, { store }).html;
		const second = renderToString(ServerCounter, { store }).html;

		expect(first).toBe(second);
		expect(first).toContain('>4</span>');
		expect(getObserverTree(store, 'count').observers).toBeUndefined();
	});
});
