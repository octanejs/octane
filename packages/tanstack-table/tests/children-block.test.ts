import { afterEach, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { TableChildren } from './_fixtures/hydration.tsrx';
afterEach(() => document.body.replaceChildren());
it('Table Subscribe renders template children and calls render props with selected state', () => {
	const result = mount(TableChildren, { revision: 0 });
	try {
		const node = result.find('#template');
		expect(node.textContent).toBe('0');
		expect(result.find('#callback').textContent).toBe('0');
		result.update(TableChildren, { revision: 1 });
		expect(result.find('#template')).toBe(node);
		expect(node.textContent).toBe('1');
		expect(result.find('#callback').textContent).toBe('1');
	} finally {
		result.unmount();
	}
});
