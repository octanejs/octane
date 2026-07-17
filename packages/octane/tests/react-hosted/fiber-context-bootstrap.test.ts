/**
 * Phase 0 spike — §6.1: Fiber provider discovery, isolated in
 * `_fiber-adapter.ts` (the only Fiber-touching module).
 *
 * The adapter is bootstrap-only: it reads the committed nearest-provider value
 * once per discovery epoch so first mount/hydration avoids a blank/retry
 * cycle. It never subscribes — `React.use(context)` in the wrapper render is
 * the propagation mechanism (see host-bridge and use-context-retention tests).
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { h, mountReactHost, reactAct } from './_react-host.js';
import {
	findStampedFiber,
	readNearestProviderValue,
	resolveCurrentFiber,
} from './_fiber-adapter.js';

const Ctx = React.createContext<string | undefined>('ctx-default');

function HostProbe(props: { children?: React.ReactNode }) {
	return h('div', { 'data-probe-host': '' }, props.children);
}

function probeHost(container: HTMLElement): HTMLElement {
	const host = container.querySelector('[data-probe-host]');
	if (host === null) throw new Error('probe host missing');
	return host as HTMLElement;
}

describe('react-hosted island — Fiber provider discovery (§6.1)', () => {
	it('reads the committed nearest-provider value from the host stamp', async () => {
		const mounted = await mountReactHost(h(Ctx, { value: 'committed' } as any, h(HostProbe)));
		const read = readNearestProviderValue(probeHost(mounted.container), Ctx);
		expect(read).toMatchObject({ found: true, value: 'committed' });
		await mounted.unmount();
	});

	it('resolves the current Fiber across repeated provider updates (stale alternate stamps)', async () => {
		// The DOM stamp keeps pointing at the Fiber that created the node; after
		// an update that Fiber can be the non-current alternate. The adapter must
		// resolve the committed branch through the HostRoot on every read.
		let setValue!: (value: string) => void;
		function App() {
			const [value, set] = React.useState('v0');
			setValue = set;
			return h(Ctx, { value } as any, h(HostProbe));
		}
		const mounted = await mountReactHost(h(App));
		const host = probeHost(mounted.container);

		let sawStaleStamp = false;
		for (let round = 1; round <= 4; round++) {
			await reactAct(async () => setValue(`v${round}`));
			const read = readNearestProviderValue(host, Ctx);
			expect(read.found).toBe(true);
			expect(read.value).toBe(`v${round}`);
			if (read.stampWasStale) sawStaleStamp = true;
		}
		// The loop must have exercised the alternate-resolution path at least
		// once — otherwise this test would pass even with resolution deleted.
		expect(sawStaleStamp).toBe(true);
		await mounted.unmount();
	});

	it('finds the NEAREST provider under nesting', async () => {
		const mounted = await mountReactHost(
			h(
				Ctx,
				{ value: 'outer' } as any,
				h(Ctx, { value: 'inner' } as any, h(HostProbe)),
				h(HostProbe),
			),
		);
		const hosts = mounted.container.querySelectorAll('[data-probe-host]');
		expect(readNearestProviderValue(hosts[0] as HTMLElement, Ctx).value).toBe('inner');
		expect(readNearestProviderValue(hosts[1] as HTMLElement, Ctx).value).toBe('outer');
		await mounted.unmount();
	});

	it('distinguishes an explicit undefined provider value from a missing provider', async () => {
		const withProvider = await mountReactHost(h(Ctx, { value: undefined } as any, h(HostProbe)));
		expect(readNearestProviderValue(probeHost(withProvider.container), Ctx)).toMatchObject({
			found: true,
			value: undefined,
		});
		await withProvider.unmount();

		const withoutProvider = await mountReactHost(h(HostProbe));
		// No public default-value accessor exists: the adapter reports "not
		// found" and the caller uses the HostContextRequest handshake — it must
		// NOT infer the default from `context._currentValue` (§6.2 step 5).
		expect(readNearestProviderValue(probeHost(withoutProvider.container), Ctx)).toMatchObject({
			found: false,
		});
		await withoutProvider.unmount();
	});

	it('degrades to not-found for a node no React renderer stamped', () => {
		const orphan = document.createElement('div');
		expect(findStampedFiber(orphan)).toBeNull();
		expect(readNearestProviderValue(orphan, Ctx)).toMatchObject({ found: false });
	});

	it('returns null instead of a Fiber from a torn-down tree', async () => {
		const mounted = await mountReactHost(h(Ctx, { value: 'gone' } as any, h(HostProbe)));
		const host = probeHost(mounted.container);
		const stamped = findStampedFiber(host);
		expect(stamped).not.toBeNull();
		await mounted.unmount();
		// After unmount the stamped Fiber is no longer on any current tree; the
		// resolver must refuse it rather than serve a detached provider chain.
		expect(resolveCurrentFiber(stamped)).toBeNull();
	});
});
