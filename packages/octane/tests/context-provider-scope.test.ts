import { expect, it } from 'vitest';
import { mount } from './_helpers';
import { App } from './_fixtures/context-provider-scope.tsrx';

it('keeps nearest provider values and local state across sibling changes and keyed moves', () => {
	const rows = [
		{ name: 'retained', value: 1, shadow: 10 },
		{ name: 'sibling', value: 2, shadow: 20 },
	];
	const app = mount(App, { rows, tick: 0 });
	const retained = app.find('[data-reader="retained"]');
	app.click('[data-reader="retained"]');
	expect(retained.textContent).toBe('1:1');
	const changed = [rows[0], { ...rows[1], value: 3 }];
	app.update(App, { rows: changed, tick: 1 });
	app.update(App, { rows: changed, tick: 2 });
	expect(app.find('[data-reader="retained"]')).toBe(retained);
	expect(retained.textContent).toBe('1:1');
	expect(app.find('[data-reader="sibling"]').textContent).toBe('3:0');
	expect(app.find('[data-reader="retained-shadow"]').textContent).toBe('10:0');
	expect(app.find('[data-reader="default"]').textContent).toBe('13:0');
	app.update(App, { rows: [changed[1], { ...rows[0], value: 4, shadow: 11 }], tick: 3 });
	expect(app.find('[data-reader="retained"]')).toBe(retained);
	expect(retained.textContent).toBe('4:1');
	expect(app.find('[data-reader="retained-shadow"]').textContent).toBe('11:0');
	app.click('[data-reader="retained"]');
	expect(retained.textContent).toBe('4:2');
	app.unmount();
});

it('uses Object.is for a consumer value even after another provider changes', () => {
	const rows = [
		{ name: 'retained', value: 0, shadow: Number.NaN },
		{ name: 'sibling', value: 2, shadow: 20 },
	];
	const app = mount(App, { rows, tick: 0 });
	app.update(App, { rows: [rows[0], { ...rows[1], value: 3 }], tick: 1 });
	app.update(App, { rows: [{ ...rows[0], value: -0 }, rows[1]], tick: 2 });
	expect(app.find('[data-reader="retained"]').textContent).toBe('-0:0');
	expect(app.find('[data-reader="retained-shadow"]').textContent).toBe('NaN:0');
	app.unmount();
});
