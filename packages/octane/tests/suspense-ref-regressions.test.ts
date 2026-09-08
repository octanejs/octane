import { expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { createRoot, hydrateRoot, type FragmentInstance } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	RootHostRef,
	RootFragmentRef,
	SuspendedHostRefUpdate,
	SuspendedInitialHostRef,
	SupersededRefOrder,
} from './_fixtures/suspense-ref-regressions.tsrx';

const server = loadServerFixture('packages/octane/tests/_fixtures/suspense-ref-regressions.tsrx');

for (const [name, Component] of Object.entries({ RootHostRef, RootFragmentRef })) {
	for (const hydrate of [false, true]) {
		it(`${name} publishes only the latest ref after a suspended root commits (hydrate=${hydrate})`, async () => {
			const calls: Array<[string, Element | FragmentInstance | null]> = [];
			const first = (target: Element | FragmentInstance | null) => {
				calls.push(['first', target]);
			};
			const stale = (target: Element | FragmentInstance | null) => {
				calls.push(['stale', target]);
			};
			const latest = (target: Element | FragmentInstance | null) => {
				calls.push(['latest', target]);
			};
			const initial = { innerRef: first, read: () => 'initial' };
			const container = document.createElement('div');
			document.body.appendChild(container);
			if (hydrate) container.innerHTML = renderToString(server[name], initial).html;
			const serverChild = container.querySelector('.root-resource');
			const root = hydrate ? hydrateRoot(container, Component, initial) : createRoot(container);
			try {
				await act(() => {
					if (!hydrate) root.render(Component, initial);
				});
				const child = container.querySelector('.root-resource');
				if (hydrate) expect(child).toBe(serverChild);
				const target = calls[0]?.[1];
				expect(target).toBeTruthy();
				expect(calls).toEqual([['first', target]]);
				const superseded = deferred<void>();
				const pending = deferred<void>();
				let ready = false;
				await act(() =>
					root.render(Component, {
						innerRef: stale,
						read: () => {
							throw superseded.promise;
						},
					}),
				);
				await act(() =>
					root.render(Component, {
						innerRef: latest,
						read: () => {
							if (!ready) throw pending.promise;
							return 'resolved';
						},
					}),
				);
				expect(container.querySelector('.root-resource')).toBe(child);
				expect(child?.textContent).toBe('initial');
				expect(calls).toEqual([['first', target]]);
				await act(() => superseded.resolve());
				expect(calls).toEqual([['first', target]]);
				await act(() => {
					ready = true;
					pending.resolve();
				});
				expect(container.querySelector('.root-resource')).toBe(child);
				expect(child?.textContent).toBe('resolved');
				expect(calls).toEqual([
					['first', target],
					['first', null],
					['latest', target],
				]);
				expect(calls[2][1]).toBe(target);
				const removed = deferred<void>();
				await act(() =>
					root.render(Component, {
						innerRef: stale,
						read: () => {
							throw removed.promise;
						},
					}),
				);
				expect(calls).toEqual([
					['first', target],
					['first', null],
					['latest', target],
				]);
				root.unmount();
				await act(() => removed.resolve());
				expect(calls).toEqual([
					['first', target],
					['first', null],
					['latest', target],
					['latest', null],
				]);
			} finally {
				root.unmount();
				container.remove();
			}
		});
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

function fulfilled(value: string) {
	const promise = Promise.resolve(value) as Promise<string> & {
		status?: string;
		value?: string;
	};
	promise.status = 'fulfilled';
	promise.value = value;
	return promise;
}

it('does not publish a host ref from a suspended initial mount', async () => {
	const pending = deferred<string>();
	const calls: Array<Element | null> = [];
	const r = mount(SuspendedInitialHostRef, {
		innerRef: (element: Element | null) => {
			calls.push(element);
		},
		promise: pending.promise,
	});

	expect(r.find('.initial-fallback').textContent).toBe('loading');
	expect(calls).toEqual([]);

	await act(() => pending.resolve('ready'));
	const resolvedRef = r.find('.initial-ref-item');
	expect(r.find('.initial-resolved').textContent).toBe('ready');
	expect(calls).toEqual([resolvedRef]);
	r.unmount();
});

it('keeps every member of an array ref unpublished until a suspended mount reveals', async () => {
	const pending = deferred<string>();
	const calls: string[] = [];
	const first = (element: Element | null) => {
		calls.push(`first:${element ? 'attach' : 'detach'}`);
	};
	const second = (element: Element | null) => {
		calls.push(`second:${element ? 'attach' : 'detach'}`);
	};
	const r = mount(SuspendedInitialHostRef as any, {
		innerRef: [first, second],
		promise: pending.promise,
	});

	expect(r.find('.initial-fallback').textContent).toBe('loading');
	expect(calls).toEqual([]);

	await act(() => pending.resolve('ready'));
	expect(calls).toEqual(['first:attach', 'second:attach']);

	r.unmount();
	expect(calls).toEqual(['first:attach', 'second:attach', 'first:detach', 'second:detach']);
});

it('does not detach a replacement ref from a suspended update before it attaches', async () => {
	const pending = deferred<string>();
	const calls: string[] = [];
	const firstRef = (element: Element | null) => {
		calls.push(`first:${element ? 'attach' : 'detach'}`);
	};
	const secondRef = (element: Element | null) => {
		calls.push(`second:${element ? 'attach' : 'detach'}`);
	};
	const r = mount(SuspendedHostRefUpdate, {
		innerRef: firstRef,
		promise: fulfilled('first'),
	});
	expect(calls).toEqual(['first:attach']);

	r.update(SuspendedHostRefUpdate, {
		innerRef: secondRef,
		promise: pending.promise,
	});
	expect(r.find('.updated-ref-fallback').textContent).toBe('loading');
	expect(calls).toEqual(['first:attach', 'first:detach']);

	await act(() => pending.resolve('ready'));
	expect(calls).toEqual(['first:attach', 'first:detach', 'second:attach']);
	r.unmount();
});

it('re-attaches a superseded primary ref after later siblings commit', () => {
	const pending = deferred<string>();
	const observedSiblingValues: string[] = [];
	let observe = false;
	const cbRef = (element: Element | null) => {
		if (element !== null && observe) {
			const sibling = element.ownerDocument.querySelector('.render-probe');
			observedSiblingValues.push(sibling?.getAttribute('data-value') ?? '');
		}
	};
	const r = mount(SupersededRefOrder, {
		promise: fulfilled('first'),
		cbRef,
		sentinel: 'first',
	});
	observe = true;

	r.update(SupersededRefOrder, {
		promise: pending.promise,
		cbRef,
		sentinel: 'pending',
	});
	expect(r.find('.superseded-fallback').textContent).toBe('loading');

	r.update(SupersededRefOrder, {
		promise: fulfilled('current'),
		cbRef,
		sentinel: 'current',
	});
	expect(r.find('.superseded-value').textContent).toBe('current');
	expect(observedSiblingValues).toEqual(['current']);
	r.unmount();
});
