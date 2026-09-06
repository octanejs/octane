const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { realpathSync } = require('node:fs');
// The pack checker supplies its DOM test tool; framework imports resolve here,
// inside the isolated consumer installed entirely from package tarballs.
const { JSDOM } = require(process.env.OCTANE_PACK_CHECK_JSDOM);
const dom = new JSDOM('<!doctype html><body><form id="app"></form>', {
	pretendToBeVisual: true,
	url: 'https://example.test',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
	if (key in globalThis && !['navigator', 'Event', 'EventTarget'].includes(key)) continue;
	Object.defineProperty(globalThis, key, {
		value: dom.window[key],
		configurable: true,
		writable: true,
	});
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
const Octane = require('octane');
const { Select } = require('@octanejs/base-ui/select');
const { Combobox } = require('@octanejs/base-ui/combobox');
const { StoreInspector } = require('@octanejs/base-ui-utils/store');
assert.equal(typeof StoreInspector, 'function');
for (const pkg of [
	'@octanejs/base-ui/select',
	'@octanejs/base-ui-utils/store',
	'@octanejs/floating-ui',
]) {
	const from = createRequire(require.resolve(pkg));
	assert.equal(
		realpathSync(from.resolve('octane')),
		realpathSync(require.resolve('octane')),
		`${pkg} uses the consumer's Octane instance`,
	);
}
const h = Octane.createElement;
const root = Octane.createRoot(document.getElementById('app'));
const items = [
	{ value: 'apple', label: 'Apple' },
	{ value: 'pear', label: 'Pear' },
];
async function main() {
	await Octane.act(() =>
		root.render(
			h(
				Select.Root,
				{ name: 'fruit', defaultValue: 'apple', items },
				h(Select.Trigger, { 'aria-label': 'Fruit' }, h(Select.Value)),
				h(
					Select.Portal,
					null,
					h(
						Select.Positioner,
						{ alignItemWithTrigger: false },
						h(
							Select.Popup,
							null,
							h(
								Select.List,
								null,
								items.map((item) =>
									h(
										Select.Item,
										{ key: item.value, value: item.value },
										h(Select.ItemText, null, item.label),
									),
								),
							),
						),
					),
				),
			),
		),
	);
	const trigger = document.querySelector('[role="combobox"]');
	assert.equal(trigger.textContent, 'Apple');
	await Octane.act(() => trigger.click());
	assert.ok(document.querySelector('[role="listbox"]'));
	const pear = [...document.querySelectorAll('[role="option"]')].find(
		(item) => item.textContent === 'Pear',
	);
	await Octane.act(() => pear.click());
	assert.equal(trigger.textContent, 'Pear');
	assert.equal(new dom.window.FormData(document.getElementById('app')).get('fruit'), 'pear');
	await Octane.act(() =>
		root.render(
			h(
				Combobox.Root,
				{ items: ['Apple', 'Pear'], defaultValue: 'Apple', name: 'search' },
				h(Combobox.Input, { 'aria-label': 'Search fruit' }),
				h(
					Combobox.Portal,
					null,
					h(
						Combobox.Positioner,
						null,
						h(
							Combobox.Popup,
							null,
							h(Combobox.List, null, (value) => h(Combobox.Item, { key: value, value }, value)),
						),
					),
				),
			),
		),
	);
	const input = document.querySelector('input[role="combobox"]');
	assert.equal(input.value, 'Apple');
	assert.equal(new dom.window.FormData(document.getElementById('app')).get('search'), 'Apple');
	await Octane.act(() => {
		input.focus();
		input.value = 'Pe';
		input.dispatchEvent(
			new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Pe' }),
		);
	});
	const match = [...document.querySelectorAll('[role="option"]')].find(
		(item) => item.textContent === 'Pear',
	);
	assert.ok(match, 'typing filters Combobox options');
	await Octane.act(() => match.click());
	assert.equal(input.value, 'Pear');
	assert.equal(new dom.window.FormData(document.getElementById('app')).get('search'), 'Pear');
	await Octane.act(() => root.unmount());
	assert.equal(document.getElementById('app').childNodes.length, 0);
	const react = Object.keys(require.cache).filter((p) =>
		/\/node_modules\/(react|react-dom)\//.test(p),
	);
	assert.deepEqual(react, []);
	dom.window.close();
	// The page-wide post-paint MessageChannel remains reusable for the lifetime
	// of a browser page. End this disposable Node DOM host after its assertions.
	process.stdout.write(
		'Consumer-compiled Select selection and form submission, Combobox filtering and selection, Store Inspector export, shared Octane instance, and cleanup passed; React modules loaded: 0.\n',
		() => process.exit(0),
	);
}
main().catch((error) => {
	dom.window.close();
	process.stderr.write(String(error.stack ?? error) + '\n', () => process.exit(1));
});
