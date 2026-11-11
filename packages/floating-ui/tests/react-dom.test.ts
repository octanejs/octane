import { expect, it, vi } from 'vitest';
import * as dom from '@floating-ui/dom';
import * as position from '@octanejs/floating-ui/react-dom';
import { mount } from '../../octane/tests/_helpers';
import { PositionOnly } from './_fixtures/position-only';

it('exposes the original DOM functions and tracks captured middleware dependencies', () => {
	for (const key of [
		'autoUpdate',
		'computePosition',
		'detectOverflow',
		'getOverflowAncestors',
		'platform',
	] as const) {
		expect(position[key]).toBe(dom[key]);
	}
	const options = { padding: 3 };
	const deps = [true];
	for (const value of [
		position.flip(options, deps),
		position.shift(options, deps),
		position.limitShift({}, deps),
		position.arrow({ element: null }, deps),
	]) {
		expect(value.options[1]).toBe(deps);
	}
	expect(position.flip(options, deps).options[0]).toBe(options);
});

it('retains each update’s middleware and releases a still-connected floating node', async () => {
	let result!: position.UseFloatingReturn;
	const observe = (next: position.UseFloatingReturn) => {
		result = next;
	};
	const release = vi.fn();
	const subscribe: NonNullable<position.UseFloatingOptions['whileElementsMounted']> = (
		_anchor,
		_floating,
		update,
	) => {
		update();
		return release;
	};
	const props = { gap: 4, observe, subscribe };
	const r = mount(PositionOnly, props);
	try {
		expect(r.container.firstElementChild?.getAttribute('data-default-placement')).toBe('bottom');
		await vi.waitFor(() => expect(result.isPositioned).toBe(true));
		const baseline = result.y;
		const earlierUpdate = result.update;
		r.root.render(PositionOnly, { ...props, gap: 16 });
		await vi.waitFor(() => expect(result.y).toBe(baseline + 12));
		earlierUpdate();
		await vi.waitFor(() => expect(result.y).toBe(baseline));
		const connected = result.refs.floating.current!;
		const previousReleases = release.mock.calls.length;
		result.refs.setFloating(null);
		expect(connected.isConnected).toBe(true);
		expect(result.refs.floating.current).toBeNull();
		await vi.waitFor(() => expect(release.mock.calls.length).toBeGreaterThan(previousReleases));
	} finally {
		r.unmount();
	}
});
