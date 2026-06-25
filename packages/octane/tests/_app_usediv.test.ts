import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { App } from './_fixtures/_app_usediv.tsrx';

describe('props-first: App(props) + JSX-from-another-function + early return', () => {
	it('renders the useDiv() result when enabled (props bind correctly)', () => {
		const r = mount(App as any, { disabled: false, text: 'hello' });
		const div = r.container.querySelector('div.made');
		expect(div?.textContent).toBe('hello');
		r.unmount();
	});
	it('renders the bare string on the early return', () => {
		const r = mount(App as any, { disabled: true, text: 'fallback' });
		expect(r.container.textContent).toContain('fallback');
		expect(r.container.querySelector('div.made')).toBeNull();
		r.unmount();
	});
});
