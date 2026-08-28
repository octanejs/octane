// @vitest-environment node

import React from 'react';
import ReactSelect, { NonceProvider as ReactNonceProvider } from 'react-select';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { NonceFixture } from './nonce-fixture.tsrx';
import { NonceProvider } from '../src/index';

describe('NonceProvider parity', () => {
	it('is a public root export', () => {
		expect(typeof NonceProvider).toBe('function');
	});

	it.each(['nonce-a', 'nonce-b'])(
		'applies cache key %s and the CSP nonce to every SSR style',
		(cacheKey) => {
			const nonce = 'csp-secret';
			const react = renderToStaticMarkup(
				React.createElement(
					ReactNonceProvider,
					{ cacheKey, nonce },
					React.createElement(ReactSelect, {
						instanceId: 'nonce',
						options: [{ label: 'One', value: '1' }],
					}),
				),
			);
			const octane = renderToString(NonceFixture, { cacheKey, nonce });
			const reactStyles = [...react.matchAll(/<style data-emotion="[^"]+" nonce="([^"]+)">/g)];
			const octaneStyles = [
				...octane.css.matchAll(/<style data-octane="([^"]+)" nonce="([^"]+)">/g),
			];
			expect(reactStyles.length).toBeGreaterThan(0);
			expect(octaneStyles.length).toBe(reactStyles.length);
			expect(reactStyles.every((match) => match[1] === nonce)).toBe(true);
			expect(octaneStyles.every((match) => match[2] === nonce)).toBe(true);
			expect(octaneStyles.every((match) => match[1].startsWith(`${cacheKey}-`))).toBe(true);
			expect(octane.html).toContain(`${cacheKey}-`);
		},
	);
});
