import { expect, it } from 'vitest';
import { act, createRoot } from 'octane';
import { DbClient } from '@tanstack/db';
import { PortalDatabase } from './_fixtures/portal.tsrx';

// @parity-case conformance:db-portal
it('preserves logical provider ownership through portal suspension, replacement and errors', async () => {
	const container = document.createElement('main');
	const target = document.createElement('aside');
	document.body.append(container, target);
	let resolve!: (value: string) => void;
	const ready = new Promise<string>((complete) => {
		resolve = complete;
	});
	let props = { client: new DbClient(), target, fail: false, ready };
	const root = createRoot(container);
	let output: Element | null = null;
	try {
		await act(async () => root.render(PortalDatabase, props));
		expect(container.textContent).toBe('Loading');
		expect(target.textContent).toBe('');
		await act(async () => resolve('ready'));
		expect(container.textContent).toBe('');
		output = target.querySelector('#portal-client');
		expect(output?.textContent).toBe('ready');
		props = { ...props, client: new DbClient() };
		await act(async () => root.render(PortalDatabase, props));
		expect(target.querySelector('#portal-client')).toBe(output);
		expect(target.textContent).toBe('ready');
		await act(async () => root.render(PortalDatabase, { ...props, fail: true }));
		expect(container.querySelector('#portal-error')?.textContent).toBe('portal failure');
		expect(target.textContent).toBe('');
	} finally {
		root.unmount();
		container.remove();
		target.remove();
	}
	expect(target.querySelector('#portal-client')).toBeNull();
	expect(output?.isConnected).toBe(false);
});
