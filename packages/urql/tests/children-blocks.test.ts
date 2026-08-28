import type { Client } from '@urql/core';
import { render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { describe, expect, it } from 'vitest';

import { UrqlBlockChildren } from './_fixtures/children-blocks.tsrx';
import { mockClient } from './_client-mock';

describe('render-prop components', function renderPropComponents() {
	it('render compiled block children without invoking them with render-prop values', function block() {
		const view = render(
			createElement(UrqlBlockChildren, { client: mockClient as unknown as Client }),
		);

		expect(view.container.querySelector('#query-block')?.textContent).toBe('query');
		expect(view.container.querySelector('#mutation-block')?.textContent).toBe('mutation');
		expect(view.container.querySelector('#subscription-block')?.textContent).toBe('subscription');
		expect(view.container.querySelector('#consumer-block')?.textContent).toBe('consumer');
	});
});
