import type { UiWallet, UiWalletAccount } from '@wallet-standard/react';
import React from 'react';

import type { useSelectedWalletAccount } from '../selectedWalletAccountContext';
import { SelectedWalletAccountContextProvider } from '../SelectedWalletAccountContextProvider';

// [DESCRIBE] SelectedWalletAccountContextProvider
{
    // It accepts correct props
    {
        React.createElement(SelectedWalletAccountContextProvider, {
            children: React.createElement('div', null),
            filterWallets: (_wallet: UiWallet) => true,
            stateSync: {
                deleteSelectedWallet: () => {},
                getSelectedWallet: () => null,
                storeSelectedWallet: (_accountKey: string) => {},
            },
        });
    }

    // It requires `filterWallet` to return a boolean
    {
        React.createElement(SelectedWalletAccountContextProvider, {
            children: React.createElement('div', null),
            // @ts-expect-error filterWallet must return a boolean
            filterWallets: (_wallet: UiWallet) => 'not a boolean',
            stateSync: {
                deleteSelectedWallet: () => {},
                getSelectedWallet: () => null,
                storeSelectedWallet: (_accountKey: string) => {},
            },
        });
    }
}

// [DESCRIBE] useSelectedWalletAccount
{
    type CtxValue = ReturnType<typeof useSelectedWalletAccount>;

    // It returns selected wallet account
    {
        type SelectedWallet = CtxValue[0];
        undefined satisfies SelectedWallet;
        null as unknown as UiWalletAccount satisfies SelectedWallet;
    }

    // It returns a setter
    {
        type SetSelected = CtxValue[1];

        const setSelected = null as unknown as SetSelected;
        // Positive: setter accepts undefined
        setSelected(undefined);
        // Positive: setter accepts an updater function
        setSelected(prev => prev);
        // Positive: setter accepts a UiWalletAccount value
        setSelected({} as UiWalletAccount);
        // Negative: setter rejects invalid types
        setSelected(
            // @ts-expect-error must be of correct type
            'not a wallet account or undefined',
        );
    }

    // It returns filtered wallets
    {
        type FilteredWallets = CtxValue[2];
        const filteredWallets = null as unknown as FilteredWallets;
        filteredWallets satisfies UiWallet[];
    }
}
