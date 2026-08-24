/* eslint-disable react-hooks/rules-of-hooks */

import { address } from '@solana/kit';
import { UiWalletAccount } from '@wallet-standard/ui';

import { useSignTransaction, useSignTransactions } from '../useSignTransaction';

const mockWalletAccount = {
    address: address('123'),
    chains: ['solana:danknet', 'bitcoin:mainnet'] as const,
    features: [],
    publicKey: new Uint8Array([1, 2, 3]),
    '~uiWalletHandle': null as unknown as UiWalletAccount['~uiWalletHandle'],
} as const;

// [DESCRIBE] useSignTransaction.
{
    // It accepts any chain in the solana namespace
    useSignTransaction(mockWalletAccount, 'solana:danknet');
    useSignTransaction(mockWalletAccount, 'solana:basednet');

    // It accepts one of the chains actually supported by the wallet account
    useSignTransaction(mockWalletAccount, 'solana:danknet');

    // It rejects a chain in a non-Solana namespace
    useSignTransaction(
        mockWalletAccount,
        // @ts-expect-error Non-Solana chain
        'bitcoin:mainnet',
    );
}

// [DESCRIBE] useSignTransactions.
{
    // It accepts any chain in the solana namespace
    useSignTransactions(mockWalletAccount, 'solana:danknet');
    useSignTransactions(mockWalletAccount, 'solana:basednet');

    // It accepts one of the chains actually supported by the wallet account
    const signTransactions = useSignTransactions(mockWalletAccount, 'solana:danknet');
    signTransactions({ transaction: new Uint8Array() }, { transaction: new Uint8Array() }).catch(() => {});

    // It rejects a chain in a non-Solana namespace
    useSignTransactions(
        mockWalletAccount,
        // @ts-expect-error Non-Solana chain
        'bitcoin:mainnet',
    );
}
