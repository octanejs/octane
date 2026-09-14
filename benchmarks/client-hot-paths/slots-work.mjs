import assert from 'node:assert/strict';

// Consumer controls shared by minified, diagnostic, and precisely observed builds.
// No private Block/slot fields are read. Repeated warm passes normalize to one
// semantic result so coverage instrumentation cannot mask a changed outcome.
export function exerciseSlots(api, rounds) {
	const results = [];
	for (let round = 0; round < rounds; round++) {
		const container = document.createElement('div');
		const portal = document.createElement('div');
		document.body.append(container, portal);
		let effects = 0;
		let cleanups = 0;
		let picked;
		let props = {
			component: api.Child,
			identity: 'a',
			label: 'first',
			value: 'text',
			pick: (value) => {
				picked = value;
			},
			effect: () => {
				effects++;
			},
			cleanup: () => {
				cleanups++;
			},
		};
		const root = api.createRoot(container);
		const render = (next) =>
			api.flushSync(() => root.render(api.Slots, (props = { ...props, ...next })));
		try {
			root.render(api.Slots, props);
			api.flushSync(() => {});
			const article = container.querySelector('article');
			const input = article.querySelector('input');
			const button = article.querySelector('button');
			input.value = 'typed';
			api.flushSync(() => button.click());
			assert.equal(button.textContent, 'first:1');
			assert.equal(picked, 'first');
			for (let i = 0; i < 8; i++) render({ label: 'next' });
			assert.equal(container.querySelector('article'), article);
			assert.equal(input.value, 'typed');
			api.flushSync(() => button.click());
			assert.equal(button.textContent, 'next:2');
			assert.equal(picked, 'next');
			assert.equal(effects, 2);
			assert.equal(cleanups, 1);
			render({ identity: 'b' });
			assert.notEqual(container.querySelector('article'), article);
			assert.equal(container.querySelector('button').textContent, 'next:0');
			assert.equal(container.querySelector('input').value, 'next');
			render({ component: api.Other });
			assert.equal(container.querySelector('article'), null);
			assert.equal(container.querySelector('aside').textContent, 'next');
			render({ component: api.Child });
			const hole = container.querySelector('[data-hole]');
			assert.equal(hole.textContent, 'text');
			for (const [value, expected] of [
				[42, '42'],
				[null, ''],
				[api.createElement('em', null, 'host'), 'host'],
				[
					[api.createElement('b', { key: 1 }, 'one'), api.createElement('b', { key: 2 }, 'two')],
					'onetwo',
				],
				[api.createElement(api.Other, { ...props, label: 'child' }), 'child'],
				[api.createPortal(api.createElement('strong', null, 'remote'), portal), ''],
			]) {
				render({ value });
				assert.equal(hole.textContent, expected);
			}
			assert.equal(portal.textContent, 'remote');
			render({ value: 'last' });
			assert.equal(hole.textContent, 'last');
			assert.equal(portal.childNodes.length, 0);
			assert.equal(container.querySelector('button').textContent, 'next:0');
		} finally {
			root.unmount();
			assert.equal(container.childNodes.length, 0);
			assert.equal(portal.childNodes.length, 0);
			assert.equal(effects, cleanups);
			container.remove();
			portal.remove();
		}
		if (round === 0)
			results.push({ picked, effects, cleanups, survivor: true, shapes: 7, portalCleanup: true });
	}
	return results;
}
