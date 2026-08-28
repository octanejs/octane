import assert from 'node:assert/strict';
import { test } from 'vitest';

import cacheModule from '@emotion/cache';
import { CacheProvider, jsx, keyframes } from '@emotion/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createStyleCache, resolveStyle } from './style-adapter.mjs';

const createCache = cacheModule.default ?? cacheModule;

function renderOracle(css, className = '', options = {}) {
	const cache = createCache({ key: options.key ?? 'rs', nonce: options.nonce });
	const html = renderToStaticMarkup(
		jsx(CacheProvider, {
			value: cache,
			children: jsx('div', { css, className, children: 'value' }),
		}),
	);
	const style = html.match(
		/<style data-emotion="([^"]+)"(?: nonce="([^"]+)")?>([\s\S]*?)<\/style>/,
	);
	const renderedClass = html.match(/<div class="([^"]+)"/);
	assert.ok(style, html);
	assert.ok(renderedClass, html);
	return {
		className: renderedClass[1],
		dataEmotion: style[1],
		nonce: style[2],
		rules: style[3],
	};
}

const cases = [
	{
		name: 'default and nested selectors',
		css: {
			boxSizing: 'border-box',
			color: 'hotpink',
			'&:hover': { color: 'rebeccapurple' },
		},
	},
	{
		name: 'media query and label',
		css: {
			label: 'control',
			display: 'flex',
			'@media (min-width: 40rem)': { display: 'grid' },
		},
	},
	{
		name: 'linked keyframes',
		css: {
			animation: `${keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })} 1s linear`,
		},
	},
];

for (const entry of cases) {
	test(`matches pinned Emotion server output for ${entry.name}`, () => {
		const oracle = renderOracle(entry.css, 'consumer', { key: 'rs' });
		const cache = createStyleCache({ key: 'rs' });
		const candidate = resolveStyle(cache, entry.css, 'consumer');

		assert.equal(candidate.className.trim(), oracle.className);
		assert.equal(candidate.rules, oracle.rules);
		assert.equal(candidate.dataEmotion, oracle.dataEmotion);
	});
}

test('matches registered-class composition', () => {
	const css = { backgroundColor: 'papayawhip' };
	const oracleCache = createCache({ key: 'rs' });
	oracleCache.registered['rs-existing'] = 'color:green;';
	const html = renderToStaticMarkup(
		jsx(CacheProvider, {
			value: oracleCache,
			children: jsx('div', {
				css,
				className: 'external rs-existing',
				children: 'value',
			}),
		}),
	);
	const oracleClass = html.match(/<div class="([^"]+)"/);
	const oracleRules = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	assert.ok(oracleClass, html);
	assert.ok(oracleRules, html);

	const cache = createStyleCache({ key: 'rs' });
	cache.registered['rs-existing'] = 'color:green;';
	const candidate = resolveStyle(cache, css, 'external rs-existing');
	assert.equal(candidate.className.trim(), oracleClass[1]);
	assert.equal(candidate.rules, oracleRules[1]);
});

test('retains the configured server nonce in the pinned oracle contract', () => {
	const oracle = renderOracle({ color: 'blue' }, '', { key: 'secure', nonce: 'nonce-value' });
	assert.equal(oracle.nonce, 'nonce-value');
});
