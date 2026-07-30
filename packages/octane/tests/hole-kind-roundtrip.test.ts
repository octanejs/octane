import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	HoleKindRoundTrip,
	ArrayNullRoundTrip,
	ArrayComponentRoundTrip,
	ArrayHostRoundTrip,
} from './_fixtures/hole-kind-flip.tsrx';

// A sole-child value hole may change kind on any render. Leaving the keyed
// array regime and re-entering it later must keep working — repeatedly — and
// the intermediate kind must render correctly too.
describe('value hole kind round-trip', () => {
	it('survives array -> text -> array on a sole-child hole', () => {
		const r = mount(HoleKindRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('plain');
		expect(r.findAll('#host i')).toEqual([]);
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		// A second full cycle proves the re-entered array mode is itself sound.
		r.click('#next');
		expect(r.find('#host').textContent).toBe('plain');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('survives array -> null -> array on a sole-child hole', () => {
		const r = mount(ArrayNullRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('survives array -> component -> array on a sole-child hole', () => {
		const r = mount(ArrayComponentRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('chip');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('chip');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('survives array -> pure host -> array on a sole-child hole', () => {
		const r = mount(ArrayHostRoundTrip);
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host').textContent).toBe('solo');
		expect(r.find('#host em').textContent).toBe('solo');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.click('#next');
		expect(r.find('#host em').textContent).toBe('solo');
		r.click('#next');
		expect(r.findAll('#host i').map((el) => el.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});
});
