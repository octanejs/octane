import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import {
	CaptureRef,
	FunctionRef,
	FunctionResultRef,
	LazyRef,
	UndefinedRef,
} from './_fixtures/lazy-ref.tsrx';

describe('useLazyRef initialization', () => {
	it('keeps the first value on updates and initializes again on remount', () => {
		const factory = vi.fn(() => ({ name: 'first' }));
		const view = mount(LazyRef, { factory });
		expect(view.find('button').textContent).toBe('first:0');
		view.click('button');
		view.click('button');
		expect(view.find('button').textContent).toBe('first:2');
		expect(factory).toHaveBeenCalledTimes(1);
		view.unmount();

		const remounted = mount(LazyRef, { factory });
		expect(remounted.find('button').textContent).toBe('first:0');
		expect(factory).toHaveBeenCalledTimes(2);
		remounted.unmount();
	});

	it('still stores a function as a value in useRef', () => {
		const callback = vi.fn();
		const report = vi.fn();
		const view = mount(FunctionRef, { callback, report });
		view.click('button');
		expect(report).toHaveBeenCalledWith(callback);
		expect(callback).not.toHaveBeenCalled();
		view.unmount();
	});

	it('can initialize a ref whose value is itself a function', () => {
		const callback = vi.fn();
		const report = vi.fn();
		const view = mount(FunctionResultRef, { callback, report });
		view.click('button');
		expect(report).toHaveBeenCalledWith(callback);
		expect(callback).not.toHaveBeenCalled();
		view.unmount();
	});

	it('retains an initialized undefined value across updates', () => {
		const factory = vi.fn(() => undefined);
		const report = vi.fn();
		const view = mount(UndefinedRef, { factory, report });
		view.click('button');
		view.click('button');
		expect(report).toHaveBeenCalledWith(undefined);
		expect(factory).toHaveBeenCalledTimes(1);
		view.unmount();
	});

	it('preserves the ref and its mutations when the factory changes', () => {
		const factory = vi.fn(() => ({ name: 'first' }));
		const replacement = vi.fn(() => ({ name: 'replacement' }));
		const report = vi.fn();
		const view = mount(CaptureRef, { factory, report, label: 'first' });
		view.click('button');
		const ref = report.mock.calls[0][0];
		ref.current = { name: 'changed' };
		view.update(CaptureRef, { factory: replacement, report, label: 'second' });
		view.click('button');
		expect(report.mock.calls[1][0]).toBe(ref);
		expect(ref.current).toEqual({ name: 'changed' });
		expect(replacement).not.toHaveBeenCalled();
		view.unmount();
	});

	it('initializes during server rendering', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/lazy-ref.tsrx');
		const factory = vi.fn(() => ({ name: 'server' }));
		expect(renderToString(server.LazyRef, { factory }).html).toContain('server:0');
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('initializes independently for server rendering and hydration', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/lazy-ref.tsrx');
		const factory = vi.fn(() => ({ name: 'same' }));
		const props = { factory };
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server.LazyRef, props).html;
		const serverButton = container.querySelector('button');
		const root = hydrateRoot(container, LazyRef, props);
		try {
			flushSync(() => {});
			expect(container.querySelector('button')).toBe(serverButton);
			expect(container.textContent).toBe('same:0');
			expect(factory).toHaveBeenCalledTimes(2);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
