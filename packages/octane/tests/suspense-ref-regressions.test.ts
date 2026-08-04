import { expect, it } from 'vitest';
import { act, mount } from './_helpers';
import {
	SuspendedHostRefUpdate,
	SuspendedInitialHostRef,
	SupersededRefOrder,
} from './_fixtures/suspense-ref-regressions.tsrx';

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
