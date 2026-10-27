import { expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { App, readTheme } from './_fixtures/context-first-read.tsrx';

// This file's module graph is fresh, so the first context read below is the
// first one the runtime ever records.
it('delivers provider updates through a memo boundary that bailed before any context read', () => {
	const r = mount(App, { theme: 'light' });
	try {
		r.update(App, { theme: 'dim' });
		expect(r.find('output').textContent).toBe('unread');
		act(() => readTheme());
		expect(r.find('output').textContent).toBe('dim');
		r.update(App, { theme: 'dark' });
		expect(r.find('output').textContent).toBe('dark');
	} finally {
		r.unmount();
	}
});
