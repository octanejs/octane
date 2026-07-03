import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { Maybe, Multi, Toggleable, NoBraces } from './_fixtures/early-return.tsrx';
import { App as HelperApp } from './_fixtures/return-from-helper.tsrx';

describe('early returns', () => {
	it('renders nothing when the early-return guard is true', () => {
		const r = mount(Maybe, { hide: true });
		expect(r.findAll('.shown')).toHaveLength(0);
		r.update(Maybe, { hide: false });
		expect(r.find('.shown').textContent).toBe('shown');
		r.update(Maybe, { hide: true });
		expect(r.findAll('.shown')).toHaveLength(0);
		r.unmount();
	});

	it('chains multiple early-returns', () => {
		const r = mount(Multi, { stopA: false, stopB: false });
		expect(r.findAll('p').map((p) => p.textContent)).toEqual(['hello', 'world', 'done']);

		r.update(Multi, { stopA: false, stopB: true });
		expect(r.findAll('p').map((p) => p.textContent)).toEqual(['hello', 'world']);

		r.update(Multi, { stopA: true, stopB: false });
		expect(r.findAll('p').map((p) => p.textContent)).toEqual(['hello']);

		r.update(Multi, { stopA: false, stopB: false });
		expect(r.findAll('p').map((p) => p.textContent)).toEqual(['hello', 'world', 'done']);
		r.unmount();
	});

	it('interacts with useState — toggle hides/shows content', () => {
		const r = mount(Toggleable);
		expect(r.find('.content').textContent).toBe('content');
		r.click('button');
		expect(r.findAll('.content')).toHaveLength(0);
		r.click('button');
		expect(r.find('.content').textContent).toBe('content');
		r.unmount();
	});

	it('handles no-braces early-return form', () => {
		const r = mount(NoBraces, { hide: true });
		expect(r.findAll('.visible')).toHaveLength(0);
		r.update(NoBraces, { hide: false });
		expect(r.find('.visible').textContent).toBe('visible');
		r.unmount();
	});
});

// Early return interacting with the return-based body: `App(props)` early-returns a
// BARE STRING (coerced to text by the renderable return path), and its normal path
// returns JSX built by ANOTHER function (`useDiv(text)`) — proving props bind
// correctly through a helper-built JSX return and the two return shapes swap cleanly.
describe('early return of a bare string vs JSX from a helper function', () => {
	it('renders the helper-built JSX when enabled (props bind correctly)', () => {
		const r = mount(HelperApp as any, { disabled: false, text: 'hello' });
		const div = r.container.querySelector('div.made');
		expect(div?.textContent).toBe('hello');
		r.unmount();
	});

	it('renders the bare string on the early return', () => {
		const r = mount(HelperApp as any, { disabled: true, text: 'fallback' });
		expect(r.container.textContent).toContain('fallback');
		expect(r.container.querySelector('div.made')).toBeNull();
		r.unmount();
	});
});
