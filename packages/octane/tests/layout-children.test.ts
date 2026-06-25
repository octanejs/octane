import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { ChildPage, ParentLayout } from './_fixtures/layout-children.tsrx';

// Locks in the runtime contract the vite-plugin's generated client entry relies
// on (project-codegen.js `create_client_entry_source`): a layout's `{children}`
// is a ComponentBody closure that re-invokes the page with its real `{ params }`
// props, and octane's childSlot invokes a function child PROPS-FIRST as
// `({}, block, extra)`. The closure must therefore call the page as
// `Page({ params }, scope, extra)`. A scope-first call (`Page(scope, { params })`,
// the pre-props-first form) would pass the block as props and mis-render.
describe('layout {children} closure renders the page props-first', () => {
	it('passes the page its real props through the closure', () => {
		const params = { id: 'X' };
		const children = (_props: any, scope: any, extra: any) =>
			(ChildPage as any)({ params }, scope, extra);

		const r = mount(ParentLayout as any, { children });
		expect(r.find('span').textContent).toBe('X');
		r.unmount();
	});
});
