import { afterEach, describe, expect, it } from 'vitest';
import { createRoot } from '../src/index.js';
import { createHostElement } from '../src/runtime.js';

// Descriptor hosts reach submit interception only through an element factory
// that installed it (public createElement/createElementAt/cloneElement, or
// compiled JSX whose props name an action or spread). A function action that
// reaches a renderer without it is a compiler classification gap; development
// builds name it instead of writing the function as an attribute. This file must
// not call a public element factory, because any of them installs the path.
const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
});

describe('descriptor form-action capability', () => {
	it('throws a catalogued error when an uninstalled descriptor host receives a function action', () => {
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		const root = createRoot(container);
		expect(() => root.render(() => createHostElement('form', { action: () => {} }))).toThrow(
			'no element factory installed form actions',
		);
		expect(container.querySelector('form[action]')).toBeNull();
	});

	it('still writes a string action without the capability', () => {
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		const root = createRoot(container);
		root.render(() => createHostElement('form', { action: '/submit' }));
		expect(container.querySelector('form')?.getAttribute('action')).toBe('/submit');
		root.unmount();
	});
});
