import assert from 'node:assert/strict';

import { Window } from 'happy-dom';

const window = new Window({ url: 'https://octane.test/' });
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;

const { createStyleCache, resolveStyle } = await import('./style-adapter.mjs');
const { resolveOctaneStyle } = await import('./octane-style.mjs');

const cache = createStyleCache({ key: 'rs', nonce: 'client-nonce' });
const first = resolveStyle(cache, {
	color: 'hotpink',
	'&:hover': { color: 'rebeccapurple' },
});
const firstTags = document.querySelectorAll('style[data-emotion="rs"]');
assert.equal(firstTags.length, 1);
assert.equal(firstTags[0].getAttribute('nonce'), 'client-nonce');

const second = resolveStyle(cache, {
	color: 'hotpink',
	'&:hover': { color: 'rebeccapurple' },
});
assert.equal(second.className, first.className);
assert.equal(document.querySelectorAll('style[data-emotion="rs"]').length, 1);
const dedupedTags = document.querySelectorAll('style[data-emotion="rs"]').length;

resolveStyle(cache, { color: 'royalblue' });
const orderedRules = [...document.querySelectorAll('style[data-emotion="rs"]')]
	.flatMap((tag) => [...(tag.sheet?.cssRules ?? [])].map((rule) => rule.cssText))
	.join('\n');
assert.ok(orderedRules.indexOf('hotpink') < orderedRules.indexOf('royalblue'), orderedRules);

const other = createStyleCache({ key: 'other' });
resolveStyle(other, { color: 'hotpink' });
assert.equal(document.querySelectorAll('style[data-emotion="other"]').length, 1);

const hydrationWindow = new Window({ url: 'https://octane.test/hydrate' });
const serverStyle = hydrationWindow.document.createElement('style');
serverStyle.setAttribute('data-octane', first.id);
serverStyle.textContent = '.server-rule{color:hotpink;}';
hydrationWindow.document.head.appendChild(serverStyle);
globalThis.window = hydrationWindow;
globalThis.document = hydrationWindow.document;

const hydrationCache = createStyleCache({ key: 'rs' });
resolveOctaneStyle(hydrationCache, {
	color: 'hotpink',
	'&:hover': { color: 'rebeccapurple' },
});
assert.equal(hydrationWindow.document.querySelectorAll('style').length, 1);

process.stdout.write(
	JSON.stringify({
		className: first.className,
		clientNonce: firstTags[0].getAttribute('nonce'),
		dedupedTags,
		orderedRules: orderedRules.includes('hotpink') && orderedRules.includes('royalblue'),
		hydratedTags: hydrationWindow.document.querySelectorAll('style').length,
	}),
);
