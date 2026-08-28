// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAsync as useReactAsync } from 'react-select/async';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { AsyncFixture, type AsyncOption, type AsyncResult } from './browser/async-fixture.tsrx';

function ReactFixture(props: Record<string, unknown>) {
	const result = useReactAsync<AsyncOption, false, never, Record<string, unknown>>(props as never);
	return React.createElement('output', {
		'data-loading': String(result.isLoading),
		'data-options': JSON.stringify(result.options),
	});
}

describe('useAsync SSR parity', () => {
	it.each([{ defaultOptions: [{ label: 'Default', value: 'default' }] }, { defaultOptions: true }])(
		'matches React initial server state for %#',
		(asyncProps) => {
			const react = renderToStaticMarkup(React.createElement(ReactFixture, asyncProps));
			let result: AsyncResult | undefined;
			const octane = renderToString(AsyncFixture, {
				asyncProps,
				bind(next) {
					result = next;
				},
			});
			expect(octane.html).toBe(react);
			expect(result?.filterOption).toBeNull();
		},
	);
});
