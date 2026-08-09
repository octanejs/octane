export type SolanaChain = `solana:${string}`;
export type WalletAccount = Readonly<{
	address: string;
	chains: readonly SolanaChain[];
	features: readonly string[];
}>;
export type Wallet = Readonly<{
	name: string;
	accounts: readonly WalletAccount[];
	features: Readonly<Record<string, unknown>>;
}>;
export interface WalletRegistry {
	get(): readonly unknown[];
	on(event: 'register' | 'unregister', listener: (...wallets: unknown[]) => void): () => void;
}
export type WalletSnapshot = Readonly<{
	wallets: readonly Wallet[];
	selected: WalletAccount | null;
}>;

type NormalizedWallet = Readonly<{
	source: object;
	wallet: Wallet;
	accounts: readonly Readonly<{ source: object; account: WalletAccount }>[];
}>;
type Selection = Readonly<{
	wallet: object;
	account: object;
	address: string;
}>;
type EventsFeature = Readonly<{
	version: string;
	on(event: 'change', listener: () => void): () => void;
}>;

function normalizeWallet(value: unknown): NormalizedWallet | null {
	if (!value || typeof value !== 'object') return null;
	const input = value as Record<string, unknown>;
	if (
		typeof input.name !== 'string' ||
		!Array.isArray(input.accounts) ||
		!input.features ||
		typeof input.features !== 'object'
	)
		return null;
	const accounts = input.accounts.flatMap((account) => {
		if (!account || typeof account !== 'object') return [];
		const candidate = account as Record<string, unknown>;
		if (
			typeof candidate.address !== 'string' ||
			!Array.isArray(candidate.chains) ||
			!Array.isArray(candidate.features)
		)
			return [];
		if (!candidate.features.every((feature) => typeof feature === 'string')) return [];
		const chains = candidate.chains.filter(
			(chain): chain is SolanaChain => typeof chain === 'string' && chain.startsWith('solana:'),
		);
		if (chains.length === 0) return [];
		return [
			{
				source: account,
				account: {
					address: candidate.address,
					chains,
					features: [...candidate.features],
				},
			},
		];
	});
	return {
		source: value,
		wallet: {
			name: input.name,
			accounts: accounts.map(({ account }) => account),
			features: { ...(input.features as Record<string, unknown>) },
		},
		accounts,
	};
}

function getEventsFeature(wallet: Wallet): EventsFeature | null {
	const value = wallet.features['standard:events'];
	if (!value || typeof value !== 'object') return null;
	const feature = value as Partial<EventsFeature>;
	if (feature.version !== '1.0.0' || typeof feature.on !== 'function') return null;
	return feature as EventsFeature;
}

function walletsEqual(previous: readonly Wallet[], next: readonly Wallet[]): boolean {
	if (previous.length !== next.length) return false;
	return next.every((wallet, index) => {
		const prior = previous[index];
		if (!prior || prior.name !== wallet.name || prior.accounts.length !== wallet.accounts.length)
			return false;
		for (let accountIndex = 0; accountIndex < wallet.accounts.length; accountIndex++) {
			const account = wallet.accounts[accountIndex]!;
			const priorAccount = prior.accounts[accountIndex]!;
			if (
				account.address !== priorAccount.address ||
				account.chains.length !== priorAccount.chains.length ||
				account.features.length !== priorAccount.features.length ||
				account.chains.some((chain, chainIndex) => chain !== priorAccount.chains[chainIndex]) ||
				account.features.some(
					(feature, featureIndex) => feature !== priorAccount.features[featureIndex],
				)
			)
				return false;
		}
		const featureNames = Object.keys(wallet.features);
		const priorFeatureNames = Object.keys(prior.features);
		return (
			featureNames.length === priorFeatureNames.length &&
			featureNames.every(
				(name, featureIndex) =>
					name === priorFeatureNames[featureIndex] &&
					Object.is(wallet.features[name], prior.features[name]),
			)
		);
	});
}

export function createWalletStore(registry?: WalletRegistry) {
	let generation = 0;
	let walletListenerEpoch = 0;
	let selection: Selection | null = null;
	let selected: WalletAccount | null = null;
	let wallets: readonly Wallet[] = [];
	let normalizedWallets: readonly NormalizedWallet[] = [];
	let snapshot: WalletSnapshot = { wallets, selected };
	const listeners = new Set<() => void>();
	let registryDisposers: (() => void)[] = [];
	let walletDisposers: (() => void)[] = [];
	let walletListenerSources: readonly Readonly<{
		source: object;
		events: EventsFeature | null;
	}>[] = [];

	const clearWalletListeners = () => {
		walletListenerEpoch++;
		for (const dispose of walletDisposers) dispose();
		walletDisposers = [];
		walletListenerSources = [];
	};

	const refresh = (values: readonly unknown[], eventGeneration: number) => {
		if (eventGeneration !== generation) return;
		const next = values.flatMap((value) => normalizeWallet(value) ?? []);
		const nextWallets = next.map(({ wallet }) => wallet);
		const currentSelection = selection;
		const selectedEntry =
			currentSelection === null
				? null
				: (next
						.find(({ source }) => source === currentSelection.wallet)
						?.accounts.find(({ account }) => account.address === currentSelection.address) ?? null);
		const nextSelected =
			selectedEntry === null
				? null
				: selectedEntry.source === currentSelection?.account
					? selected
					: selectedEntry.account;
		if (selection && selectedEntry) selection = { ...selection, account: selectedEntry.source };
		else if (selection) selection = null;

		const nextListenerSources = next.map(({ source, wallet }) => ({
			source,
			events: getEventsFeature(wallet),
		}));
		const listenersChanged =
			nextListenerSources.length !== walletListenerSources.length ||
			nextListenerSources.some(
				(value, index) =>
					value.source !== walletListenerSources[index]?.source ||
					value.events !== walletListenerSources[index]?.events,
			);
		if (listenersChanged) {
			clearWalletListeners();
			walletListenerSources = nextListenerSources;
			const listenerEpoch = walletListenerEpoch;
			for (const { events } of nextListenerSources) {
				if (!events) continue;
				const dispose = events.on('change', () => {
					if (eventGeneration !== generation || listenerEpoch !== walletListenerEpoch) return;
					refresh(registry?.get() ?? [], eventGeneration);
				});
				if (typeof dispose === 'function') walletDisposers.push(dispose);
			}
		}

		normalizedWallets = next;
		if (walletsEqual(wallets, nextWallets) && Object.is(nextSelected, selected)) return;
		wallets = nextWallets;
		selected = nextSelected;
		snapshot = { wallets, selected };
		for (const listener of listeners) listener();
	};

	const replaceRegistry = (next?: WalletRegistry) => {
		generation++;
		clearWalletListeners();
		for (const dispose of registryDisposers) dispose();
		registryDisposers = [];
		registry = next;
		const currentGeneration = generation;
		refresh(registry?.get() ?? [], currentGeneration);
		if (registry) {
			const refreshRegistry = () => refresh(registry!.get(), currentGeneration);
			registryDisposers = [
				registry.on('register', refreshRegistry),
				registry.on('unregister', refreshRegistry),
			];
		}
	};
	replaceRegistry(registry);

	return {
		getSnapshot: (): WalletSnapshot => snapshot,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		replaceRegistry,
		select(account: WalletAccount | null) {
			const owner = account
				? normalizedWallets.find(({ wallet }) => wallet.accounts.includes(account))
				: null;
			if (account && !owner) throw new Error('Cannot select an undiscovered wallet account');
			if (Object.is(selected, account)) return;
			const accountSource = account
				? owner?.accounts.find(({ account: candidate }) => candidate === account)?.source
				: null;
			selection =
				account && owner && accountSource
					? { wallet: owner.source, account: accountSource, address: account.address }
					: null;
			selected = account;
			snapshot = { wallets, selected };
			for (const listener of listeners) listener();
		},
		dispose() {
			replaceRegistry();
			listeners.clear();
		},
	};
}
export type WalletStore = ReturnType<typeof createWalletStore>;
