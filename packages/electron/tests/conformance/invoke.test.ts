import { afterEach, describe, expect, it } from 'vitest';
import {
	BareGreetingApp,
	CommandState,
	DynamicCommandApp,
	GreetingApp,
} from '../_fixtures/commands.tsrx';
import { act, flush, installMockBridge, mount, resetBridge } from '../_helpers';

afterEach(async () => {
	await flush();
	resetBridge();
});

describe('useInvoke', () => {
	it('suspends until the command resolves, then renders the payload', async () => {
		installMockBridge((_channel, args) => `hello ${(args[0] as { name: string }).name}`);
		const result = mount(GreetingApp, { name: 'ada' });

		expect(result.find('#fallback').textContent).toBe('loading');
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');
		result.unmount();
	});

	it('invokes once across the suspend and replay of one episode', async () => {
		const { calls } = installMockBridge(() => 'hello');
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);

		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello');
		expect(calls.filter((call) => call.channel === 'greet')).toHaveLength(1);
		result.unmount();
	});

	it('does not re-invoke when a re-render rebuilds an equal args literal', async () => {
		const { calls } = installMockBridge(
			(_channel, args) => `hello ${(args[0] as { name: string }).name}`,
		);
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');

		result.update(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');
		expect(calls.filter((call) => call.channel === 'greet')).toHaveLength(1);
		result.unmount();
	});

	it('runs a channel called with neither args nor options', async () => {
		const { calls } = installMockBridge((channel) => `ran ${channel}`);
		const result = mount(BareGreetingApp);
		await act(flush);

		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('ran greet');
		expect(calls.filter((call) => call.channel === 'greet')[0].args).toEqual([]);
		result.unmount();
	});

	it('refetches on a changed channel name even under explicit deps', async () => {
		installMockBridge((channel) => `ran ${channel}`);
		const result = mount(DynamicCommandApp, { cmd: 'first', version: 1 });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#dynamic').textContent).toBe('ran first');

		result.update(DynamicCommandApp, { cmd: 'second', version: 1 });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#dynamic').textContent).toBe('ran second');
		result.unmount();
	});

	it('re-invokes when an argument value changes', async () => {
		const { calls } = installMockBridge(
			(_channel, args) => `hello ${(args[0] as { name: string }).name}`,
		);
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');

		result.update(GreetingApp, { name: 'grace' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(calls.filter((call) => call.channel === 'greet')).toHaveLength(2);
		expect(result.find('#greeting').textContent).toBe('hello grace');
		result.unmount();
	});

	it('routes a rejected command to the error boundary', async () => {
		installMockBridge(() => Promise.reject(new Error('command failed')));
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#caught').textContent).toBe('Error');
		result.unmount();
	});

	it('rejects with ElectronUnavailableError when the bridge is missing', async () => {
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#caught').textContent).toBe('ElectronUnavailableError');
		result.unmount();
	});
});

describe('useInvokeState', () => {
	it('reports pending then success with refetch clearing data', async () => {
		let n = 0;
		installMockBridge(() => `v${++n}`);
		const result = mount(CommandState, { name: 'ada' });
		expect(result.find('#status').textContent).toBe('pending');
		await flush();
		expect(result.find('#status').textContent).toBe('success');
		expect(result.find('#data').textContent).toBe('v1');

		result.click('#refetch');
		expect(result.find('#status').textContent).toBe('pending');
		expect(result.find('#data').textContent).toBe('');
		await flush();
		expect(result.find('#data').textContent).toBe('v2');
		result.unmount();
	});

	it('reports ElectronUnavailableError without a bridge', async () => {
		const result = mount(CommandState, { name: 'ada' });
		await flush();
		expect(result.find('#status').textContent).toBe('error');
		expect(result.find('#error').textContent).toBe('ElectronUnavailableError');
		result.unmount();
	});
});
