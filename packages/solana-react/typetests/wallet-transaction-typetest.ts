import {
	createTransactionExecutor,
	createWalletStore,
	type TransactionContext,
	type TransactionResult,
	type WalletAccount,
	type WalletRegistry,
	type WalletSnapshot,
} from '../src/index.ts';

declare function expectType<T>(value: T): void;

const registry = null as unknown as WalletRegistry;
const account = null as unknown as WalletAccount;

{
	const store = createWalletStore(registry);
	expectType<() => WalletSnapshot>(store.getSnapshot);
	expectType<(listener: () => void) => () => void>(store.subscribe);
	expectType<(next: WalletAccount | null) => void>(store.select);
	store.select(account);
	store.select(null);
}

{
	const executor = createTransactionExecutor<string, Uint8Array, string>({
		getContext(): TransactionContext<string> {
			return {
				account: 'acct',
				cluster: 'solana:danknet',
				wallet: 'Mock',
				payload: 'ix',
			};
		},
		async sign(context) {
			expectType<string>(context.payload);
			return new Uint8Array([1]);
		},
		async send(signed) {
			expectType<Uint8Array>(signed);
			return 'sig';
		},
		async confirm(signature) {
			expectType<string>(signature);
		},
	});
	expectType<() => Promise<TransactionResult<string>>>(executor);
}

{
	// @ts-expect-error createWalletStore accepts a WalletRegistry, not a config object
	createWalletStore({ registry });
}

{
	// @ts-expect-error createTransactionExecutor requires getContext
	createTransactionExecutor({});
}
