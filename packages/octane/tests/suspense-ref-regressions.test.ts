import { expect, it } from 'vitest';
import { mount } from './_helpers';
import { SupersededRefOrder } from './_fixtures/suspense-ref-regressions.tsrx';

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
	const r = mount(SupersededRefOrder as any, {
		promise: fulfilled('first'),
		cbRef,
		sentinel: 'first',
	});
	observe = true;

	r.update(SupersededRefOrder as any, {
		promise: pending.promise,
		cbRef,
		sentinel: 'pending',
	});
	expect(r.find('.superseded-fallback').textContent).toBe('loading');

	r.update(SupersededRefOrder as any, {
		promise: fulfilled('current'),
		cbRef,
		sentinel: 'current',
	});
	expect(r.find('.superseded-value').textContent).toBe('current');
	expect(observedSiblingValues).toEqual(['current']);
	r.unmount();
});
