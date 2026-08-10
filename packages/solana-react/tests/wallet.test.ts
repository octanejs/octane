import { describe, expect, it, vi } from 'vitest';
import { createWalletStore } from '../src/wallet';
import type { WalletRegistry } from '../src/wallet';

function registry(initial: unknown[]): WalletRegistry & {
	values: unknown[];
	emit(): void;
	disposed: ReturnType<typeof vi.fn>;
	lateListeners: (() => void)[];
} {
	const listeners = new Set<() => void>();
	const disposed = vi.fn();
	return {
		values: initial,
		disposed,
		lateListeners: [],
		get() {
			return this.values;
		},
		on(_event, listener) {
			listeners.add(listener);
			this.lateListeners.push(listener);
			return () => {
				listeners.delete(listener);
				disposed();
			};
		},
		emit() {
			for (const listener of listeners) listener();
		},
	};
}

function eventsFeature() {
	const listeners = new Set<() => void>();
	const lateListeners: (() => void)[] = [];
	const disposed = vi.fn();
	return {
		feature: {
			version: '1.0.0',
			on(_event: 'change', listener: () => void) {
				listeners.add(listener);
				lateListeners.push(listener);
				return () => {
					listeners.delete(listener);
					disposed();
				};
			},
		},
		emit() {
			for (const listener of listeners) listener();
		},
		lateListeners,
		disposed,
	};
}

function account(address: string, chains = ['solana:devnet']) {
	return { address, chains, features: ['solana:signTransaction'] };
}

function wallet(name: string, accounts = [account('A')], features = {}) {
	return { name, features, accounts };
}

describe('wallet boundary', () => {
	it('validates, deduplicates, selects, and discards replaced-registry events', () => {
		const first = registry([wallet('Test'), { malformed: true }]);
		const second = registry([]);
		const store = createWalletStore(first);
		const listener = vi.fn();
		store.subscribe(listener);
		const initialSnapshot = store.getSnapshot();
		expect(store.getSnapshot()).toBe(initialSnapshot);
		const account = initialSnapshot.wallets[0]!.accounts[0]!;
		store.select(account);
		expect(store.getSnapshot()).not.toBe(initialSnapshot);
		expect(store.getSnapshot().selected?.address).toBe('A');
		first.emit();
		expect(listener).toHaveBeenCalledOnce();
		store.replaceRegistry(second);
		expect(first.disposed).toHaveBeenCalledTimes(2);
		first.emit();
		expect(store.getSnapshot().wallets).toEqual([]);
	});

	it('keeps only Solana chains and discards accounts without one', () => {
		const store = createWalletStore(
			registry([
				wallet('Mixed', [
					account('solana', ['ethereum:1', 'solana:mainnet', 'solana:devnet']),
					account('ethereum', ['ethereum:1']),
				]),
			]),
		);

		expect(store.getSnapshot().wallets[0]?.accounts).toEqual([
			{
				address: 'solana',
				chains: ['solana:mainnet', 'solana:devnet'],
				features: ['solana:signTransaction'],
			},
		]);
	});

	it('rebinds selection to a refreshed account from the same wallet', () => {
		const source = wallet('Test');
		const sourceRegistry = registry([source]);
		const store = createWalletStore(sourceRegistry);
		const selected = store.getSnapshot().wallets[0]!.accounts[0]!;
		store.select(selected);

		source.accounts = [account('A', ['solana:mainnet'])];
		sourceRegistry.emit();

		expect(store.getSnapshot().selected).not.toBe(selected);
		expect(store.getSnapshot().selected).toBe(store.getSnapshot().wallets[0]!.accounts[0]);
		expect(store.getSnapshot().selected?.chains).toEqual(['solana:mainnet']);
	});

	it('clears selection when its wallet disappears despite a matching address', () => {
		const firstWallet = wallet('First');
		const secondWallet = wallet('Second');
		const sourceRegistry = registry([firstWallet, secondWallet]);
		const store = createWalletStore(sourceRegistry);
		store.select(store.getSnapshot().wallets[0]!.accounts[0]!);

		sourceRegistry.values = [secondWallet];
		sourceRegistry.emit();

		expect(store.getSnapshot().selected).toBeNull();
	});

	it('refreshes from wallet change events without duplicate notifications', () => {
		const events = eventsFeature();
		const source = wallet('Test', [account('A')], { 'standard:events': events.feature });
		const store = createWalletStore(registry([source]));
		const listener = vi.fn();
		store.subscribe(listener);

		events.emit();
		expect(listener).not.toHaveBeenCalled();

		source.accounts = [account('B')];
		events.emit();
		expect(store.getSnapshot().wallets[0]?.accounts[0]?.address).toBe('B');
		expect(listener).toHaveBeenCalledOnce();
	});

	it('cleans wallet listeners and ignores callbacks from older generations', () => {
		const firstEvents = eventsFeature();
		const secondEvents = eventsFeature();
		const first = registry([
			wallet('First', [account('A')], { 'standard:events': firstEvents.feature }),
		]);
		const second = registry([
			wallet('Second', [account('B')], { 'standard:events': secondEvents.feature }),
		]);
		const store = createWalletStore(first);
		const staleChange = firstEvents.lateListeners[0]!;

		store.replaceRegistry(second);
		expect(firstEvents.disposed).toHaveBeenCalledOnce();
		staleChange();
		expect(store.getSnapshot().wallets[0]?.name).toBe('Second');

		store.dispose();
		expect(secondEvents.disposed).toHaveBeenCalledOnce();
		const snapshot = store.getSnapshot();
		secondEvents.lateListeners[0]!();
		expect(store.getSnapshot()).toBe(snapshot);
	});

	it('ignores malformed or unsupported wallet event features', () => {
		expect(() =>
			createWalletStore(
				registry([
					wallet('Missing on', [account('A')], {
						'standard:events': { version: '1.0.0' },
					}),
					wallet('Unsupported', [account('B')], {
						'standard:events': { version: '2.0.0', on: vi.fn() },
					}),
				]),
			),
		).not.toThrow();
	});
});
