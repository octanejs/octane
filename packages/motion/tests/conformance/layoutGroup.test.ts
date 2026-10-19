import { describe, expect, it } from 'vitest';
import { mount } from '../_helpers';
import { NestedGroupId } from '../_fixtures/layout-group.tsrx';

describe('LayoutGroup', () => {
	it('preserves the public flattened LayoutGroup id', () => {
		const result = mount(NestedGroupId);
		expect(result.find('#layout-group-id').textContent).toBe('a-b-c');
		result.unmount();
	});
});
