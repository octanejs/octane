/**
 * Regression — PR #46 Bugbot: "Block Route functions retrigger loop".
 * Inline function-valued route DATA props (loader/action/shouldRevalidate/
 * middleware entries/lazy) get a fresh identity every parent render; the
 * collector must treat identity-only changes as IMMATERIAL (no version bump —
 * previously each commit re-rendered <Routes>, which re-registered with yet
 * another fresh function and spun), while buildRoute's live forwarders keep
 * the router invoking the NEWEST closure.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { createCollector } from '../../src/lib/components/routes-collector.ts';
import { InlineLoaderApp } from '../_fixtures/inline-route-props.tsrx';

describe('collector: inline function route props', () => {
	it('re-registering with a fresh loader identity is not a material change', () => {
		const onChange = vi.fn();
		const c = createCollector(onChange);
		c.register('r1', { path: '/', loader: () => 'v1' }, null);
		expect(onChange).toHaveBeenCalledTimes(1); // initial registration

		// Fresh function identity, same shape — must NOT bump.
		c.register('r1', { path: '/', loader: () => 'v2' }, null);
		expect(onChange).toHaveBeenCalledTimes(1);

		// The collected route still calls the LATEST closure (live forwarder).
		const [route] = c.collect();
		expect((route.loader as any)()).toBe('v2');
	});

	it('presence changes ARE material; middleware length too', () => {
		const onChange = vi.fn();
		const c = createCollector(onChange);
		c.register('r1', { path: '/' }, null);
		expect(onChange).toHaveBeenCalledTimes(1);

		c.register('r1', { path: '/', loader: () => 1 }, null); // added → material
		expect(onChange).toHaveBeenCalledTimes(2);
		c.register('r1', { path: '/', loader: () => 2, middleware: [() => {}] }, null);
		expect(onChange).toHaveBeenCalledTimes(3); // middleware appeared
		c.register('r1', { path: '/', loader: () => 3, middleware: [() => {}] }, null);
		expect(onChange).toHaveBeenCalledTimes(3); // same length, fresh fns → immaterial
		c.register('r1', { path: '/', loader: () => 4, middleware: [() => {}, () => {}] }, null);
		expect(onChange).toHaveBeenCalledTimes(4); // length changed → material

		// Middleware forwarders are latest-wins by index.
		const log: string[] = [];
		c.register(
			'r1',
			{ path: '/', loader: () => 5, middleware: [() => log.push('m0'), () => log.push('m1')] },
			null,
		);
		const [route] = c.collect();
		(route.middleware as any[])[1]();
		expect(log).toEqual(['m1']);
	});

	it('a parent re-render with inline route props settles in one pass (no retrigger loop)', () => {
		const log: string[] = [];
		const r = mount(InlineLoaderApp as any, { log: (s: string) => log.push(s) });
		flushEffects();
		expect(r.find('#home').textContent).toBe('home');
		const initialRenders = log.length;

		r.click('#bump');
		flushEffects();
		// Exactly ONE more parent render — the fresh inline loader identity did
		// not bump the collector into a <Routes>-re-render feedback loop.
		expect(log.slice(initialRenders)).toEqual(['render:1']);
		expect(r.find('#home').textContent).toBe('home');

		r.click('#bump');
		flushEffects();
		expect(log.at(-1)).toBe('render:2');
		expect(log.filter((l) => l === 'render:2')).toHaveLength(1);
		r.unmount();
	});
});
