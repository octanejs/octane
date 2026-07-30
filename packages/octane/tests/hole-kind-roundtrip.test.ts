import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { HoleKindRoundTrip } from './_fixtures/hole-kind-flip.tsrx';

describe('value hole kind round-trip', () => {
	it('survives array -> text -> array on a sole-child hole', () => {
		const r = mount(HoleKindRoundTrip);
		expect(r.find('#host').textContent).toBe('ab');
		r.click('#next');
		expect(r.find('#host').textContent).toBe('plain');
		r.click('#next');
		expect(r.find('#host').textContent).toBe('ab');
		r.unmount();
	});
});
