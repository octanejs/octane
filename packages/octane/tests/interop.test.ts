import { it, expect } from 'vitest';
import { mount } from './_helpers';
import { App } from './_fixtures/interop-app.tsx';

it('.tsx parent passes children to a .tsrx {props.children} component', () => {
	const r = mount(App as any);
	expect(r.findAll('.provider').length).toBe(1); // passes (Provider renders)
	expect(r.findAll('.inner').length).toBe(1); // FAILS today — the .tsx children don't render
	expect(r.find('.inner').textContent).toBe('hi');
	r.unmount();
});
