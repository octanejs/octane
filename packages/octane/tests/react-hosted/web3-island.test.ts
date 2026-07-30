import { afterEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { OctaneCompat } from 'octane/react';
import { drainPassiveEffects } from '../../src/index';
import { executeHydrationFixture } from '../_hydration-ssr';
import { h, mountReactHost, reactAct } from './_react-host';
import { Web3HostContext } from './_fixtures/web3-host-context';
import {
	readWeb3IslandObservation,
	resetWeb3IslandObservation,
} from './_fixtures/web3-island-state';
import { Web3Island } from './_fixtures/web3-island.tsrx';

const observationIds = new Set<string>();
let mountedHost: Awaited<ReturnType<typeof mountReactHost>> | undefined;
let hydratedRoot: ReturnType<typeof hydrateRoot> | undefined;
let hydrationContainer: HTMLElement | undefined;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

function observe(id: string): string {
	observationIds.add(id);
	return id;
}

function nextTurns(turns = 2): Promise<void> {
	let pending = Promise.resolve();
	for (let index = 0; index < turns; index++) {
		pending = pending.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
	}
	return pending;
}

async function flushHostedEffects(): Promise<void> {
	await reactAct(async () => drainPassiveEffects());
}

function ReactWeb3Host(props: {
	label: string;
	observationId: string;
	rejectFirstConnection?: boolean;
	route: string;
	showIsland?: boolean;
}) {
	return h(
		'main',
		{ 'data-react-shell': props.route },
		h('h1', { id: 'react-route' }, `React route: ${props.route}`),
		h(
			Web3HostContext,
			{ value: props.route } as never,
			props.showIsland === false
				? h('p', { id: 'react-fallback' }, 'React owns this route')
				: h(OctaneCompat, {
						component: Web3Island,
						props: {
							label: props.label,
							observationId: props.observationId,
							rejectFirstConnection: props.rejectFirstConnection,
						},
					} as never),
		),
	);
}

afterEach(async () => {
	consoleErrorSpy?.mockRestore();
	consoleErrorSpy = undefined;
	if (mountedHost) {
		await mountedHost.unmount();
		mountedHost = undefined;
	}
	if (hydratedRoot) {
		await reactAct(async () => hydratedRoot?.unmount());
		hydratedRoot = undefined;
	}
	hydrationContainer?.remove();
	hydrationContainer = undefined;
	document.body.style.overflow = '';
	for (const id of observationIds) resetWeb3IslandObservation(id);
	observationIds.clear();
});

describe('incremental React adoption — Wagmi and RainbowKit island', () => {
	it('keeps React in control while the island connects, updates, navigates, and tears down', async () => {
		const id = observe('web3-client-journey');
		const uncaught: unknown[] = [];
		const mounted = (mountedHost = await mountReactHost(
			h(ReactWeb3Host, {
				label: 'Wallet controls',
				observationId: id,
				rejectFirstConnection: true,
				route: 'portfolio',
			}),
			{ onUncaughtError: (error) => uncaught.push(error) },
		));
		const shell = mounted.container.querySelector('main');
		const host = mounted.host();
		await flushHostedEffects();
		expect(shell?.getAttribute('data-react-shell')).toBe('portfolio');
		expect(host.parentElement).toBe(shell);
		expect(host.querySelector('#island-route')?.textContent).toBe('portfolio');
		expect(readWeb3IslandObservation(id).activeWatchers).toBeGreaterThan(0);

		const connectButton = host.querySelector('.rk-connect-button') as HTMLButtonElement;
		await reactAct(async () => connectButton.click());
		expect(document.body.style.overflow).toBe('hidden');
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();

		// The first deterministic connector request rejects inside the island.
		// RainbowKit owns the recovery UI; no error escapes into the React host.
		await reactAct(async () => {
			(document.querySelector('.rk-action') as HTMLButtonElement).click();
			await nextTurns();
		});
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			'Deterministic wallet rejection',
		);
		expect(uncaught).toEqual([]);
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();

		await reactAct(async () => {
			(document.querySelector('.rk-action') as HTMLButtonElement).click();
			await nextTurns();
		});
		expect(host.querySelector('#island-status')?.textContent).toBe('connected');
		expect(host.querySelector('#island-address')?.textContent).toBe(
			'0x0000000000000000000000000000000000000001',
		);
		expect(host.querySelector('#island-chain')?.textContent).toBe('1');
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.body.style.overflow).toBe('');
		expect(mounted.container.querySelector('main')).toBe(shell);

		await mounted.render(
			h(ReactWeb3Host, {
				label: 'Updated wallet controls',
				observationId: id,
				route: 'activity',
			}),
		);
		expect(mounted.container.querySelector('main')).toBe(shell);
		expect(shell?.getAttribute('data-react-shell')).toBe('activity');
		expect(host.querySelector('#island-label')?.textContent).toBe('Updated wallet controls');
		expect(host.querySelector('#island-route')?.textContent).toBe('activity');
		expect(host.querySelector('#island-status')?.textContent).toBe('connected');

		// Leave a focus-trapped account overlay open: React navigation must tear
		// it down with the island rather than leaking global document state.
		const accountButton = Array.from(
			host.querySelectorAll<HTMLButtonElement>('.rk-connect-button'),
		).find((button) => button.textContent?.includes('0x0000'))!;
		await reactAct(async () => accountButton.click());
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		expect(document.body.style.overflow).toBe('hidden');

		// React navigation removes the island without replacing its own shell.
		await mounted.render(
			h(ReactWeb3Host, {
				label: 'Updated wallet controls',
				observationId: id,
				route: 'settings',
				showIsland: false,
			}),
		);
		await nextTurns();
		await flushHostedEffects();
		expect(mounted.container.querySelector('main')).toBe(shell);
		expect(mounted.container.querySelector('#react-fallback')?.textContent).toBe(
			'React owns this route',
		);
		expect(document.querySelector('[data-octane-compat]')).toBeNull();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
		expect(document.body.style.overflow).toBe('');
		expect(readWeb3IslandObservation(id)).toEqual({ activeWatchers: 0, cleanups: 1 });
		expect(uncaught).toEqual([]);

		await mounted.unmount();
		mountedHost = undefined;
	});

	it('server-renders and hydrates the Web3 island without replacing its markup', async () => {
		const id = observe('web3-hydration');
		const props = {
			label: 'Hydrated wallet controls',
			observationId: id,
			rejectFirstConnection: false,
		};
		const serverHtml = await executeHydrationFixture<string>(
			'rainbowkit',
			'packages/octane/tests/react-hosted/_fixtures/web3-react-server.ts',
			'renderWeb3ReactPage',
			{ ...props, route: 'portfolio' },
		);
		const container = (hydrationContainer = document.createElement('div'));
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverHost = container.querySelector('[data-octane-compat]') as HTMLElement;
		const serverConnectButton = serverHost.querySelector('.rk-connect-button');
		expect(serverConnectButton?.textContent).toBe('Connect Wallet');

		const errors = (consoleErrorSpy = vi.spyOn(console, 'error'));
		await reactAct(async () => {
			hydratedRoot = hydrateRoot(
				container,
				h(ReactWeb3Host, { ...props, route: 'portfolio' }) as never,
			);
		});
		await flushHostedEffects();
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
		consoleErrorSpy = undefined;
		expect(container.querySelector('[data-octane-compat]')).toBe(serverHost);
		expect(serverHost.querySelector('.rk-connect-button')).toBe(serverConnectButton);
		expect(serverHost.querySelector('#island-route')?.textContent).toBe('portfolio');
		expect(readWeb3IslandObservation(id).activeWatchers).toBeGreaterThan(0);

		await reactAct(async () => (serverConnectButton as HTMLButtonElement).click());
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		await reactAct(async () => {
			(document.querySelector('.rk-action') as HTMLButtonElement).click();
			await nextTurns();
		});
		expect(serverHost.querySelector('#island-status')?.textContent).toBe('connected');
		expect(serverHost.querySelector('#island-address')?.textContent).toBe(
			'0x0000000000000000000000000000000000000001',
		);
		expect(serverHost.querySelector('#island-chain')?.textContent).toBe('1');
		expect(document.querySelector('[role="dialog"]')).toBeNull();

		await reactAct(async () => {
			hydratedRoot?.unmount();
		});
		hydratedRoot = undefined;
		await nextTurns();
		await flushHostedEffects();
		expect(readWeb3IslandObservation(id)).toEqual({ activeWatchers: 0, cleanups: 1 });
		container.remove();
		hydrationContainer = undefined;
	});
});
