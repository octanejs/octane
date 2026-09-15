import { flushSync, hydrateRoot } from 'octane';
import { beforeAll, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@octanejs/testing-library';
import type { UseFormReturn } from '@octanejs/hook-form';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import {
	ReleaseForm,
	type ReleaseProps,
	type ReleaseValues,
} from './_fixtures/release-contracts.tsrx';

let html: string;
const onReady = vi.fn<(methods: UseFormReturn<ReleaseValues>) => void>();
const onValue = vi.fn<(name: string) => void>();
const props: ReleaseProps = { onReady, onValue };

beforeAll(async () => {
	html = (
		await renderHydrationFixture(
			'hook-form',
			'packages/hook-form/tests/_fixtures/release-contracts.tsrx',
			'ReleaseForm',
			props,
		)
	).html;
}, 30_000);

// @parity-case native:hook-form-hydration-adoption-cleanup
it('adopts the server form and owns live validation, field-array identity, and subscription cleanup', async () => {
	expect(onReady).not.toHaveBeenCalled();
	expect(onValue).not.toHaveBeenCalled();
	const host = document.createElement('div');
	host.innerHTML = html;
	document.body.append(host);
	const input = host.querySelector<HTMLInputElement>('#release-name')!;
	const rows = [...host.querySelectorAll('li')];
	// Uncontrolled register defaults attach through refs on the client, as upstream does.
	expect(input.value).toBe('');
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		await act(async () => {
			root = hydrateRoot(host, ReleaseForm, props);
		});
		expect(host.querySelector('#release-name')).toBe(input);
		expect([...host.querySelectorAll('li')]).toEqual(rows);
		expect(onReady).toHaveBeenCalledOnce();
		expect(input.value).toBe('Ada');
		expect(rows.map((row) => row.querySelector('input')!.value)).toEqual(['first', 'second']);
		const methods = onReady.mock.calls[0][0];
		fireEvent.input(input, { target: { value: '' } });
		await waitFor(() =>
			expect(host.querySelector('[role="alert"]')?.textContent).toBe('Name is required'),
		);
		expect(methods.getErrors('name')?.message).toBe('Name is required');
		fireEvent.input(input, { target: { value: 'Grace' } });
		await waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe(''));
		expect(methods.getErrors('name')).toBeUndefined();
		flushSync(() => methods.setValue('items.0.value', 'edited'));
		fireEvent.click(host.querySelector('#release-swap')!);
		await waitFor(() => expect([...host.querySelectorAll('li')]).toEqual([rows[1], rows[0]]));
		expect(rows[0].querySelector('input')!.value).toBe('edited');
		root!.unmount();
		root = undefined;
		const delivered = onValue.mock.calls.length;
		methods.setValue('name', 'after unmount');
		await Promise.resolve();
		expect(onValue).toHaveBeenCalledTimes(delivered);
		expect(errors).not.toHaveBeenCalled();
	} finally {
		root?.unmount();
		errors.mockRestore();
		host.remove();
	}
});
