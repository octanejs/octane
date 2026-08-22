import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import {
	BareGreetingApp,
	CommandState,
	DynamicCommandApp,
	GreetingApp,
	HeaderedCommandState,
	HeaderedGreetingApp,
} from '../_fixtures/commands.tsrx';
import { act, flush, mount } from '../_helpers';

type Call = { cmd: string; args: any };

function recordIPC(handler: (cmd: string, args: any) => unknown): Call[] {
	const calls: Call[] = [];
	mockIPC((cmd, args) => {
		calls.push({ cmd, args });
		return handler(cmd, args);
	});
	return calls;
}

const greetCalls = (calls: Call[]) => calls.filter((call) => call.cmd === 'greet');

/**
 * `mockIPC` drops `invoke`'s third argument, so headers are invisible through
 * it. Standing in as the bridge itself is what `invoke` actually calls, so this
 * observes exactly what would reach the host.
 */
function recordBridge(handler: (cmd: string, args: any) => unknown): HeadersInit[] {
	const headers: HeadersInit[] = [];
	(window as any).__TAURI_INTERNALS__ = {
		invoke: async (cmd: string, args: any, options?: { headers?: HeadersInit }) => {
			headers.push(options?.headers ?? {});
			return handler(cmd, args);
		},
	};
	return headers;
}

afterEach(async () => {
	// Settle any command still in flight so it cannot resolve against the next
	// test's mock bridge.
	await flush();
	clearMocks();
	delete (window as any).__TAURI_INTERNALS__;
});

describe('useInvoke', () => {
	it('suspends until the command resolves, then renders the payload', async () => {
		recordIPC((_cmd, args) => `hello ${args.name}`);
		const result = mount(GreetingApp, { name: 'ada' });

		expect(result.find('#fallback').textContent).toBe('loading');
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');
		result.unmount();
	});

	it('invokes once across the suspend and replay of one episode', async () => {
		const calls = recordIPC(() => 'hello');
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);

		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello');
		expect(greetCalls(calls)).toHaveLength(1);
		result.unmount();
	});

	it('does not re-invoke when a re-render rebuilds an equal args literal', async () => {
		const calls = recordIPC((_cmd, args) => `hello ${args.name}`);
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');

		result.update(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(greetCalls(calls)).toHaveLength(1);
		expect(result.find('#greeting').textContent).toBe('hello ada');
		result.unmount();
	});

	it('runs a command called with neither args nor options', async () => {
		const calls = recordIPC((cmd) => `ran ${cmd}`);
		const result = mount(BareGreetingApp);
		await act(flush);

		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('ran greet');
		// @tauri-apps/api defaults an omitted payload to an empty record.
		expect(greetCalls(calls)[0].args).toEqual({});
		result.unmount();
	});

	it('refetches on a changed command name even under explicit deps', async () => {
		recordIPC((cmd) => `ran ${cmd}`);
		const result = mount(DynamicCommandApp, { cmd: 'first', version: 1 });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#dynamic').textContent).toBe('ran first');

		// Explicit deps extend the command name rather than replacing it, so a
		// caller cannot accidentally pin the result of a command it stopped calling.
		result.update(DynamicCommandApp, { cmd: 'second', version: 1 });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#dynamic').textContent).toBe('ran second');
		result.unmount();
	});

	it('re-invokes when an argument value changes', async () => {
		const calls = recordIPC((_cmd, args) => `hello ${args.name}`);
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('hello ada');

		result.update(GreetingApp, { name: 'grace' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(greetCalls(calls)).toHaveLength(2);
		expect(result.find('#greeting').textContent).toBe('hello grace');
		result.unmount();
	});

	it('routes a rejected command to the error boundary', async () => {
		recordIPC(() => Promise.reject(new Error('command failed')));
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);

		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#caught').textContent).toBe('Error');
		result.unmount();
	});

	it('reports a missing Tauri host instead of hanging the boundary', async () => {
		const result = mount(GreetingApp, { name: 'ada' });
		await act(flush);

		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#caught').textContent).toBe('TauriUnavailableError');
		result.unmount();
	});
});

describe('useInvokeState', () => {
	it('starts pending and settles into the payload', async () => {
		recordIPC((_cmd, args) => `hello ${args.name}`);
		const result = mount(CommandState, { name: 'ada' });

		expect(result.find('#status').textContent).toBe('pending');
		await flush();
		expect(result.find('#status').textContent).toBe('success');
		expect(result.find('#data').textContent).toBe('hello ada');
		result.unmount();
	});

	it('re-runs the command on refetch', async () => {
		let greeting = 'first';
		const calls = recordIPC(() => greeting);
		const result = mount(CommandState, { name: 'ada' });
		await flush();

		greeting = 'second';
		result.click('#refetch');
		await flush();
		expect(greetCalls(calls)).toHaveLength(2);
		expect(result.find('#data').textContent).toBe('second');
		result.unmount();
	});

	it('returns to pending and clears data on refetch', async () => {
		recordIPC(() => 'first');
		const result = mount(CommandState, { name: 'ada' });
		await flush();
		expect(result.find('#data').textContent).toBe('first');

		// The README states refetch returns to pending and clears data. That has
		// to hold in the commit the click produces, not one effect drain later.
		result.click('#refetch');
		expect(result.find('#status').textContent).toBe('pending');
		expect(result.find('#data').textContent).toBe('');
		result.unmount();
	});

	it('never pairs new arguments with the previous command payload', async () => {
		recordIPC((_cmd, args) => `hello ${args.name}`);
		const result = mount(CommandState, { name: 'ada' });
		await flush();
		expect(result.find('#data').textContent).toBe('hello ada');

		// The README rules out stale-while-revalidate, so the very commit that
		// first observes the new args has to be pending already. Effects have not
		// been drained here on purpose: a reset deferred to one would let this
		// frame paint `ada`'s payload under `grace`.
		result.update(CommandState, { name: 'grace' });
		expect(result.find('#status').textContent).toBe('pending');
		expect(result.find('#data').textContent).toBe('');

		await flush();
		expect(result.find('#status').textContent).toBe('success');
		expect(result.find('#data').textContent).toBe('hello grace');
		result.unmount();
	});

	it('exposes a rejection without throwing', async () => {
		recordIPC(() => Promise.reject(new TypeError('nope')));
		const result = mount(CommandState, { name: 'ada' });
		await flush();

		expect(result.find('#status').textContent).toBe('error');
		expect(result.find('#error').textContent).toBe('TypeError');
		result.unmount();
	});

	it('reports a missing Tauri host as an error state', async () => {
		const result = mount(CommandState, { name: 'ada' });
		await flush();

		expect(result.find('#status').textContent).toBe('error');
		expect(result.find('#error').textContent).toBe('TauriUnavailableError');
		result.unmount();
	});
});

describe('headers', () => {
	it('refetches the suspending read when a header value rotates', async () => {
		const seen = recordBridge(() => 'ok');
		const result = mount(HeaderedGreetingApp, { token: 'first' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('ok');
		expect(seen).toEqual([{ Authorization: 'first' }]);

		// Headers reach the host on every request, so a rotated token has to issue
		// a new command rather than replay the memoized promise.
		result.update(HeaderedGreetingApp, { token: 'second' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('ok');
		expect(seen).toEqual([{ Authorization: 'first' }, { Authorization: 'second' }]);
		result.unmount();
	});

	it('does not refetch when a re-render rebuilds an equal headers literal', async () => {
		const seen = recordBridge(() => 'ok');
		const result = mount(HeaderedGreetingApp, { token: 'first' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('ok');

		// The key is by value, matching the argument record, so the inline literal
		// every render allocates does not count as a change.
		result.update(HeaderedGreetingApp, { token: 'first' });
		await act(flush);
		expect(result.container.querySelector('#fallback')).toBeNull();
		expect(result.find('#greeting').textContent).toBe('ok');
		expect(seen).toHaveLength(1);
		result.unmount();
	});

	it('re-runs the non-suspending read when a header value rotates', async () => {
		const seen = recordBridge(() => 'ok');
		const result = mount(HeaderedCommandState, { token: 'first' });
		await flush();
		expect(result.find('#status').textContent).toBe('success');

		result.update(HeaderedCommandState, { token: 'second' });
		await flush();
		expect(seen).toEqual([{ Authorization: 'first' }, { Authorization: 'second' }]);
		result.unmount();
	});
});
